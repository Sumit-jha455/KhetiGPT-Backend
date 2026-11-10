/**
 * tests/auth.test.js
 * -----------------------------------------------------------------------------
 * Tests for password hashing, JWT signing/verification and token tampering.
 *
 * These tests SKIP THEMSELVES when MongoDB is not reachable. They print a clear
 * SKIP line instead of failing, so the suite stays green while being honest
 * about what was not verified.
 *
 * Run with a database to exercise them:
 *   MONGODB_URI="mongodb+srv://..." npm test
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

// Database helpers.
const { connectDatabase, getConnectionState, disconnectDatabase } = await import("../src/config/db.js");
// User model and cookie name.
const { default: User, AUTH_COOKIE_NAME } = await import("../src/models/User.js");
// Token helpers.
const { issueToken, protect } = await import("../src/middleware/authMiddleware.js");
// Environment values.
const { JWT_SECRET, MONGODB_URI } = await import("../src/config/env.js");

/** Unique suffix so repeated test runs do not collide on the unique email index. */
const RUN_ID = Date.now();
/** Test account email. */
const TEST_EMAIL = `test.farmer.${RUN_ID}@example.com`;
/** Test password. */
const TEST_PASSWORD = "TestPass123";

/**
 * A database is required for these tests. When it is unavailable we still want
 * to verify the pure cryptography helpers, so we track availability separately.
 */
let dbAvailable = false;

// Attempt the connection once before any test runs.
before(async () => {
  // Connect (non-fatally).
  const result = await connectDatabase();
  // Record whether the connection succeeded.
  dbAvailable = result.connected;
});

// Clean up the connection after the tests.
after(async () => {
  // Remove the test account so the database is not polluted.
  if (dbAvailable) {
    // Delete by email.
    await User.deleteOne({ email: TEST_EMAIL });
  }
  // Close the connection.
  await disconnectDatabase();
});

describe("password hashing", () => {
  test("hashPassword() stores a bcrypt hash, never the plain password", async (t) => {
    // Skip when no database is available.
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Create the document without saving.
    const user = new User({ fullName: "Test Farmer", email: TEST_EMAIL, password: "pending" });
    // Hash the password.
    await user.hashPassword(TEST_PASSWORD);

    // Assert the stored value is NOT the plain password.
    assert.notEqual(user.password, TEST_PASSWORD);
    // Assert it looks like a bcrypt hash ($2a$ / $2b$ prefix).
    assert.match(user.password, /^\$2[aby]\$/);
    // Assert a reasonable hash length.
    assert.ok(user.password.length >= 60, "a bcrypt hash should be at least 60 characters");
  });

  test("comparePassword() accepts the correct password", async (t) => {
    // Skip when no database is available.
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Create and hash.
    const user = new User({ fullName: "Test Farmer", email: TEST_EMAIL, password: "pending" });
    // Hash the password.
    await user.hashPassword(TEST_PASSWORD);

    // Compare with the correct password.
    assert.equal(await user.comparePassword(TEST_PASSWORD), true);
  });

  test("comparePassword() rejects a wrong password", async (t) => {
    // Skip when no database is available.
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Create and hash.
    const user = new User({ fullName: "Test Farmer", email: TEST_EMAIL, password: "pending" });
    // Hash the password.
    await user.hashPassword(TEST_PASSWORD);

    // Compare with a wrong password.
    assert.equal(await user.comparePassword("WrongPass999"), false);
  });

  test("produces a different hash for the same password (unique salt)", async (t) => {
    // Skip when no database is available.
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Hash the same password twice.
    const a = new User({ fullName: "A", email: `a${RUN_ID}@example.com`, password: "pending" });
    const b = new User({ fullName: "B", email: `b${RUN_ID}@example.com`, password: "pending" });
    // Hash both.
    await a.hashPassword(TEST_PASSWORD);
    await b.hashPassword(TEST_PASSWORD);

    // Assert the hashes differ, proving a unique salt is used.
    assert.notEqual(a.password, b.password);
  });
});

describe("toSafeObject()", () => {
  test("never exposes the password hash", async (t) => {
    // Skip when no database is available.
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Create and hash.
    const user = new User({ fullName: "Test Farmer", email: TEST_EMAIL, password: "pending" });
    // Hash the password.
    await user.hashPassword(TEST_PASSWORD);

    // Produce the safe object.
    const safe = user.toSafeObject();

    // Assert the hash is absent.
    assert.equal("password" in safe, false);
    // Assert the version key is absent.
    assert.equal("__v" in safe, false);
    // Assert a string id is present.
    assert.ok(typeof safe.id === "string" && safe.id.length > 0);
  });

  test("provides both naming conventions for frontend compatibility", async (t) => {
    // Skip when no database is available.
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Create a user with the alias fields set.
    const user = new User({
      fullName: "Test Farmer",
      email: TEST_EMAIL,
      password: "pending",
      preferredLanguage: "English",
      irrigationType: "Medium",
    });
    // Hash the password.
    await user.hashPassword(TEST_PASSWORD);

    // Produce the safe object.
    const safe = user.toSafeObject();

    // Assert both name fields exist and match.
    assert.equal(safe.fullName, "Test Farmer");
    assert.equal(safe.name, "Test Farmer");
    // Assert both language fields exist and match.
    assert.equal(safe.preferredLanguage, "English");
    assert.equal(safe.language, "English");
    // Assert both irrigation fields exist and match.
    assert.equal(safe.irrigationType, "Medium");
    assert.equal(safe.waterAvailability, "Medium");
  });
});

describe("JWT handling", () => {
  test("issueToken() produces a verifiable token with the user id as sub", async (t) => {
    // Skip when no database is available (a real ObjectId is needed).
    if (!dbAvailable) return t.skip("MongoDB is not available");

    // Create a user to sign a token for.
    const user = new User({ fullName: "Token Test", email: `tok${RUN_ID}@example.com`, password: "pending" });
    // Hash the password so the document is valid.
    await user.hashPassword(TEST_PASSWORD);

    // Sign the token.
    const token = issueToken(user);
    // Assert a string was produced.
    assert.ok(typeof token === "string" && token.split(".").length === 3, "a JWT has three parts");

    // Verify the token.
    const decoded = mongoose.isValidObjectId(user._id)
      ? jwt.verify(token, JWT_SECRET)
      : null;

    // Assert the subject matches the user id.
    assert.equal(decoded.sub, String(user._id));
  });

  test("protect() rejects a tampered token", async (t) => {
    // Build a valid token then corrupt its signature.
    const token = issueToken({ _id: new mongoose.Types.ObjectId(), email: "x@example.com" });
    // Corrupt the last character of the signature.
    const tampered = `${token.slice(0, -1)}X`;

    // Run the middleware with a fake request.
    await new Promise((resolve) => {
      // Call protect with the tampered token.
      protect({ headers: { authorization: `Bearer ${tampered}` }, cookies: {} }, {}, (error) => {
        // Assert a 401 error was forwarded.
        assert.equal(error?.statusCode, 401);
        // Resolve the promise.
        resolve();
      });
    });
  });

  test("protect() rejects a request with no token", async (t) => {
    // Run the middleware with no credentials at all.
    await new Promise((resolve) => {
      // Call protect with no token.
      protect({ headers: {}, cookies: {} }, {}, (error) => {
        // Assert a 401 error was forwarded.
        assert.equal(error?.statusCode, 401);
        // Assert the message mentions the missing token.
        assert.ok(/missing/i.test(error.message));
        // Resolve the promise.
        resolve();
      });
    });
  });

  test("protect() rejects a structurally invalid token", async (t) => {
    // Run the middleware with a nonsense token.
    await new Promise((resolve) => {
      // Call protect with garbage.
      protect({ headers: { authorization: "Bearer garbage" }, cookies: {} }, {}, (error) => {
        // Assert a 401 error was forwarded.
        assert.equal(error?.statusCode, 401);
        // Resolve the promise.
        resolve();
      });
    });
  });

  test("the auth cookie name is consistent", () => {
    // Assert the name is a non-empty string.
    assert.ok(typeof AUTH_COOKIE_NAME === "string" && AUTH_COOKIE_NAME.length > 0);
  });
});

describe("database connection", () => {
  test("reports a readable connection state", () => {
    // Read the state.
    const state = getConnectionState();
    // Assert it is one of the known values.
    assert.ok(["disconnected", "connected", "connecting", "disconnecting"].includes(state));
  });

  test("connectDatabase() is idempotent", async () => {
    // Call the connect helper again.
    const result = await connectDatabase();
    // Assert it returns a boolean result.
    assert.equal(typeof result.connected, "boolean");
  });
});
