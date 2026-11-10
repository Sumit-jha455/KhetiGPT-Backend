/**
 * routes/schemeRoutes.js
 * -----------------------------------------------------------------------------
 * Government scheme route definitions.
 *
 *   GET /api/schemes      -> listSchemes    (search + filter + pagination)
 *   GET /api/schemes/meta -> getSchemeMeta  (categories + verification policy)
 *   GET /api/schemes/:id  -> getSchemeById  (single record)
 *
 * IMPORTANT ROUTING ORDER:
 *   "/meta" MUST be declared before "/:id", otherwise Express would treat the
 *   literal string "meta" as an id and return 404 for /api/schemes/meta.
 *
 * These routes are public: scheme information is general reference material and
 * the project has no admin panel yet.
 */

import { Router } from "express";
// Controller functions.
import { listSchemes, getSchemeById, getSchemeMeta } from "../controllers/schemeController.js";
// Validation helper and the scheme rules.
import { validate, schemeRules, schemeIdRules } from "../middleware/validateMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the scheme router.
const router = Router();

/**
 * GET /api/schemes
 * Public. Supports ?search=, ?category=, ?page= and ?limit=.
 */
router.get("/", validate(schemeRules), asyncHandler(listSchemes));

/**
 * GET /api/schemes/meta
 * Public. Returns the filter categories, the dataset size and the verification
 * policy. Declared BEFORE /:id so it is not captured as an id.
 */
router.get("/meta", asyncHandler(getSchemeMeta));

/**
 * GET /api/schemes/:id
 * Public. Returns one scheme record, or 404 when the id is unknown.
 */
router.get("/:id", validate(schemeIdRules), asyncHandler(getSchemeById));

// Export the configured router.
export default router;
