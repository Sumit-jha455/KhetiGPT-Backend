/**
 * routes/userRoutes.js
 * -----------------------------------------------------------------------------
 * Farmer profile route definitions.
 *
 *   GET /api/users/profile  -> getProfile     (alias: GET /api/users/me)
 *   PUT /api/users/profile  -> updateProfile  (alias: PUT /api/users/me)
 *
 * The `/me` aliases exist because the existing React frontend's ENDPOINTS map
 * already contains "/users/me". Supporting both means the frontend works with
 * zero changes to its endpoint constants.
 */

import { Router } from "express";
// Controller functions.
import { getProfile, updateProfile } from "../controllers/userController.js";
// Validation helper and the profile update rules.
import { validate, profileUpdateRules } from "../middleware/validateMiddleware.js";
// JWT protection: both endpoints require an authenticated farmer.
import { protect, requireDatabase } from "../middleware/authMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the user router.
const router = Router();

// Every route in this file requires a valid token AND a database connection,
// because the profile lives in MongoDB.
router.use(protect, requireDatabase);

/**
 * GET /api/users/profile
 * Returns the authenticated farmer's profile and farm information.
 */
router.get("/profile", asyncHandler(getProfile));

/**
 * GET /api/users/me
 * Alias of /profile for frontend compatibility.
 */
router.get("/me", asyncHandler(getProfile));

/**
 * PUT /api/users/profile
 * Performs a partial update of the authenticated farmer's profile.
 * Only whitelisted fields are accepted; the email cannot be changed.
 */
router.put("/profile", validate(profileUpdateRules), asyncHandler(updateProfile));

/**
 * PUT /api/users/me
 * Alias of PUT /profile for frontend compatibility.
 */
router.put("/me", validate(profileUpdateRules), asyncHandler(updateProfile));

// Export the configured router.
export default router;
