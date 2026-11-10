/**
 * middleware/authMiddleware.js
 * -----------------------------------------------------------------------------
 * JWT authentication + route protection.
 *
 * TOKEN SOURCES (in priority order):
 *   1. "Authorization: Bearer <token>" header  - standard for Postman/mobile
 *   2. httpOnly "khetigpt_token" cookie        - used by the browser frontend
 *
 * Exported middlewares:
 *   protect            -> requires a valid token, attaches req.user
 *   optionalAuth       -> attaches req.user when a token exists, never blocks
 *   requireRole(role)  -> reserved for future admin features
 */

import jwt from "jsonwebtoken";
// Validated configuration values.
import { JWT_SECRET, JWT_EXPIRES_IN, isProduction } from "../config/env.js";
// Live database connection state, used by requireDatabase.
import { getConnectionState } from "../config/db.js";
// User model + the shared cookie name and cookie options.
import User, { AUTH_COOKIE_NAME, authCookieOptions } from "../models/User.js";
// Operational error type with correct HTTP status codes.
import ApiError from "../utils/ApiError.js";

/**
 * extractToken - reads the JWT from the request.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
const extractToken = (req) => {
  // Read the Authorization header (may be absent).
  const header = req.headers?.authorization ?? "";
  // Standard format is "Bearer <token>" (case-insensitive scheme).
  if (header.startsWith("Bearer ")) {
    // Trim to tolerate stray whitespace from copied tokens.
    return header.slice(7).trim() || null;
  }
  // Fall back to the httpOnly cookie set by the login endpoint.
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  // Return the cookie token or null when neither source is present.
  return cookieToken ?? null;
};

/**
 * verifyToken - decodes and validates a JWT.
 * @param {string} token
 * @returns {Object} decoded payload containing `sub` (user id)
 */
const verifyToken = (token) => {
  try {
    // jwt.verify throws for an invalid signature or an expired token.
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    // Distinguish an expired token from a tampered one for a clearer message.
    if (error.name === "TokenExpiredError") {
      // 401 tells the frontend to re-authenticate.
      throw ApiError.unauthorized("Your session has expired. Please log in again.");
    }
    // Anything else means the token is malformed or the signature does not match.
    throw ApiError.unauthorized("Invalid authentication token.");
  }
};

/**
 * protect - blocks the request when no valid token is supplied.
 * On success it attaches `req.user` (a fresh Mongoose document) and `req.userId`.
 */
export const protect = async (req, _res, next) => {
  try {
    // Read the token from the header or the cookie.
    const token = extractToken(req);
    // No token at all means the caller is not authenticated.
    if (!token) throw ApiError.unauthorized("Authentication token is missing.");

    // Decode the payload; throws ApiError(401) on any problem.
    const decoded = verifyToken(token);

    // `sub` holds the user id we signed at login time.
    const userId = decoded?.sub;
    // A token without a subject cannot identify a user.
    if (!userId) throw ApiError.unauthorized("Invalid authentication token.");

    // Load the user. `+password` is intentionally NOT requested here.
    const user = await User.findById(userId);
    // The account may have been deleted after the token was issued.
    if (!user) throw ApiError.unauthorized("This account no longer exists.");
    // Disabled accounts must not be able to use old tokens.
    if (user.isActive === false) throw ApiError.forbidden("This account has been deactivated.");

    // Expose the document to controllers.
    req.user = user;
    // Convenience string id, avoids repeating String(req.user._id) everywhere.
    req.userId = String(user._id);
    // Continue to the controller.
    return next();
  } catch (error) {
    // Forward ApiError and unexpected failures to the error middleware.
    next(error);
  }
};

/**
 * optionalAuth - same as protect but never rejects the request.
 * Used by endpoints that improve their answer when a user is logged in
 * (for example the AI assistant, which reads the farm profile as context).
 */
export const optionalAuth = async (req, _res, next) => {
  try {
    // Read the token; when absent we simply continue unauthenticated.
    const token = extractToken(req);
    // Skip verification entirely when there is no token.
    if (!token) return next();

    // Verify and decode; an invalid optional token is treated as anonymous.
    const decoded = verifyToken(token);
    // Load the user when the subject is present.
    if (decoded?.sub) {
      // Attach the user document when it still exists and is active.
      const user = await User.findById(decoded.sub);
      // Only attach active accounts.
      if (user && user.isActive !== false) {
        // Attach the document for the controller.
        req.user = user;
        // Attach the string id.
        req.userId = String(user._id);
      }
    }
    // Always continue, authenticated or not.
    return next();
  } catch {
    // An invalid optional token should not break a public endpoint.
    return next();
  }
};

/**
 * requireRole - factory that restricts a route to specific roles.
 * Reserved for the future admin/analytics panel; kept here so adding it later
 * does not require changing the auth middleware contract.
 */
export const requireRole = (...roles) => (req, _res, next) => {
  // Reject when the request is not authenticated at all.
  if (!req.user) return next(ApiError.unauthorized("Authentication required."));
  // Reject when the user's role is not in the allowlist.
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden("Insufficient permissions."));
  // Allowed.
  return next();
};

/**
 * issueToken - signs a JWT for a user document.
 * Kept next to the verification logic so the payload shape stays in one place.
 *
 * Reads BOTH the secret and the lifetime from the validated config module rather
 * than from process.env directly. That gives one source of truth and means a
 * missing secret produces a clear, actionable message instead of jsonwebtoken's
 * cryptic "secretOrPrivateKey must have a value" error.
 */
export const issueToken = (user) => {
  // Guard against an unconfigured or empty secret.
  if (!JWT_SECRET || String(JWT_SECRET).length < 32) {
    // Explain exactly what to do, rather than leaking a library error.
    throw new Error(
      "JWT_SECRET is missing or shorter than 32 characters. Set it in .env and restart the server."
    );
  }

  // `sub` is the standard JWT subject claim; `email` is denormalised for logs.
  return jwt.sign({ sub: String(user._id), email: user.email }, JWT_SECRET, {
    // Lifetime comes from the validated config (default 1 day).
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * setAuthCookie - stores the token in an httpOnly cookie.
 * Used by the browser frontend so a page refresh keeps the session.
 */
export const setAuthCookie = (res, token) => {
  // httpOnly + sameSite + secure(in production) cookie.
  res.cookie(AUTH_COOKIE_NAME, token, authCookieOptions(isProduction));
};

/** clearAuthCookie - removes the cookie during logout. */
export const clearAuthCookie = (res) => {
  // Clearing with the same options guarantees the browser drops it.
  res.clearCookie(AUTH_COOKIE_NAME, { ...authCookieOptions(isProduction), maxAge: undefined });
};

/**
 * requireDatabase - blocks database backed routes with a clear 503 when MongoDB
 * is unreachable, instead of letting the request fail with a generic 500 after a
 * 10 second driver timeout.
 *
 * WHY: the API is designed to start even without a database (so /api/health,
 * /api/schemes, /api/crops/* and /api/fertilizer/* remain demonstrable). This
 * middleware gives the database backed routes an honest, immediate response.
 */
export const requireDatabase = (_req, _res, next) => {
  // Check the live Mongoose connection state.
  if (getConnectionState() !== "connected") {
    // 503 tells the client this is a server-side, temporary condition.
    return next(
      ApiError.serviceUnavailable(
        "The database is not connected. Start MongoDB or verify MONGODB_URI, then try again."
      )
    );
  }
  // Database is available, continue to the controller.
  return next();
};
