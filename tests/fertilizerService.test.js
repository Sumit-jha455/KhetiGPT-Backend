/**
 * tests/fertilizerService.test.js
 * -----------------------------------------------------------------------------
 * Tests for the fertilizer guidance engine.
 *
 * The most important assertion here is the SAFETY one: the module must NEVER
 * produce a numeric dosage recommendation, because that would be unsafe without
 * a soil test report.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import the module under test.
const { getFertilizerGuidance, getFertilizerReference, GROWTH_STAGES } = await import(
  "../src/services/fertilizerService.js"
);
// Import the error class for status assertions.
const { default: ApiError } = await import("../src/utils/ApiError.js");

/** Regular expression matching "45 kg", "2.5 kg/acre", "100 kg per hectare" etc. */
const DOSAGE_PATTERN = /\b\d+(\.\d+)?\s*(kg|g|quintal|litre|liter|ml)\s*(per|\/)\s*(acre|hectare|bigha|ha)\b/i;

describe("fertilizer guidance", () => {
  test("returns guidance for a valid crop, soil and stage", () => {
    // Call the engine.
    const result = getFertilizerGuidance({ crop: "Wheat", soilType: "Loamy", growthStage: "Vegetative" });

    // The inputs must be echoed back.
    assert.equal(result.inputs.crop, "Wheat");
    assert.equal(result.inputs.soilType, "Loamy");
    assert.equal(result.inputs.growthStage, "Vegetative");
    // A nutrient priority must be stated.
    assert.ok(result.nutrientPriority.length > 0);
  });

  test("covers all four growth stages", () => {
    // For each accepted stage...
    for (const stage of GROWTH_STAGES) {
      // Generate guidance.
      const result = getFertilizerGuidance({ crop: "Maize", soilType: "Alluvial", growthStage: stage });
      // Assert the stage was accepted.
      assert.equal(result.inputs.growthStage, stage);
      // Assert an emphasis was produced.
      assert.ok(result.nutrientEmphasis.length > 0, `${stage} should have an emphasis`);
      // Assert cautions were produced.
      assert.ok(Array.isArray(result.application.cautions));
    }
  });

  test("is case-insensitive for the growth stage", () => {
    // Call with lowercase input.
    const result = getFertilizerGuidance({ crop: "Wheat", soilType: "Loamy", growthStage: "seedling" });
    // Assert it was normalised to the canonical form.
    assert.equal(result.inputs.growthStage, "Seedling");
  });

  test("matches the harvest stage to a stop-application instruction", () => {
    // Generate harvest guidance.
    const result = getFertilizerGuidance({ crop: "Wheat", soilType: "Loamy", growthStage: "Harvest" });
    // The guidance must tell the farmer to stop.
    assert.ok(/stop/i.test(result.nutrientEmphasis + result.application.practice));
  });

  test("adjusts guidance per soil type", () => {
    // Generate guidance for two different soils at the same stage.
    const sandy = getFertilizerGuidance({ crop: "Wheat", soilType: "Sandy", growthStage: "Vegetative" });
    const clay = getFertilizerGuidance({ crop: "Wheat", soilType: "Clay", growthStage: "Vegetative" });
    // The soil adjustments must differ, proving the soil is actually considered.
    assert.notEqual(sandy.soil.adjustment, clay.soil.adjustment);
  });

  test("provides a crop specific note for known crops", () => {
    // Generate guidance for a crop in the dataset.
    const result = getFertilizerGuidance({ crop: "Rice (Paddy)", soilType: "Clay", growthStage: "Vegetative" });
    // The note must not be the "not in dataset" fallback.
    assert.ok(!result.cropSpecificNote.includes("not in the reference dataset"));
  });

  test("admits honestly when a crop is not in the dataset", () => {
    // Generate guidance for an unknown crop.
    const result = getFertilizerGuidance({ crop: "Dragon Fruit", soilType: "Loamy", growthStage: "Seedling" });
    // The note must say the crop is not covered.
    assert.ok(result.cropSpecificNote.includes("not in the reference dataset"));
  });

  test("always attaches safety warnings", () => {
    // Generate guidance.
    const result = getFertilizerGuidance({ crop: "Wheat", soilType: "Loamy", growthStage: "Seedling" });
    // Safety warnings must be present and non-empty.
    assert.ok(Array.isArray(result.safetyWarnings) && result.safetyWarnings.length > 0);
    // One warning must mention the soil test requirement.
    assert.ok(
      result.safetyWarnings.some((warning) => /soil/i.test(warning)),
      "a soil test warning must be present"
    );
  });

  test("always attaches an explicit disclaimer", () => {
    // Generate guidance.
    const result = getFertilizerGuidance({ crop: "Wheat", soilType: "Loamy", growthStage: "Flowering" });
    // The disclaimer must exist and be substantial.
    assert.ok(result.disclaimer.length > 50);
  });

  // ----- SAFETY: the module must never output a numeric dosage -------------
  test("NEVER recommends a numeric dosage per acre or hectare", () => {
    // Test every stage across several crops and soils.
    const crops = ["Wheat", "Rice (Paddy)", "Tomato", "Cotton", "Maize"];
    const soils = ["Loamy", "Clay", "Sandy", "Black", "Alluvial"];

    // Collect every string the endpoint produces.
    const texts = [];
    for (const crop of crops) {
      for (const soil of soils) {
        for (const stage of GROWTH_STAGES) {
          // Generate the guidance.
          const result = getFertilizerGuidance({ crop, soilType: soil, growthStage: stage });
          // Collect every text field.
          texts.push(
            result.nutrientEmphasis,
            result.nutrientPriority,
            result.stageSummary,
            result.cropSpecificNote,
            result.application.practice,
            result.application.soilAdjustment,
            result.disclaimer,
            ...result.application.cautions
          );
        }
      }
    }

    // Assert none of the collected strings contains a dosage figure.
    for (const text of texts) {
      // Assert the dosage pattern is absent.
      assert.equal(DOSAGE_PATTERN.test(text ?? ""), false, `dosage-like text found: "${text}"`);
    }
  });

  test("throws 400 when the crop is missing", () => {
    // Assert the rejection.
    assert.throws(
      () => getFertilizerGuidance({ soilType: "Loamy", growthStage: "Seedling" }),
      (error) => error instanceof ApiError && error.statusCode === 400
    );
  });

  test("throws 400 when the soil type is missing", () => {
    // Assert the rejection.
    assert.throws(
      () => getFertilizerGuidance({ crop: "Wheat", growthStage: "Seedling" }),
      (error) => error instanceof ApiError && error.statusCode === 400
    );
  });

  test("throws 400 for an unknown growth stage", () => {
    // Assert the rejection with an invalid stage.
    assert.throws(
      () => getFertilizerGuidance({ crop: "Wheat", soilType: "Loamy", growthStage: "Mature" }),
      (error) => error instanceof ApiError && error.statusCode === 400
    );
  });

  test("exposes the reference data for the options endpoint", () => {
    // Read the reference.
    const reference = getFertilizerReference();
    // Growth stages must match the exported list.
    assert.deepEqual(reference.growthStages, GROWTH_STAGES);
    // Nutrients must include N, P and K.
    assert.ok(reference.nutrients.some((n) => n.symbol === "N"));
    assert.ok(reference.nutrients.some((n) => n.symbol === "P"));
    assert.ok(reference.nutrients.some((n) => n.symbol === "K"));
    // Organic options must be provided.
    assert.ok(Array.isArray(reference.organicOptions) && reference.organicOptions.length > 0);
  });
});
