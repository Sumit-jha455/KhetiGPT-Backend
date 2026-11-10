/**
 * controllers/authController.js
 * -----------------------------------------------------------------------------
 * Authentication endpoints.
 *
 *   registerUser -> POST /api/auth/register
 *   loginUser    -> POST /api/auth/login
 *   logoutUser   -> POST /api/auth/logout
 *   getCurrentUser -> GET  /api/auth/me
 *
 * SECURITY NOTES
 *   - Passwords are hashed with bcryptjs before storage and are never returned.
 *   - Duplicate emails return 409 with a generic field message, never a DB error.
 *   - Login failures always return the SAME message, so an attacker cannot use
 *     the response to discover whether an email exists (user enumeration).
 *   - The JWT is delivered in the JSON body (for Postman/axios) AND as an
 *     httpOnly cookie (so a browser refresh keeps the session).
 */

import User from "../models/User.js";
// Operational error helpers.
import ApiError from "../utils/ApiError.js";
// Success response envelope.
import { ok, created } from "../utils/response.js";
// Token signing and cookie helpers.
import { issueToken, setAuthCookie, clearAuthCookie } from "../middleware/authMiddleware.js";
// Email normalisation used for case-insensitive duplicate detection.
import { isProduction } from "../config/env.js";

/**
 * WHITELISTED_PROFILE_FIELDS
 * Fields the client is allowed to set during registration or a profile update.
 * Everything else in the request body is ignored, which prevents a caller from
 * overwriting `isActive`, `createdAt` or the password hash directly.
 */
export const PROFILE_FIELDS = [
  "fullName",
  "name",
  "email",
  "phone",
  "location",
  "state",
  "district",
  "preferredLanguage",
  "language",
  "farmSize",
  "farmSizeUnit",
  "soilType",
  "irrigationType",
  "waterAvailability",
  "currentCrop",
  "season",
];

/**
 * pickProfileFields - extracts only the whitelisted fields from a payload and
 * normalises the alias pairs into the model's canonical field names.
 *
 * @param {Object} source - request body
 * @returns {Object} clean patch object
 */
export const pickProfileFields = (source = {}) => {
  // Start with an empty patch.
  const patch = {};

  // Iterate the whitelist so nothing unexpected can pass through.
  for (const field of PROFILE_FIELDS) {
    // Skip fields that were not sent at all.
    if (!(field in source)) continue;

    // Read the raw value.
    const value = source[field];

    // --- Alias resolution -------------------------------------------------
    if (field === "name") {
      // `name` is the frontend alias for `fullName`; only use it when fullName is absent.
      if (patch.fullName === undefined && value !== undefined) patch.fullName = value;
      // Move to the next field.
      continue;
    }
    if (field === "language") {
      // `language` is the frontend alias for `preferredLanguage`.
      if (patch.preferredLanguage === undefined && value !== undefined) patch.preferredLanguage = value;
      // Move to the next field.
      continue;
    }
    if (field === "waterAvailability") {
      // `waterAvailability` is the frontend alias for `irrigationType`.
      if (patch.irrigationType === undefined && value !== undefined) patch.irrigationType = value;
      // Move to the next field.
      continue;
    }

    // --- Empty string handling -------------------------------------------
    // Convert "" to null for enum fields so they can be cleared cleanly.
    if (value === "" && ["soilType", "irrigationType", "season"].includes(field)) {
      // Store null so the model enum accepts it.
      patch[field] = null;
      // Move to the next field.
      continue;
    }

    // Assign the whitelisted value.
    patch[field] = value;
  }

  // Return the clean patch.
  return patch;
};

/**
 * buildAuthPayload - the response body for register and login.
 * Returns the safe user object plus the token so the frontend can store it.
 *
 * @param {Object} user  - Mongoose user document
 * @param {string} token - signed JWT
 */
const buildAuthPayload = (user, token) => ({
  // Safe user object (no password hash, no version key).
  user: user.toSafeObject(),
  // JWT for the Authorization: Bearer header.
  token,
  // Token type hint for clients building the header.
  tokenType: "Bearer",
  // Lifetime hint, useful for scheduling a silent refresh later.
  expiresIn: process.env.JWT_EXPIRES_IN || "1d",
});

/**
 * registerUser - creates a new farmer account.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const registerUser = async (req, res) => {
  // --- Extract and normalise the payload ---------------------------------
  const patch = pickProfileFields(req.body);
  // Password is handled separately because it must never enter the patch object.
  const { password, confirmPassword } = req.body;

  // The `name` -> `fullName` alias has been resolved by pickProfileFields(),
  // so patch.fullName holds whichever field the client actually sent.
  const fullName = patch.fullName;

  // --- Required field checks (friendly, specific messages) ---------------
  // Presence is enforced HERE rather than in the validation middleware, because
  // the client may legally send either `name` (the React form) or `fullName`
  // (the canonical API field), and the middleware cannot know which one was used.
  if (!fullName || String(fullName).trim().length < 2) {
    // Name is mandatory. Report the canonical field name.
    throw ApiError.badRequest("Full name is required.", [{ field: "fullName", message: "Full name is required" }]);
  }
  // Email is mandatory.
  if (!patch.email) {
    throw ApiError.badRequest("Email is required.", [{ field: "email", message: "Email is required" }]);
  }
  // Password is mandatory.
  if (!password) {
    throw ApiError.badRequest("Password is required.", [{ field: "password", message: "Password is required" }]);
  }
  // Enforce the minimum length here too, so the rule holds even without validation middleware.
  if (String(password).length < 8) {
    throw ApiError.badRequest("Password must be at least 8 characters long.", [
      { field: "password", message: "Password must be at least 8 characters long" },
    ]);
  }
  // Require at least one letter and one digit for a basic strength floor.
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw ApiError.badRequest("Password must contain at least one letter and one number.", [
      { field: "password", message: "Password must contain at least one letter and one number" },
    ]);
  }
  // Confirm password must match when it was supplied (the register form sends it).
  if (confirmPassword !== undefined && confirmPassword !== null && confirmPassword !== "" && confirmPassword !== password) {
    throw ApiError.badRequest("Passwords do not match.", [
      { field: "confirmPassword", message: "Passwords do not match" },
    ]);
  }

  // --- Duplicate email check ---------------------------------------------
  // Case-insensitive lookup against the normalised email.
  const existing = await User.findOne({ email: patch.email.toLowerCase() }).select("_id").lean();
  // 409 Conflict when the email is already registered.
  if (existing) {
    // The message does not reveal any account detail.
    throw ApiError.conflict("An account with this email already exists.");
  }

  // --- Enum validation for farm fields -----------------------------------
  // Validate soilType against the model's accepted values.
  if (patch.soilType && !User.schema.path("soilType").enumValues.includes(patch.soilType)) {
    // 400 with the accepted values.
    throw ApiError.badRequest(`Soil type must be one of: ${User.schema.path("soilType").enumValues.join(", ")}.`, [
      { field: "soilType", message: "Unsupported soil type" },
    ]);
  }
  // Validate irrigationType.
  if (patch.irrigationType && !User.schema.path("irrigationType").enumValues.includes(patch.irrigationType)) {
    // 400 with the accepted values.
    throw ApiError.badRequest(
      `Irrigation type must be one of: ${User.schema.path("irrigationType").enumValues.join(", ")}.`,
      [{ field: "irrigationType", message: "Unsupported irrigation type" }]
    );
  }
  // Validate preferredLanguage.
  if (patch.preferredLanguage && !User.schema.path("preferredLanguage").enumValues.includes(patch.preferredLanguage)) {
    // Accept the value silently instead of failing: language is cosmetic and
    // should never block registration. Unknown values are stored as "English".
    patch.preferredLanguage = "English";
  }
  // Validate season.
  if (patch.season && !["Kharif", "Rabi", "Zaid"].includes(patch.season)) {
    // 400 with the accepted values.
    throw ApiError.badRequest("Season must be Kharif, Rabi or Zaid.", [
      { field: "season", message: "Unsupported season" },
    ]);
  }

  // --- Create the account ------------------------------------------------
  // Build the document from the clean patch plus the password.
  const user = new User({ ...patch, password: "pending" });
  // Hash the password with bcrypt before saving.
  await user.hashPassword(password);
  // Persist the document. A race on the unique index still throws 11000,
  // which the error middleware converts into a 409.
  await user.save();

  // --- Issue the token ----------------------------------------------------
  const token = issueToken(user);
  // Store it in an httpOnly cookie as well, for browser sessions.
  setAuthCookie(res, token);

  // Return 201 Created with the user and the token.
  return created(res, "Account created successfully. Welcome to KhetiGPT.", buildAuthPayload(user, token));
};

/**
 * loginUser - authenticates an existing farmer.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const loginUser = async (req, res) => {
  // --- Extract the credentials -------------------------------------------
  // Lowercase the email so login is case-insensitive.
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  // Read the password exactly as typed (never trimmed, spaces may be intentional).
  const password = String(req.body?.password ?? "");

  // Reject an obviously incomplete request without touching the database.
  if (!email || !password) {
    // 400 with both fields flagged.
    throw ApiError.badRequest("Email and password are required.", [
      ...(!email ? [{ field: "email", message: "Email is required" }] : []),
      ...(!password ? [{ field: "password", message: "Password is required" }] : []),
    ]);
  }

  // --- Look up the user ---------------------------------------------------
  // `+password` overrides the schema's select:false so the hash can be compared.
  const user = await User.findOne({ email }).select("+password");
  // Generic failure message used for BOTH wrong email and wrong password.
  const invalidMessage = "Invalid email or password.";

  // No account with that email.
  if (!user) {
    // 401 with the generic message (prevents user enumeration).
    throw ApiError.unauthorized(invalidMessage);
  }

  // Disabled accounts cannot log in even with correct credentials.
  if (user.isActive === false) {
    // 403 because the request was authenticated correctly but is not permitted.
    throw ApiError.forbidden("This account has been deactivated. Please contact the project maintainer.");
  }

  // --- Compare the password ----------------------------------------------
  // bcrypt.compare is constant time, which prevents timing attacks.
  const isMatch = await user.comparePassword(password);
  // Same generic message on a password mismatch.
  if (!isMatch) {
    // 401 with the generic message.
    throw ApiError.unauthorized(invalidMessage);
  }

  // --- Issue the token ----------------------------------------------------
  const token = issueToken(user);
  // Store it in an httpOnly cookie as well.
  setAuthCookie(res, token);

  // Return 200 with the user and the token.
  return ok(res, "Login successful.", buildAuthPayload(user, token));
};

/**
 * logoutUser - ends the session on the client.
 *
 * NOTE: stateless JWTs cannot be "invalidated" server side without a blocklist.
 * This endpoint clears the httpOnly cookie and instructs the client to delete
 * its stored token. A token blocklist is listed as a future enhancement.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const logoutUser = async (req, res) => {
  // Clear the httpOnly cookie. Works whether or not a cookie was actually set.
  clearAuthCookie(res);

  // Return a confirmation. `req.user` may be undefined when the token was
  // already absent, so logout is always safe to call.
  return ok(res, "Logged out successfully.", {
    // Tell the client explicitly to discard its stored token.
    cleared: true,
    // Report who was logged out, when identifiable.
    userId: req.userId ?? null,
    // Environment flag so the client knows whether the cookie was `secure`.
    environment: isProduction ? "production" : "development",
  });
};

/**
 * getCurrentUser - returns the authenticated farmer's profile.
 * Used by the frontend on page load to restore the session.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getCurrentUser = async (req, res) => {
  // `protect` has already attached the user document to the request.
  // A missing user at this point would be a routing configuration error.
  if (!req.user) {
    // 401 because the session is not usable.
    throw ApiError.unauthorized("Authentication required.");
  }

  // Return the safe profile object.
  return ok(res, "Profile loaded.", { user: req.user.toSafeObject() });
};
