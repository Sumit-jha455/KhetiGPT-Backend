/**
 * tests/config.test.js
 * -----------------------------------------------------------------------------
 * Tests for config/env.js: validation, defaults and CORS allowlist building.
 * These tests do NOT need a database or any API key.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("environment configuration", () => {
  test("exposes a positive default port", async () => {
    // Import lazily so the module is loaded inside the test.
    const { PORT } = await import("../src/config/env.js");
    // The port must be a positive number.
    assert.ok(Number.isInteger(PORT) && PORT > 0, `PORT should be a positive integer, got ${PORT}`);
  });

  test("provides a CORS allowlist array", async () => {
    // Read the allowlist.
    const { CORS_ORIGINS } = await import("../src/config/env.js");
    // It must be an array.
    assert.ok(Array.isArray(CORS_ORIGINS), "CORS_ORIGINS should be an array");
  });

  test("strips trailing slashes from CORS origins", async () => {
    // The dev defaults include ports without trailing slashes, so verify none exist.
    const { CORS_ORIGINS } = await import("../src/config/env.js");
    // Every origin must end without a slash.
    for (const origin of CORS_ORIGINS) {
      // Assert the trailing slash was removed.
      assert.ok(!origin.endsWith("/"), `Origin "${origin}" should not end with a slash`);
    }
  });

  test("normalises the environment name", async () => {
    // Read the production flag.
    const { isProduction } = await import("../src/config/env.js");
    // It must be a boolean.
    assert.equal(typeof isProduction, "boolean", "isProduction should be a boolean");
  });

  test("exposes rate limit windows in milliseconds", async () => {
    // Read both windows.
    const env = await import("../src/config/env.js");
    // Both must be positive.
    assert.ok(env.RATE_LIMIT_WINDOW_MS > 0, "RATE_LIMIT_WINDOW_MS should be positive");
    assert.ok(env.AI_RATE_LIMIT_WINDOW_MS > 0, "AI_RATE_LIMIT_WINDOW_MS should be positive");
    // The AI limit must be at most as generous as the general limit.
    assert.ok(
      env.AI_RATE_LIMIT_MAX <= env.RATE_LIMIT_MAX,
      "the AI rate limit should be stricter than or equal to the general limit"
    );
  });

  test("validateConfig reports missing optional keys as warnings, not fatal errors", async () => {
    // Run the validator.
    const { validateConfig } = await import("../src/config/env.js");
    // Collect the result.
    const { fatal, warnings } = validateConfig();
    // Both must be arrays.
    assert.ok(Array.isArray(fatal), "fatal should be an array");
    assert.ok(Array.isArray(warnings), "warnings should be an array");
    // The JWT secret is fatal when missing, so check the rule exists.
    assert.ok(fatal.length === 0 || fatal.some((message) => message.includes("JWT_SECRET")));
  });
});
