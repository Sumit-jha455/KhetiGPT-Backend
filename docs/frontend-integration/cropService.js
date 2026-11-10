/**
 * cropService.js — READY TO PASTE into the React frontend at src/services/cropService.js
 * -----------------------------------------------------------------------------
 * Replaces the local rule engine with the backend's explainable rule engine.
 * The returned field names are a superset of src/data/mockCrops.js, so the result
 * card needs no changes.
 */

// Shared axios instance.
import api from "./api";

/**
 * Requests a crop recommendation.
 *
 * @param {Object} input - { location, season, soilType, water, farmSize }
 * @returns {Promise<Object>} the recommendation payload
 */
export async function getCropRecommendation(input = {}) {
  // POST /api/crops/recommend
  // The backend accepts `water` OR `waterAvailability`.
  const { data } = await api.post("/crops/recommend", {
    // Optional location.
    location: input.location,
    // Season: Kharif | Rabi | Zaid.
    season: input.season,
    // Soil type: Loamy | Clay | Sandy | Black | Alluvial | Red | Laterite | Other.
    soilType: input.soilType,
    // Water availability: Low | Medium | High.
    water: input.water ?? input.waterAvailability,
    // Optional farm size in acres.
    farmSize: input.farmSize,
    // Optional overrides, used when the frontend has fetched live weather.
    ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    ...(input.rainfall !== undefined ? { rainfall: input.rainfall } : {}),
  });

  // Return the recommendation block.
  return data.data.recommendation;
}

/**
 * Returns the crop catalogue and the accepted option lists, so the form can be
 * built from the API instead of hardcoded arrays.
 */
export async function getCropOptions() {
  // GET /api/crops/options
  const { data } = await api.get("/crops/options");
  // Return the whole options block.
  return data.data;
}

// Default export.
export default { getCropRecommendation, getCropOptions };

/* ---------------------------------------------------------------------------
 * RESULT SHAPE REFERENCE
 *
 * The backend returns everything your existing result card renders, plus more:
 *
 * {
 *   crop: "Wheat",
 *   suitabilityScore: 80,
 *   scoreLabel: "Strong match",          <- NEW: prevents over-reading the number
 *   season: "Rabi",
 *   category: "Cereal",
 *   duration: "110-130 days",
 *   waterNeed: "Medium",
 *   reason: "…",                          <- same as your mock
 *   matchedFactors: ["…"],               <- NEW: bullet list of supporting reasons
 *   unmatchedFactors: ["…"],             <- NEW: what did not match
 *   considerations: ["…"],               <- same as your mock
 *   cultivation: {                        <- NEW: basic reference info
 *     duration, waterRequirementMm, temperatureRangeC, category, waterNeed, seasons
 *   },
 *   alternatives: [{ name, suitabilityScore, category, waterNeed, duration, reason, note }],
 *   inputs: { soilType, season, waterAvailability, location, farmSize, … },
 *   evaluatedCrops: 15,
 *   method: "Rule based scoring (season 35 points, soil 25, …)",
 *   disclaimer: "…"
 * }
 * ------------------------------------------------------------------------- */
