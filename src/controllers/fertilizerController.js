/**
 * controllers/fertilizerController.js
 * -----------------------------------------------------------------------------
 * Fertilizer guidance endpoints.
 *
 *   getGuidance         -> POST /api/fertilizer/guidance
 *   getFertilizerOptions -> GET  /api/fertilizer/options
 *
 * Like the crop module, this is synchronous and needs no database, which keeps
 * it fast and simple to demonstrate.
 */

import { getFertilizerGuidance, getFertilizerReference, GROWTH_STAGES } from "../services/fertilizerService.js";
// Success envelope.
import { ok } from "../utils/response.js";

/**
 * getGuidance - returns fertilizer guidance for a crop, soil and growth stage.
 *
 * The request body may omit the soil type when the caller is authenticated,
 * because the farmer's saved profile already stores it.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getGuidance = async (req, res) => {
  // --- Merge the request body with the saved profile ---------------------
  const guidance = getFertilizerGuidance({
    // Crop name from the body (mandatory).
    crop: req.body?.crop,
    // Soil type from the body, falling back to the profile.
    soilType: req.body?.soilType ?? req.user?.soilType ?? "",
    // Growth stage from the body (mandatory).
    growthStage: req.body?.growthStage,
  });

  // Return the guidance payload.
  return ok(res, "Fertilizer guidance generated.", {
    // The guidance payload.
    guidance,
    // Whether the saved profile contributed the soil type.
    profileUsed: Boolean(req.user),
    // Accepted growth stages, so the UI can validate before submitting.
    acceptedGrowthStages: GROWTH_STAGES,
  });
};

/**
 * getFertilizerOptions - returns the static reference lists.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getFertilizerOptions = async (req, res) => {
  // Return the reference data without any computation.
  return ok(res, "Fertilizer reference loaded.", {
    // Accepted growth stages.
    growthStages: GROWTH_STAGES,
    // Accepted soil types.
    soilTypes: getFertilizerReference().soilTypes,
    // Primary nutrient reference table.
    nutrients: getFertilizerReference().nutrients,
    // Organic amendment options.
    organicOptions: getFertilizerReference().organicOptions,
    // Safety warnings shown with every guidance response.
    safetyWarnings: getFertilizerReference().safetyWarnings,
    // Scope statement so the UI can set expectations honestly.
    scope:
      "Provides general nutrient information and stage-wise priorities. Does not calculate fertilizer doses in kg per acre.",
  });
};
