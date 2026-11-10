/**
 * controllers/userController.js
 * -----------------------------------------------------------------------------
 * Farmer profile endpoints.
 *
 *   getProfile    -> GET /api/users/profile   (alias: GET /api/users/me)
 *   updateProfile -> PUT /api/users/profile   (alias: PUT /api/users/me)
 *
 * The aliases exist because the existing React frontend's ENDPOINTS map already
 * contains "/users/me". Supporting both paths means the frontend needs no change
 * to start working against this backend.
 */

import User from "../models/User.js";
// Operational error helpers.
import ApiError from "../utils/ApiError.js";
// Success envelope.
import { ok } from "../utils/response.js";
// Whitelisted field extractor shared with the auth controller.
import { pickProfileFields } from "./authController.js";

/**
 * getProfile - returns the authenticated farmer's profile and farm information.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getProfile = async (req, res) => {
  // Re-read the user from the database so the response is never a stale token payload.
  const user = await User.findById(req.userId);
  // The account may have been deleted after the token was issued.
  if (!user) {
    // 404 because the resource no longer exists.
    throw ApiError.notFound("This account no longer exists.");
  }

  // Return the safe profile object.
  return ok(res, "Profile loaded.", { user: user.toSafeObject() });
};

/**
 * updateProfile - performs a partial update of the farmer's profile.
 * Only whitelisted fields are accepted; unknown fields are ignored silently.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const updateProfile = async (req, res) => {
  // --- Load the current document -----------------------------------------
  const user = await User.findById(req.userId);
  // Guard against a deleted account.
  if (!user) {
    // 404 because the resource no longer exists.
    throw ApiError.notFound("This account no longer exists.");
  }

  // --- Extract the permitted fields --------------------------------------
  const patch = pickProfileFields(req.body);

  // Nothing valid was sent, so there is nothing to change.
  if (Object.keys(patch).length === 0) {
    // 400 with a clear message.
    throw ApiError.badRequest("No valid profile fields were provided.");
  }

  // --- Reject email changes ----------------------------------------------
  // Changing the login identifier has security implications (it appears in the
  // JWT payload), so it is not supported in this version.
  if (patch.email && patch.email !== user.email) {
    // 400 with a clear explanation.
    throw ApiError.badRequest("Email cannot be changed in this version. Please contact the project maintainer.", [
      { field: "email", message: "Email cannot be changed" },
    ]);
  }
  // Remove the email key so Mongoose does not try to set it.
  delete patch.email;

  // --- Validate enum fields against the model ----------------------------
  // soilType must be one of the model's accepted values.
  if (patch.soilType && !User.schema.path("soilType").enumValues.includes(patch.soilType)) {
    // 400 with the accepted values.
    throw ApiError.badRequest(`Soil type must be one of: ${User.schema.path("soilType").enumValues.join(", ")}.`, [
      { field: "soilType", message: "Unsupported soil type" },
    ]);
  }
  // irrigationType must be one of the model's accepted values.
  if (patch.irrigationType && !User.schema.path("irrigationType").enumValues.includes(patch.irrigationType)) {
    // 400 with the accepted values.
    throw ApiError.badRequest(
      `Irrigation type must be one of: ${User.schema.path("irrigationType").enumValues.join(", ")}.`,
      [{ field: "irrigationType", message: "Unsupported irrigation type" }]
    );
  }
  // season must be one of the three Indian cropping seasons.
  if (patch.season && !["Kharif", "Rabi", "Zaid"].includes(patch.season)) {
    // 400 with the accepted values.
    throw ApiError.badRequest("Season must be Kharif, Rabi or Zaid.", [
      { field: "season", message: "Unsupported season" },
    ]);
  }
  // Unknown language values are normalised rather than rejected, because a
  // language preference should never block a profile save.
  if (patch.preferredLanguage && !User.schema.path("preferredLanguage").enumValues.includes(patch.preferredLanguage)) {
    // Store a supported default instead.
    patch.preferredLanguage = "English";
  }
  // farmSize must be a positive number when supplied.
  if (patch.farmSize !== undefined && patch.farmSize !== null && patch.farmSize !== "") {
    // Coerce to a number.
    const size = Number(patch.farmSize);
    // Reject non-numeric or negative values.
    if (!Number.isFinite(size) || size < 0) {
      // 400 with the field details.
      throw ApiError.badRequest("Farm size must be a positive number.", [
        { field: "farmSize", message: "Farm size must be a positive number" },
      ]);
    }
    // Store the coerced number.
    patch.farmSize = size;
  } else if (patch.farmSize === "") {
    // Treat an empty string as "clear this field".
    patch.farmSize = null;
  }

  // --- Apply the patch and save ------------------------------------------
  // Assign each whitelisted key onto the document.
  Object.assign(user, patch);
  // Save triggers the schema validators again, which protects data integrity.
  await user.save();

  // Return the updated safe profile.
  return ok(res, "Profile updated successfully.", { user: user.toSafeObject() });
};
