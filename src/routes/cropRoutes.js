/**
 * routes/cropRoutes.js
 * -----------------------------------------------------------------------------
 * Crop recommendation route definitions.
 *
 *   POST /api/crops/recommend -> recommendCrop
 *   GET  /api/crops/options   -> getCropOptions
 *
 * Optional auth is applied so a logged-in farmer can omit the fields that are
 * already stored on their profile (soil type, season, location, farm size).
 */

import { Router } from "express";
// Controller functions.
import { recommendCrop, getCropOptions } from "../controllers/cropController.js";
// Validation helper and the crop rules.
import { validate, cropRules } from "../middleware/validateMiddleware.js";
// optionalAuth lets the saved profile fill in missing fields.
import { optionalAuth } from "../middleware/authMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the crop router.
const router = Router();

/**
 * POST /api/crops/recommend
 * Generates a crop recommendation from soil, season, water availability and
 * optional temperature/rainfall. Alias /api/crops/recommendation is also mounted.
 */
router.post("/recommend", optionalAuth, validate(cropRules), asyncHandler(recommendCrop));

/**
 * POST /api/crops/recommendation
 * Alias of /recommend, accepted because some clients use the longer noun form.
 */
router.post("/recommendation", optionalAuth, validate(cropRules), asyncHandler(recommendCrop));

/**
 * GET /api/crops/options
 * Returns the crop catalogue plus the accepted season, soil and water values.
 * The frontend can build its dropdowns from this instead of hardcoding lists.
 */
router.get("/options", asyncHandler(getCropOptions));

/**
 * GET /api/crops/crops
 * Alias of /options, returning just the catalogue entries.
 */
router.get("/crops", asyncHandler(getCropOptions));

// Export the configured router.
export default router;
