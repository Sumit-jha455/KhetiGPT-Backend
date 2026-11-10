/**
 * services/cropService.js
 * -----------------------------------------------------------------------------
 * Crop recommendation engine.
 *
 * This is a TRANSPARENT rule based system: it scores each crop in the catalogue
 * against the farmer's conditions and explains every point it awards. Nothing is
 * hidden inside a model, so the answer can be defended in a viva.
 *
 * Designed for future replacement: `recommendCrops()` is the only function the
 * controller calls, so swapping the internals for a trained ML model later does
 * not require any change to the routes or controllers.
 */

import { CROP_CATALOGUE, scoreCrop, normaliseInput, SOIL_NOTES, SEASON_WINDOWS } from "../data/cropKnowledge.js";
import ApiError from "../utils/ApiError.js";

/**
 * SOIL_TYPES - the accepted soil values, exported for /api/health metadata.
 */
export const ACCEPTED_SOIL_TYPES = Object.keys(SOIL_NOTES);

/**
 * buildReason - composes a readable explanation paragraph for the top crop.
 *
 * @param {Object} crop    - the winning catalogue entry
 * @param {Array}  matched - the reasons that supported the choice
 * @param {Object} input   - the normalised farmer input
 * @returns {string}
 */
const buildReason = (crop, matched, input) => {
  // Opening sentence stating the primary basis of the recommendation.
  const opening = `${crop.name} scored highest against the conditions you provided.`;
  // Reason bullets joined into readable sentences.
  const bullets = matched.length > 0 ? ` Why: ${matched.join("; ")}.` : "";
  // Season context so the farmer knows the calendar window.
  const season = ` The ${input.season} season generally runs ${SEASON_WINDOWS[input.season] ?? "as per your regional calendar"}.`;
  // Soil context.
  const soil = ` ${SOIL_NOTES[input.soilType] ?? ""}`;
  // Combine all parts into one paragraph.
  return `${opening}${bullets}${season}${soil}`.replace(/\s+/g, " ").trim();
};

/**
 * buildConsiderations - practical, non-prescriptive considerations.
 *
 * @param {Object} crop  - the winning catalogue entry
 * @param {Object} input - the normalised farmer input
 * @returns {string[]}
 */
const buildConsiderations = (crop, input) => {
  // Start with the always-applicable advisory notes.
  const notes = [
    // Emphasise that this is indicative, not a guaranteed outcome.
    "This is indicative guidance from a rule based system, not a professional agronomic recommendation.",
    // Soil test advice, the single most useful next step.
    "Carry out a soil test (Soil Health Card) before finalising the crop and inputs.",
    // Local expertise advice.
    "Discuss the final decision with your local agriculture officer or Krishi Vigyan Kendra, as they know your region's conditions.",
  ];

  // Add the crop's own cultivation note.
  notes.push(crop.notes);

  // Warn when the water requirement exceeds availability.
  const needsMoreWater = crop.waterNeed === "High" && input.water === "Low";
  // Only add the warning when it is relevant.
  if (needsMoreWater) {
    notes.push(
      "Important: this crop has a high water requirement but you reported low water availability. Consider a drip system, a shorter duration variety, or a lower water requirement crop."
    );
  }

  // Add the missed conditions as warnings.
  if (input.temperature === null) {
    // Explain that temperature was not considered.
    notes.push("Temperature and rainfall were not provided, so those factors were not part of this evaluation.");
  }

  // Market access matters for vegetables.
  if (crop.category === "Vegetable") {
    // Add the perishability note.
    notes.push("Vegetable crops are perishable, so check transport and market access before sowing.");
  }

  // Always discuss water when the farmer reported low availability, so the
  // reason the water level mattered is visible in the result.
  if (input.water === "Low") {
    // Add the water management note.
    notes.push(
      "With low water availability, prioritise water efficient practice: mulching, and irrigation at the most sensitive growth stages rather than evenly through the season."
    );
  }

  // Farm size note when the holding is small.
  if (input.farmSize !== null && input.farmSize <= 1) {
    // Add the small holding note.
    notes.push("For a small holding, plan input quantities and labour carefully, as fixed costs take a larger share.");
  }

  // Return the assembled list.
  return notes;
};

/**
 * buildCultivationInfo - the basic cultivation block returned with the result.
 *
 * @param {Object} crop - the winning catalogue entry
 * @returns {Object}
 */
const buildCultivationInfo = (crop) => ({
  // Typical field duration.
  duration: crop.durationDays,
  // Indicative seasonal water requirement band.
  waterRequirementMm: `${crop.waterMm[0]}-${crop.waterMm[1]} mm`,
  // Indicative optimum temperature range.
  temperatureRangeC: `${crop.tempRange[0]}-${crop.tempRange[1]} °C`,
  // General crop category.
  category: crop.category,
  // Water demand label.
  waterNeed: crop.waterNeed,
  // The seasons in which this crop is normally cultivated.
  seasons: crop.seasons,
});

/**
 * recommendCrops - the main entry point used by the controller.
 *
 * @param {Object} rawInput - request body merged with the saved profile
 * @returns {Object} recommendation payload
 */
export const recommendCrops = (rawInput = {}) => {
  // --- Normalise and validate the input ----------------------------------
  const input = normaliseInput(rawInput);

  // Soil type is mandatory for a meaningful result.
  if (!input.soilType) {
    // 400 because the request was incomplete.
    throw ApiError.badRequest("Soil type is required to generate a recommendation.");
  }
  // Season must be one of the three Indian cropping seasons.
  if (!["Kharif", "Rabi", "Zaid"].includes(input.season)) {
    // 400 with the accepted values.
    throw ApiError.badRequest("Season must be one of: Kharif, Rabi, Zaid.");
  }

  // --- Score every crop in the catalogue ---------------------------------
  const scored = CROP_CATALOGUE.map((crop) => {
    // Score this crop against the farmer's conditions.
    const { score, matched, missed } = scoreCrop(crop, input);
    // Return the crop with its score and the explanation lists.
    return { crop, score, matched, missed };
  });

  // Sort by score descending so the best matches come first.
  scored.sort((a, b) => b.score - a.score);

  // Guard against an empty catalogue (defensive; the catalogue is never empty).
  if (scored.length === 0) {
    // 503 because this is a server side data problem, not the client's fault.
    throw ApiError.serviceUnavailable("No crops are available in the knowledge base.");
  }

  // The top entry is the primary recommendation.
  const best = scored[0];
  // The next three are shown as alternatives.
  const alternatives = scored.slice(1, 4);

  // --- Build the response payload ----------------------------------------
  return {
    // Primary recommended crop name.
    crop: best.crop.name,
    // Suitability score as a 0-100 integer.
    suitabilityScore: best.score,
    // Human label for the score band, so the number is not over-read.
    scoreLabel: best.score >= 80 ? "Strong match" : best.score >= 55 ? "Reasonable match" : "Partial match",
    // Season(s) in which the recommended crop is normally cultivated.
    season: best.crop.seasons.join(" / "),
    // Crop category.
    category: best.crop.category,
    // Typical duration.
    duration: best.crop.durationDays,
    // Water demand label.
    waterNeed: best.crop.waterNeed,
    // Readable explanation of the decision.
    reason: buildReason(best.crop, best.matched, input),
    // Points that supported the decision (for transparency in the UI).
    matchedFactors: best.matched,
    // Points that did not match, so the farmer sees the full picture.
    unmatchedFactors: best.missed,
    // Practical considerations and warnings.
    considerations: buildConsiderations(best.crop, input),
    // Basic cultivation reference information.
    cultivation: buildCultivationInfo(best.crop),
    // Alternative crops to compare.
    alternatives: alternatives.map(({ crop, score, matched }) => ({
      // Crop name.
      name: crop.name,
      // Score for this alternative.
      suitabilityScore: score,
      // Category.
      category: crop.category,
      // Water demand.
      waterNeed: crop.waterNeed,
      // Typical duration.
      duration: crop.durationDays,
      // First supporting reason, kept short for the card view.
      reason: matched[0] ?? "Alternative option based on your conditions",
      // Short cultivation note.
      note: crop.notes,
    })),
    // Echo the normalised inputs so the UI can display what was evaluated.
    inputs: {
      // Soil type evaluated.
      soilType: input.soilType,
      // Season evaluated.
      season: input.season,
      // Water availability evaluated.
      waterAvailability: input.water,
      // Original water label supplied by the caller.
      waterLabel: input.waterLabel,
      // Location used, if any.
      location: input.location || null,
      // Farm size used, if any.
      farmSize: input.farmSize,
      // Temperature used, if any.
      temperature: input.temperature,
      // Rainfall used, if any.
      rainfall: input.rainfall,
    },
    // How many crops were evaluated.
    evaluatedCrops: scored.length,
    // Full transparency about the method used.
    method:
      "Rule based scoring (season 35 points, soil 25, water 20, temperature 15, rainfall 5) over a catalogue of Indian field crops. Indicative guidance only - not professional agronomic advice.",
    // Explicit disclaimer attached to every response.
    disclaimer:
      "This recommendation is generated from general reference data and is for academic demonstration. It does not guarantee any yield or outcome. Please confirm with a soil test and a local agriculture expert before sowing.",
  };
};

/**
 * getCropCatalogue - returns the catalogue for the /api/crops/crops metadata endpoint.
 * Useful for the frontend to render dropdowns without hardcoding lists.
 */
export const getCropCatalogue = () =>
  // Return a trimmed projection: name, seasons, water need and duration.
  CROP_CATALOGUE.map((crop) => ({
    // Crop name.
    name: crop.name,
    // Category label.
    category: crop.category,
    // Seasons in which it is cultivated.
    seasons: crop.seasons,
    // Soil types where it is commonly grown.
    soils: crop.soils,
    // Water demand label.
    waterNeed: crop.waterNeed,
    // Typical duration.
    duration: crop.durationDays,
  }));
