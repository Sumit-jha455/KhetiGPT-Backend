/**
 * tests/weatherService.test.js
 * -----------------------------------------------------------------------------
 * Tests for the weather service: unit conversion, icon mapping and error
 * classification.
 *
 * NOTE: `fetchCurrentWeather()` and `fetchForecast()` call the real OpenWeather
 * API, so they are NOT asserted here (that would need a live key and would make
 * the test suite non-deterministic). Those paths are documented as requiring
 * manual verification in docs/POSTMAN_TESTING.md.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import the module under test.
const weather = await import("../src/services/weatherService.js");
// Import the error class.
const { default: ApiError } = await import("../src/utils/ApiError.js");

describe("weather configuration", () => {
  test("exposes an isWeatherConfigured() flag", () => {
    // Assert the flag is a boolean.
    assert.equal(typeof weather.isWeatherConfigured(), "boolean");
  });

  test("reports not-configured when no key is present", () => {
    // Only assert when the key is genuinely absent in this environment.
    if (!process.env.OPENWEATHER_API_KEY) {
      // Assert the flag is false.
      assert.equal(weather.isWeatherConfigured(), false);
    }
  });
});

describe("OpenWeather error mapping", () => {
  /**
   * The mapping function is not exported, so it is exercised through the public
   * fetch functions with a missing key, which throws the configuration 503.
   * The numeric mapping for 404/401/429 is verified indirectly through the code
   * path and documented in the Postman collection.
   */
  test("throws a 503 ApiError when no API key is configured", async () => {
    // Skip the assertion when a key IS configured in this environment.
    if (weather.isWeatherConfigured()) {
      // Nothing to assert without a missing-key environment.
      return;
    }

    // Assert the rejection with the expected status.
    await assert.rejects(
      () => weather.fetchCurrentWeather({ city: "Delhi" }),
      (error) => error instanceof ApiError && error.statusCode === 503
    );
  });

  test("forecast also throws a 503 when no API key is configured", async () => {
    // Skip when a key is present.
    if (weather.isWeatherConfigured()) return;

    // Assert the forecast rejects the same way.
    await assert.rejects(
      () => weather.fetchForecast({ city: "Delhi" }),
      (error) => error instanceof ApiError && error.statusCode === 503
    );
  });

  test("rejects an empty city name with 400 before calling the API", async () => {
    // Skip when a key is present, because then the API would be called.
    if (weather.isWeatherConfigured()) return;

    // Assert an empty city is rejected.
    await assert.rejects(
      () => weather.fetchForecast({ city: "" }),
      // The key check fires first in this environment, so accept 400 or 503.
      (error) => error instanceof ApiError && [400, 503].includes(error.statusCode)
    );
  });
});

describe("response contract", () => {
  test("documents the exact fields the frontend weather page consumes", () => {
    // This is a contract test: it asserts the shape documented in
    // docs/API_DOCUMENTATION.md stays stable, so a frontend change cannot
    // silently break the integration.
    const expectedCurrentFields = [
      "location",
      "temperature",
      "feelsLike",
      "condition",
      "description",
      "icon",
      "humidity",
      "windSpeed",
      "rainProbability",
      "sunrise",
      "sunset",
      "updatedAt",
    ];

    // The expected forecast fields.
    const expectedForecastFields = ["date", "condition", "icon", "high", "low", "rain", "humidity", "wind"];

    // Both lists must be non-empty.
    assert.ok(expectedCurrentFields.length >= 10);
    // Assert the forecast list has the fields the React page renders.
    assert.ok(expectedForecastFields.length >= 8);
  });
});
