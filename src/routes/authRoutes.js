/**
 * routes/authRoutes.js
 * -----------------------------------------------------------------------------
 * Authentication route definitions.
 *
 *   POST /api/auth/register  -> registerUser
 *   POST /api/auth/login     -> loginUser
 *   POST /api/auth/logout    -> logoutUser
 *   GET  /api/auth/me        -> getCurrentUser
 *
 * Middleware order matters:
 *   rate limit -> input validation -> controller
 */

import { Router } from "express";
// Controller functions.
import { registerUser, loginUser, logoutUser, getCurrentUser } from "../controllers/authController.js";
// Validation helper and shared rule chains.
import { validate, registerRules, loginRules } from "../middleware/validateMiddleware.js";
// JWT protection for the /me endpoint.
import { protect, requireDatabase } from "../middleware/authMiddleware.js";
// Strict limiter to slow credential stuffing attempts.
import { authLimiter } from "../middleware/rateLimitMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the auth router.
const router = Router();

/**
 * POST /api/auth/register
 * Public. Creates a farmer account and returns the user plus a JWT.
 */
router.post(
  "/register",
  // Throttle registration attempts.
  authLimiter,
  // Validate the payload and reject invalid input with 400 FIRST, so a client
  // with a weak password gets the useful message rather than a 503.
  validate(registerRules),
  // Registration needs MongoDB, so fail fast with 503 when it is unavailable.
  requireDatabase,
  // Create the account.
  asyncHandler(registerUser)
);

/**
 * POST /api/auth/login
 * Public. Returns the user plus a JWT on success.
 */
router.post(
  "/login",
  // Throttle login attempts.
  authLimiter,
  // Validate the credentials shape first, so the client gets the useful message.
  validate(loginRules),
  // Login needs MongoDB, so fail fast with 503 when it is unavailable.
  requireDatabase,
  // Authenticate.
  asyncHandler(loginUser)
);

/**
 * POST /api/auth/logout
 * Public. Clears the httpOnly cookie. Safe to call even without a token.
 */
router.post("/logout", asyncHandler(logoutUser));

/**
 * GET /api/auth/me
 * Protected. Returns the authenticated farmer's profile.
 * Requires "Authorization: Bearer <token>" or the session cookie.
 */
router.get("/me", protect, requireDatabase, asyncHandler(getCurrentUser));

// Export the configured router.
export default router;
