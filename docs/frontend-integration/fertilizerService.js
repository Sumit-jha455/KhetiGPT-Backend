/**
 * fertilizerService.js — READY TO PASTE into the React frontend at src/services/fertilizerService.js
 * -----------------------------------------------------------------------------
 * Replaces the static fertilizer reference with the backend endpoint.
 */

// Shared axios instance.
import api from "./api";

/**
 * Fetches fertilizer guidance for a crop, soil and growth stage.
 *
 * @param {Object} input - { crop, soilType, growthStage }
 */
export async function getFertilizerGuidance(input = {}) {
  // POST /api/fertilizer/guidance
  const { data } = await api.post("/fertilizer/guidance", {
    // Crop name.
    crop: input.crop,
    // Soil type (omitted here means "use my saved profile soil").
    soilType: input.soilType,
    // Growth stage: Seedling | Vegetative | Flowering | Harvest.
    growthStage: input.growthStage,
  });

  // Return the guidance block.
  return data.data.guidance;
}

/** Returns the accepted stages, soil types and the nutrient reference. */
export async function getFertilizerOptions() {
  // GET /api/fertilizer/options
  const { data } = await api.get("/fertilizer/options");
  // Return the whole reference block.
  return data.data;
}

// Default export.
export default { getFertilizerGuidance, getFertilizerOptions };

/* ---------------------------------------------------------------------------
 * GUIDANCE SHAPE REFERENCE
 *
 * {
 *   inputs: { crop, soilType, growthStage },
 *   nutrientEmphasis: "Higher nitrogen for canopy and stem growth",
 *   nutrientPriority: "Nitrogen, applied in splits",
 *   stageSummary: "…",
 *   cropSpecificNote: "…",
 *   application: {
 *     practice: "…",
 *     soilAdjustment: "…",
 *     cautions: ["…"]
 *   },
 *   nutrients: [{ symbol, name, role, sources, deficiencySigns, excessRisk, isStagePriority }],
 *   organicOptions: [{ name, benefit, guidance }],
 *   soil: { type, behaviour, adjustment },
 *   safetyWarnings: ["…"],
 *   method: "…",
 *   disclaimer: "…"
 * }
 *
 * NOTE: your current page maps `STAGE_GUIDE` locally. After integration, prefer
 * `guidance.nutrientEmphasis`, `guidance.application.practice` and
 * `guidance.nutrients` from the API, and always render
 * `guidance.disclaimer` and `guidance.safetyWarnings`.
 * ------------------------------------------------------------------------- */
