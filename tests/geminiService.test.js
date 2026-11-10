/**
 * tests/geminiService.test.js
 * -----------------------------------------------------------------------------
 * Tests for the Gemini service: the assistant persona, the context builder and
 * the provider error classification.
 *
 * NOTE: `generateAssistantReply()` itself requires a real GEMINI_API_KEY, so it
 * is NOT asserted here. That path is documented as unverified in
 * docs/POSTMAN_TESTING.md. Everything that can be tested without a key is.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import the module under test.
const gemini = await import("../src/services/geminiService.js");
// Import the prompt builder directly for focused assertions.
const { SYSTEM_INSTRUCTION, buildContextBlock } = await import("../src/data/assistantPrompt.js");
// Import the error class.
const { default: ApiError } = await import("../src/utils/ApiError.js");

describe("assistant system instruction", () => {
  test("exists and is substantial", () => {
    // Assert the instruction is a long string.
    assert.ok(typeof SYSTEM_INSTRUCTION === "string" && SYSTEM_INSTRUCTION.length > 200);
  });

  test("states the assistant is not a certified expert", () => {
    // Assert the non-expert disclaimer is present.
    assert.ok(/not a certified agricultural expert/i.test(SYSTEM_INSTRUCTION));
  });

  test("forbids specific pesticide and chemical dosage recommendations", () => {
    // Assert the chemical dosage prohibition is present.
    assert.ok(/NEVER recommend a specific pesticide/i.test(SYSTEM_INSTRUCTION));
  });

  test("forbids exact fertilizer quantities", () => {
    // Assert the fertilizer dose prohibition is present.
    assert.ok(/Do NOT give exact fertilizer quantities/i.test(SYSTEM_INSTRUCTION));
  });

  test("forbids fabricated government scheme information", () => {
    // Assert the scheme fabrication prohibition is present.
    assert.ok(/Do NOT fabricate government schemes/i.test(SYSTEM_INSTRUCTION));
  });

  test("forbids guaranteed yield or income claims", () => {
    // Assert the no-guarantee rule is present.
    assert.ok(/Never guarantee a yield/i.test(SYSTEM_INSTRUCTION));
  });

  test("requires uncertainty to be communicated", () => {
    // Assert the uncertainty rule is present.
    assert.ok(/If the information is uncertain/i.test(SYSTEM_INSTRUCTION));
  });

  test("directs high-risk decisions to qualified experts", () => {
    // Assert the escalation rule is present.
    assert.ok(/qualified local expert/i.test(SYSTEM_INSTRUCTION));
  });
});

describe("farmer context block", () => {
  test("returns an empty string for an empty profile", () => {
    // Build with no data.
    assert.equal(buildContextBlock({}), "");
    // Build with nothing at all.
    assert.equal(buildContextBlock(null), "");
  });

  test("includes the farm fields that were provided", () => {
    // Build a context block from a sample profile.
    const block = buildContextBlock({
      fullName: "Aarav Patil",
      location: "Nashik, Maharashtra",
      soilType: "Loamy",
      currentCrop: "Tomato",
      season: "Rabi",
    });

    // Each provided value must appear in the block.
    assert.ok(block.includes("Aarav Patil"));
    assert.ok(block.includes("Nashik, Maharashtra"));
    assert.ok(block.includes("Loamy"));
    assert.ok(block.includes("Tomato"));
    assert.ok(block.includes("Rabi"));
  });

  test("formats the farm size with its unit", () => {
    // Build a block with a farm size.
    const block = buildContextBlock({ farmSize: 2.5, farmSizeUnit: "hectare" });
    // Assert the value and unit are both present.
    assert.ok(block.includes("2.5 hectare"));
  });

  test("skips empty fields instead of writing 'undefined'", () => {
    // Build a block with several empty values.
    const block = buildContextBlock({ fullName: "Test", location: "", state: null, district: undefined });
    // Assert no "undefined" leaked into the text.
    assert.ok(!block.includes("undefined"), "no undefined values should be rendered");
    // Assert no "null" leaked into the text.
    assert.ok(!block.includes("null"));
  });

  test("ignores a non-numeric farm size", () => {
    // Build a block with a bad farm size.
    const block = buildContextBlock({ farmSize: "abc" });
    // Assert the block is empty because nothing valid was supplied.
    assert.equal(block, "");
  });

  test("tells the model to ask rather than guess when data is missing", () => {
    // Build a partial block.
    const block = buildContextBlock({ soilType: "Loamy" });
    // Assert the instruction to ask clarifying questions is present.
    assert.ok(/ask a short clarifying question/i.test(block));
  });
});

describe("gemini error classification", () => {
  test("maps a 429 to a 429 ApiError with a retry message", () => {
    // Simulate a quota error.
    const error = gemini.classifyGeminiError({ status: 429, message: "Resource exhausted" });
    // Assert the status.
    assert.equal(error.statusCode, 429);
    // Assert the message tells the user to retry.
    assert.ok(/try again/i.test(error.message));
  });

  test("maps a quota message without a status code to 429", () => {
    // Simulate a quota error with no status.
    const error = gemini.classifyGeminiError({ message: "quota exceeded for this project" });
    // Assert the status.
    assert.equal(error.statusCode, 429);
  });

  test("maps an unknown model to 503", () => {
    // Simulate a bad model name.
    const error = gemini.classifyGeminiError({ status: 400, message: "model not found" });
    // Assert the status.
    assert.equal(error.statusCode, 503);
  });

  test("maps an invalid API key to 503", () => {
    // Simulate a key permission error.
    const error = gemini.classifyGeminiError({ status: 403, message: "API key not valid" });
    // Assert the status.
    assert.equal(error.statusCode, 503);
    // Assert the message does not leak the key or the provider text.
    assert.ok(!error.message.includes("API key not valid"));
  });

  test("maps a provider outage to 503", () => {
    // Simulate a 500 from Google.
    const error = gemini.classifyGeminiError({ status: 500, message: "Internal error" });
    // Assert the status.
    assert.equal(error.statusCode, 503);
  });

  test("maps a timeout to 503", () => {
    // Simulate a network timeout.
    const error = gemini.classifyGeminiError({ code: "ECONNABORTED", message: "timeout of 8000ms exceeded" });
    // Assert the status.
    assert.equal(error.statusCode, 503);
  });

  test("maps an unexpected error to a safe 503 without leaking details", () => {
    // Simulate an unknown failure containing sensitive-looking text.
    const error = gemini.classifyGeminiError({ message: "secret internal detail leaked" });
    // Assert a 503 status.
    assert.equal(error.statusCode, 503);
    // Assert the provider text was NOT forwarded to the client.
    assert.ok(!error.message.includes("secret internal detail"));
  });

  test("every returned error is operational", () => {
    // Classify a range of errors.
    for (const input of [{ status: 429 }, { status: 400, message: "x" }, { status: 500 }, {}]) {
      // Classify the error.
      const error = gemini.classifyGeminiError(input);
      // Assert it is marked operational.
      assert.equal(error.isOperational, true);
    }
  });
});

describe("configuration reporting", () => {
  test("exposes an isGeminiConfigured() flag", () => {
    // Assert the flag is a boolean.
    assert.equal(typeof gemini.isGeminiConfigured(), "boolean");
  });

  test("reports not-configured when no key is present", async () => {
    // Read the raw key from the environment.
    const key = process.env.GEMINI_API_KEY;
    // Only assert when the key is genuinely absent.
    if (!key) {
      // Assert the flag is false.
      assert.equal(gemini.isGeminiConfigured(), false);
    } else {
      // Otherwise just assert the flag is true.
      assert.equal(gemini.isGeminiConfigured(), true);
    }
  });
});
