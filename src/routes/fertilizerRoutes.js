/**
 * routes/fertilizerRoutes.js
 * -----------------------------------------------------------------------------
 * Fertilizer guidance route definitions.
 *
 *   POST /api/fertilizer/guidance -> getGuidance
 *   GET  /api/fertilizer/options  -> getFertilizerOptions
 *
 * Optional auth is applied so a logged-in farmer can omit the soil type, which
 * is already stored on their profile.
 */

import { Router } from "express";
// Controller functions.
import { getGuidance, getFertilizerOptions } from "../controllers/fertilizerController.js";
// Validation helper and the fertilizer rules.
import { validate, fertilizerRules } from "../middleware/validateMiddleware.js";
// optionalAuth lets the saved profile supply the soil type.
import { optionalAuth } from "../middleware/authMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the fertilizer router.
const router = Router();

/**
 * POST /api/fertilizer/guidance
 * Returns nutrient information and stage-wise guidance for a crop, soil and
 * growth stage. This is the endpoint the existing frontend already expects.
 */
router.post("/guidance", optionalAuth, validate(fertilizerRules), asyncHandler(getGuidance));

/**
 * GET /api/fertilizer/options
 * Returns the accepted growth stages, soil types and the nutrient reference,
 * so the frontend can build its form from the API.
 */
router.get("/options", asyncHandler(getFertilizerOptions));

// Export the configured router.
export default router;
