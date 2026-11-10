/**
 * tests/cropService.test.js
 * -----------------------------------------------------------------------------
 * Tests for the crop recommendation engine: scoring, ranking, explanations and
 * input validation. These are pure functions, so no database is needed.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import the module under test.
const { recommendCrops, getCropCatalogue, ACCEPTED_SOIL_TYPES } = await import("../src/services/cropService.js");
// Import the catalogue so assertions can be made against real data.
const { CROP_CATALOGUE, normaliseInput } = await import("../src/data/cropKnowledge.js");
// Import the error class for status assertions.
const { default: ApiError } = await import("../src/utils/ApiError.js");

describe("crop recommendation", () => {
  test("returns a recommendation for a valid input", () => {
    // Call the engine with typical Rabi loamy conditions.
    const result = recommendCrops({ soilType: "Loamy", season: "Rabi", water: "Medium" });

    // A crop name must be returned.
    assert.ok(typeof result.crop === "string" && result.crop.length > 0, "a crop name is required");
    // The score must be within 0-100.
    assert.ok(result.suitabilityScore >= 0 && result.suitabilityScore <= 100, "score must be 0-100");
    // A human readable reason must be present.
    assert.ok(result.reason.length > 20, "a reason must be provided");
    // Considerations must always be present.
    assert.ok(Array.isArray(result.considerations) && result.considerations.length > 0);
  });

  test("always recommends a crop that is grown in the requested season", () => {
    // Test all three seasons.
    for (const season of ["Kharif", "Rabi", "Zaid"]) {
      // Generate a recommendation.
      const result = recommendCrops({ soilType: "Loamy", season, water: "Medium" });
      // Find the winning crop in the catalogue.
      const winner = CROP_CATALOGUE.find((crop) => crop.name === result.crop);
      // Assert the winner actually supports the season.
      assert.ok(
        winner.seasons.includes(season),
        `top crop "${result.crop}" should be a ${season} crop`
      );
    }
  });

  test("ranks a season-matched crop above a season-mismatched one", () => {
    // Generate a Rabi recommendation.
    const result = recommendCrops({ soilType: "Loamy", season: "Rabi", water: "Medium" });
    // The top crop must not be a Kharif-only crop such as rice.
    assert.notEqual(result.crop, "Rice (Paddy)", "rice should not win for Rabi on loamy soil");
  });

  test("penalises a crop whose water need exceeds availability", () => {
    // Get the recommendation for low water availability.
    const lowWater = recommendCrops({ soilType: "Loamy", season: "Kharif", water: "Low" });
    // The winner must not be a high water requirement crop.
    const winner = CROP_CATALOGUE.find((crop) => crop.name === lowWater.crop);
    // Assert the water requirement is not "High".
    assert.notEqual(winner.waterNeed, "High", "a high water crop should not win with low availability");
    // The considerations must always discuss water, so the farmer sees why the
    // water level mattered to the result.
    assert.ok(
      lowWater.considerations.some((note) => /water|irrigation/i.test(note)),
      "the considerations should discuss water availability"
    );
  });

  test("rewards a temperature inside the crop's range", () => {
    // Call with a warm temperature favourable to bajra.
    const warm = recommendCrops({ soilType: "Sandy", season: "Kharif", water: "Low", temperature: 35 });
    // Find the winner.
    const winner = CROP_CATALOGUE.find((crop) => crop.name === warm.crop);
    // Assert the temperature falls inside the winner's range.
    assert.ok(
      35 >= winner.tempRange[0] && 35 <= winner.tempRange[1],
      `35°C should be inside the winning crop's range (${winner.tempRange.join("-")}°C)`
    );
    // The temperature reason must be listed as a matched factor.
    assert.ok(
      warm.matchedFactors.some((factor) => factor.toLowerCase().includes("temperature")),
      "the temperature match should be reported"
    );
  });

  test("reports unmatched factors for transparency", () => {
    // Provide a temperature far outside any crop's range.
    const result = recommendCrops({ soilType: "Clay", season: "Kharif", water: "High", temperature: 5 });
    // Unmatched factors must be an array.
    assert.ok(Array.isArray(result.unmatchedFactors), "unmatchedFactors should be an array");
  });

  test("returns alternatives to compare", () => {
    // Generate a recommendation.
    const result = recommendCrops({ soilType: "Black", season: "Kharif", water: "Medium" });
    // Alternatives must be present.
    assert.ok(Array.isArray(result.alternatives), "alternatives should be an array");
    // Must be at most three and at least one.
    assert.ok(result.alternatives.length >= 1 && result.alternatives.length <= 3);
    // The alternatives must all score less than or equal to the winner.
    for (const alternative of result.alternatives) {
      // Compare against the winner's score.
      assert.ok(
        alternative.suitabilityScore <= result.suitabilityScore,
        "alternatives should not outrank the primary recommendation"
      );
    }
  });

  test("echoes the normalised inputs", () => {
    // Generate a recommendation.
    const result = recommendCrops({ soilType: "Loamy", season: "Rabi", water: "High", farmSize: 2.5 });
    // Assert the inputs were echoed.
    assert.equal(result.inputs.soilType, "Loamy");
    assert.equal(result.inputs.season, "Rabi");
    assert.equal(result.inputs.farmSize, 2.5);
  });

  test("labels the output as indicative guidance, never a guarantee", () => {
    // Generate a recommendation.
    const result = recommendCrops({ soilType: "Loamy", season: "Rabi", water: "Medium" });
    // The disclaimer must be present.
    assert.ok(typeof result.disclaimer === "string" && result.disclaimer.length > 30);
    // It must not promise a yield.
    assert.ok(!/guarantee/i.test(result.disclaimer.replace("does not guarantee", "")));
  });

  test("explains the scoring method", () => {
    // Generate a recommendation.
    const result = recommendCrops({ soilType: "Loamy", season: "Rabi", water: "Medium" });
    // The method string must mention the point weights.
    assert.ok(result.method.includes("Rule based"), "the method should be described");
  });

  test("throws 400 when the soil type is missing", () => {
    // soilType is intentionally NOT defaulted: a silent "Loamy" assumption would
    // produce a misleading recommendation.
    assert.throws(
      () => recommendCrops({ season: "Rabi", water: "Medium" }),
      (error) => error instanceof ApiError && error.statusCode === 400
    );
  });

  test("throws 400 when the season is missing", () => {
    // Assert the rejection with an empty season.
    assert.throws(
      () => recommendCrops({ soilType: "Loamy", water: "Medium" }),
      (error) => error instanceof ApiError && error.statusCode === 400
    );
  });

  test("throws 400 for an unknown season", () => {
    // Assert the rejection with an invalid season.
    assert.throws(
      () => recommendCrops({ soilType: "Loamy", season: "Winter", water: "Medium" }),
      (error) => error instanceof ApiError && error.statusCode === 400
    );
  });

  test("normalises irrigation system names onto water levels", () => {
    // A rainfed profile should map to "Low".
    assert.equal(normaliseInput({ irrigationType: "Rainfed" }).water, "Low");
    // Drip should map to "Medium".
    assert.equal(normaliseInput({ irrigationType: "Drip" }).water, "Medium");
    // Canal should map to "High".
    assert.equal(normaliseInput({ irrigationType: "Canal" }).water, "High");
    // Unknown values fall back to "Medium".
    assert.equal(normaliseInput({ irrigationType: "Unknown" }).water, "Medium");
  });

  test("exposes the catalogue for the options endpoint", () => {
    // Read the catalogue.
    const crops = getCropCatalogue();
    // It must be a non-empty array.
    assert.ok(Array.isArray(crops) && crops.length > 0);
    // It must match the number of catalogue entries.
    assert.equal(crops.length, CROP_CATALOGUE.length);
    // Every entry must expose the fields the frontend dropdown needs.
    for (const crop of crops) {
      // Check the required fields.
      assert.ok(crop.name && Array.isArray(crop.seasons) && crop.waterNeed);
    }
  });

  test("covers every accepted soil type with at least one crop", () => {
    // For each accepted soil type...
    for (const soil of ACCEPTED_SOIL_TYPES) {
      // Count the crops that support it.
      const supporting = CROP_CATALOGUE.filter((crop) => crop.soils.includes(soil));
      // Laterite/Red/Other may have few, but the list must not be empty for the
      // five types the frontend offers.
      if (["Loamy", "Clay", "Sandy", "Black", "Alluvial"].includes(soil)) {
        // Assert at least one crop supports it.
        assert.ok(supporting.length > 0, `${soil} soil should have at least one crop option`);
      }
    }
  });
});
