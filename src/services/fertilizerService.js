/**
 * services/fertilizerService.js
 * -----------------------------------------------------------------------------
 * Fertilizer guidance engine.
 *
 * SCOPE DECISION (deliberate and important):
 *   This module explains nutrient ROLES, STAGE priorities and SOIL adjustments.
 *   It intentionally does NOT calculate a dose in kg/acre, because a correct dose
 *   depends on a soil health card report and state level recommendations that this
 *   application does not have access to. Saying so explicitly is more honest and
 *   more useful than inventing a number.
 */

import {
  NUTRIENT_GUIDE,
  ORGANIC_OPTIONS,
  STAGE_GUIDE,
  SOIL_ADJUSTMENTS,
  SAFETY_WARNINGS,
  lookupCropHint,
} from "../data/fertilizerKnowledge.js";
import ApiError from "../utils/ApiError.js";

/** Growth stages accepted by the endpoint. */
export const GROWTH_STAGES = Object.keys(STAGE_GUIDE);

/**
 * buildApplicationGuidance - stage and soil specific practice guidance.
 *
 * @param {string} growthStage - Seedling | Vegetative | Flowering | Harvest
 * @param {string} soilType    - soil type from the request
 * @returns {{ practice: string, soilAdjustment: string, cautions: string[] }}
 */
const buildApplicationGuidance = (growthStage, soilType) => {
  // Look up the stage guidance from the dataset.
  const stage = STAGE_GUIDE[growthStage] ?? STAGE_GUIDE.Seedling;
  // Look up the soil adjustment note, falling back to the generic entry.
  const soil = SOIL_ADJUSTMENTS[soilType] ?? SOIL_ADJUSTMENTS.Other;

  // Return the combined guidance block.
  return {
    // The general practice for this stage.
    practice: stage.practice,
    // How the soil type modifies the practice.
    soilAdjustment: `${soil.behaviour} ${soil.adjustment}`,
    // Cautions specific to this stage.
    cautions: stage.cautions,
  };
};

/**
 * getFertilizerGuidance - the main entry point used by the controller.
 *
 * @param {Object} input - { crop, soilType, growthStage }
 * @returns {Object} guidance payload
 */
export const getFertilizerGuidance = (input = {}) => {
  // --- Normalise the inputs ------------------------------------------------
  // Trim and capitalise the growth stage so "seedling" works the same as "Seedling".
  const growthStageRaw = String(input.growthStage ?? "").trim();
  // Match the stage case-insensitively against the accepted stages.
  const growthStage =
    GROWTH_STAGES.find((stage) => stage.toLowerCase() === growthStageRaw.toLowerCase()) ?? null;

  // Crop is mandatory.
  const crop = String(input.crop ?? "").trim();
  // Reject a missing crop name.
  if (!crop) {
    // 400 because the request was incomplete.
    throw ApiError.badRequest("Crop name is required.");
  }
  // Soil type is mandatory because it changes the guidance meaningfully.
  const soilType = String(input.soilType ?? "").trim();
  // Reject a missing soil type.
  if (!soilType) {
    // 400 because the request was incomplete.
    throw ApiError.badRequest("Soil type is required.");
  }
  // Growth stage is mandatory so the guidance is not ambiguous.
  if (!growthStage) {
    // 400 with the accepted values listed for the caller.
    throw ApiError.badRequest(`Growth stage must be one of: ${GROWTH_STAGES.join(", ")}.`);
  }

  // --- Look up the reference data ----------------------------------------
  const stage = STAGE_GUIDE[growthStage];
  // Soil adjustment note for the requested soil.
  const soil = SOIL_ADJUSTMENTS[soilType] ?? SOIL_ADJUSTMENTS.Other;
  // Crop specific nutrient hint, or null when the crop is not in the dataset.
  const cropHint = lookupCropHint(crop);

  // --- Build the response payload ----------------------------------------
  return {
    // Echo the evaluated inputs.
    inputs: {
      // Crop name as supplied.
      crop,
      // Soil type evaluated.
      soilType,
      // Growth stage evaluated.
      growthStage,
    },

    // Nutrient emphasis summary for the requested stage.
    nutrientEmphasis: stage.emphasis,
    // Which nutrient matters most at this stage.
    nutrientPriority: stage.priority,
    // Plain language explanation of the stage.
    stageSummary: stage.summary,

    // Crop specific hint, or a generic note when the crop is unknown.
    cropSpecificNote:
      cropHint ??
      "This crop is not in the reference dataset. The stage wise guidance below is general. Please confirm crop specific nutrient needs with a local agriculture officer.",

    // Complete application guidance block.
    application: buildApplicationGuidance(growthStage, soilType),

    // The primary nutrient reference table (always included, so the UI can
    // render the same information on every request).
    nutrients: NUTRIENT_GUIDE.map((nutrient) => ({
      // Symbol, e.g. "N".
      symbol: nutrient.symbol,
      // Nutrient name.
      name: nutrient.name,
      // What it does.
      role: nutrient.role,
      // Common fertilizer source categories.
      sources: nutrient.sources,
      // Visible deficiency symptoms.
      deficiencySigns: nutrient.deficiencySigns,
      // Risk of over-application.
      excessRisk: nutrient.excessRisk,
      // Whether this nutrient is the priority at the requested stage, derived
      // from the stage's priority text.
      isStagePriority: stage.priority.toLowerCase().includes(nutrient.name.toLowerCase()),
    })),

    // Organic amendment options, so chemical input is not the only path shown.
    organicOptions: ORGANIC_OPTIONS,

    // Soil specific behaviour and adjustment.
    soil: {
      // Soil type evaluated.
      type: soilType,
      // Behaviour of this soil.
      behaviour: soil.behaviour,
      // How the guidance is adjusted.
      adjustment: soil.adjustment,
    },

    // Safety warnings. Always attached.
    safetyWarnings: SAFETY_WARNINGS,

    // Method transparency.
    method:
      "Structured reference data with rule based stage, soil and crop lookups. No dosage calculation is performed.",

    // Explicit disclaimer attached to every response.
    disclaimer:
      "This is general educational guidance for an academic project, not a fertilizer recommendation. Exact fertilizer quantity and schedule must be based on your Soil Health Card report and local agricultural recommendations. Consult your local agriculture officer or Krishi Vigyan Kendra before applying any input.",
  };
};

/**
 * getFertilizerReference - returns the static reference lists.
 * Lets the frontend build its dropdowns from the API instead of hardcoding.
 */
export const getFertilizerReference = () => ({
  // Accepted growth stages.
  growthStages: GROWTH_STAGES,
  // Accepted soil types.
  soilTypes: Object.keys(SOIL_ADJUSTMENTS),
  // Primary nutrient reference.
  nutrients: NUTRIENT_GUIDE,
  // Organic amendment options.
  organicOptions: ORGANIC_OPTIONS,
  // Safety warnings.
  safetyWarnings: SAFETY_WARNINGS,
});
