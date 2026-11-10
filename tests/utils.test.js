/**
 * tests/utils.test.js
 * -----------------------------------------------------------------------------
 * Tests for ApiError, asyncHandler and the response envelope helpers.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Imports must be at the top level: `await` is not permitted inside a
// describe() callback, which is a plain synchronous function.
const { default: ApiError } = await import("../src/utils/ApiError.js");
const { default: asyncHandler } = await import("../src/utils/asyncHandler.js");
const { sendSuccess, ok, created } = await import("../src/utils/response.js");

describe("ApiError", () => {

  test("carries a status code and a message", () => {
    // Build an error with an explicit status.
    const error = new ApiError(418, "I am a teapot");
    // Assert the status was kept.
    assert.equal(error.statusCode, 418);
    // Assert the message was kept.
    assert.equal(error.message, "I am a teapot");
    // Assert it is marked operational (expected, not a bug).
    assert.equal(error.isOperational, true);
  });

  test("badRequest() produces 400", () => {
    // Use the factory.
    const error = ApiError.badRequest("Nope");
    // Assert the status.
    assert.equal(error.statusCode, 400);
  });

  test("unauthorized() produces 401", () => {
    // Use the factory.
    assert.equal(ApiError.unauthorized().statusCode, 401);
  });

  test("forbidden() produces 403", () => {
    // Use the factory.
    assert.equal(ApiError.forbidden().statusCode, 403);
  });

  test("notFound() produces 404", () => {
    // Use the factory.
    assert.equal(ApiError.notFound().statusCode, 404);
  });

  test("conflict() produces 409", () => {
    // Use the factory.
    assert.equal(ApiError.conflict().statusCode, 409);
  });

  test("tooManyRequests() produces 429", () => {
    // Use the factory.
    assert.equal(ApiError.tooManyRequests().statusCode, 429);
  });

  test("serviceUnavailable() produces 503", () => {
    // Use the factory.
    assert.equal(ApiError.serviceUnavailable().statusCode, 503);
  });

  test("preserves field level validation details", () => {
    // Build a validation style error.
    const error = ApiError.badRequest("Validation failed", [{ field: "email", message: "Required" }]);
    // Assert the details survived.
    assert.deepEqual(error.errors, [{ field: "email", message: "Required" }]);
  });
});

describe("asyncHandler", () => {

  test("calls next() with the error when the promise rejects", async () => {
    // A fake error to reject with.
    const failure = new Error("boom");
    // A handler that always rejects.
    const handler = async () => {
      throw failure;
    };
    // Wrap the handler.
    const wrapped = asyncHandler(handler);

    // Capture what next() receives.
    let forwarded = null;
    // A fake next function.
    const next = (error) => {
      forwarded = error;
    };

    // Run the wrapped handler and await its resolution.
    await wrapped({}, {}, next);

    // Assert the exact error object was forwarded.
    assert.equal(forwarded, failure);
  });

  test("does not call next() when the promise resolves", async () => {
    // A handler that resolves normally.
    const wrapped = asyncHandler(async (req, res) => {
      // Mark the handler as having run.
      res.ran = true;
    });

    // Track whether next() was called.
    let called = false;
    // Run the wrapped handler.
    await wrapped({}, { ran: false }, () => {
      called = true;
    });

    // Assert next() was never called.
    assert.equal(called, false);
  });
});

describe("response envelope", () => {

  /**
   * Builds a fake Express response object that records what was sent.
   * This avoids needing supertest for simple envelope tests.
   */
  const fakeRes = () => {
    // Recorded state.
    const record = { statusCode: null, body: null };
    // Return the fake response plus a status chain that mimics Express.
    return Object.assign(record, {
      // Express chainable status method.
      status(code) {
        // Record the code.
        record.statusCode = code;
        // Return this so .json() can be chained.
        return this;
      },
      // Express json method.
      json(body) {
        // Record the body.
        record.body = body;
        // Return this for chaining.
        return this;
      },
    });
  };

  test("sendSuccess writes the standard envelope", () => {
    // Create the fake response.
    const res = fakeRes();
    // Send a success response.
    sendSuccess(res, 200, "All good", { id: 1 }, { total: 1 });

    // Assert the status code.
    assert.equal(res.statusCode, 200);
    // Assert the success flag.
    assert.equal(res.body.success, true);
    // Assert the message.
    assert.equal(res.body.message, "All good");
    // Assert the payload.
    assert.deepEqual(res.body.data, { id: 1 });
    // Assert the metadata.
    assert.deepEqual(res.body.meta, { total: 1 });
  });

  test("sendSuccess omits meta when it is not supplied", () => {
    // Create the fake response.
    const res = fakeRes();
    // Send without metadata.
    sendSuccess(res, 200, "No meta", { a: 1 });
    // Assert meta is absent entirely (not just undefined).
    assert.equal("meta" in res.body, false);
  });

  test("ok() returns 200 and created() returns 201", () => {
    // Check both helpers.
    assert.equal(ok(fakeRes(), "msg", {}).statusCode, 200);
    assert.equal(created(fakeRes(), "msg", {}).statusCode, 201);
  });
});
