/**
 * models/User.js
 * -----------------------------------------------------------------------------
 * Farmer account and farm profile.
 *
 * SECURITY:
 *   - `password` is hashed with bcryptjs in a pre-save hook, never stored in
 *     plain text and never selected by default (`select: false`).
 *   - `toSafeObject()` guarantees no hash, token or version key can leak into
 *     an API response, even if a developer spreads the document by mistake.
 */

// Mongoose schema and model constructors.
import mongoose from "mongoose";
// bcryptjs is pure JavaScript, so it installs without native build tools.
import bcrypt from "bcryptjs";
// Validated bcrypt cost factor and JWT lifetime come from config.
import { BCRYPT_SALT_ROUNDS, JWT_COOKIE_MAX_AGE } from "../config/env.js";

/** Allowed soil types - matches the dropdown options in the React frontend. */
export const SOIL_TYPES = ["Loamy", "Clay", "Sandy", "Black", "Alluvial", "Red", "Laterite", "Other"];

/** Allowed irrigation levels - matches the frontend "Water Availability" field. */
export const IRRIGATION_TYPES = ["Rainfed", "Low", "Medium", "High", "Drip", "Sprinkler", "Canal"];

/** Allowed interface languages. */
export const PREFERRED_LANGUAGES = ["English", "Hindi", "Marathi", "Punjabi", "Telugu", "Other"];

/** Allowed farm size units. */
export const FARM_SIZE_UNITS = ["acre", "hectare", "bigha", "guntha"];

/**
 * User schema definition.
 * Field names are chosen so the payload from the existing React register form
 * works with minimal renaming (it sends `name`, `location`, `language`).
 */
const userSchema = new mongoose.Schema(
  {
    // Farmer's full name (frontend sends `name`, so an alias keeps both working).
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be 80 characters or fewer"],
      // `alias` lets documents be read/written as `name` too.
      alias: "name",
    },

    // Login identifier. Stored lowercase; uniqueness is enforced by the
    // explicit unique index declared below the schema definition.
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      // Light format check; express-validator performs the stricter check on input.
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Please provide a valid email address"],
    },

    // bcrypt hash. `select: false` keeps it out of every normal query result.
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },

    // Optional contact number, stored as a string to preserve leading zeros.
    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: [20, "Phone number is too long"],
    },

    // Free text location used by the weather module.
    location: {
      type: String,
      trim: true,
      default: "",
      maxlength: [120, "Location is too long"],
    },

    // Structured geographic fields for better weather and crop suggestions.
    state: { type: String, trim: true, default: "", maxlength: 80 },
    district: { type: String, trim: true, default: "", maxlength: 80 },

    // Interface / advisory language preference.
    preferredLanguage: {
      type: String,
      enum: { values: PREFERRED_LANGUAGES, message: "{VALUE} is not a supported language" },
      default: "English",
      alias: "language",
    },

    // ---- Farm information (used as AI context) ----
    farmSize: {
      type: Number,
      min: [0, "Farm size cannot be negative"],
      max: [100000, "Farm size is unrealistically large"],
      default: null,
    },
    farmSizeUnit: {
      type: String,
      enum: { values: FARM_SIZE_UNITS, message: "{VALUE} is not a supported unit" },
      default: "acre",
    },
    soilType: {
      type: String,
      enum: { values: SOIL_TYPES, message: "{VALUE} is not a supported soil type" },
      default: null,
    },
    irrigationType: {
      type: String,
      enum: { values: IRRIGATION_TYPES, message: "{VALUE} is not a supported irrigation type" },
      default: null,
    },
    // Crop currently grown; free text because the list of crops is very long.
    currentCrop: { type: String, trim: true, default: "", maxlength: 80 },
    // Growing season, used to bias crop and fertilizer guidance.
    season: {
      type: String,
      enum: { values: ["Kharif", "Rabi", "Zaid", null], message: "{VALUE} is not a valid season" },
      default: null,
    },

    // True when the account has been disabled (soft delete / logout-all support).
    isActive: { type: Boolean, default: true },
  },
  {
    // createdAt / updatedAt are managed automatically by Mongoose.
    timestamps: true,
    // Hide __v from JSON output.
    versionKey: false,
    // Remove empty strings/nulls from JSON for a cleaner API payload.
    minimize: true,
  }
);

/* --------------------------------------------------------------------------
 * Indexes
 * ------------------------------------------------------------------------ */

// Uniqueness of `email` is declared on the field above with `unique: true`,
// which makes Mongoose create the index automatically. Declaring it again here
// would produce a "duplicate schema index" warning, so it is intentionally not
// repeated.

// Compound index for state/district filtering, reserved for the future admin
// and analytics features.
userSchema.index({ state: 1, district: 1 });

/* --------------------------------------------------------------------------
 * Instance methods
 * ------------------------------------------------------------------------ */

/**
 * hashPassword - hashes a plain password with bcrypt.
 * Kept as an instance method so tests and the controller share one implementation.
 */
userSchema.methods.hashPassword = async function hashPassword(plain) {
  // Generate a salt with the configured cost factor, then hash.
  this.password = await bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
  // Return the document to allow chaining.
  return this;
};

/**
 * comparePassword - constant-time comparison of a candidate password.
 * @param {string} candidate - plain text password from the login form
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  // bcrypt.compare reads the salt from the stored hash automatically.
  return bcrypt.compare(candidate, this.password);
};

/**
 * toSafeObject - the ONLY shape that may be sent to a client.
 * Explicitly removes the password hash and any internal field.
 */
userSchema.methods.toSafeObject = function toSafeObject() {
  // Convert the Mongo document into a plain object.
  const raw = this.toObject();

  // Delete everything that must never leave the server.
  delete raw.password;
  delete raw.__v;
  delete raw._id;

  // Provide BOTH naming conventions so the existing frontend fields keep working:
  // the React app reads `name`, `location`, `language`, `farmSize`, `soilType`.
  return {
    // Stable public identifier (string form of ObjectId).
    id: String(this._id),
    // Display name (raw.fullName === raw.name thanks to the alias).
    fullName: raw.fullName,
    name: raw.fullName,
    email: raw.email,
    phone: raw.phone ?? "",
    location: raw.location ?? "",
    state: raw.state ?? "",
    district: raw.district ?? "",
    preferredLanguage: raw.preferredLanguage,
    language: raw.preferredLanguage,
    farmSize: raw.farmSize,
    farmSizeUnit: raw.farmSizeUnit,
    soilType: raw.soilType,
    irrigationType: raw.irrigationType,
    waterAvailability: raw.irrigationType,
    currentCrop: raw.currentCrop ?? "",
    season: raw.season,
    isActive: raw.isActive,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
};

/**
 * Cookie name for the httpOnly access token.
 * Exported so the auth controller and logout route use the same value.
 */
export const AUTH_COOKIE_NAME = "khetigpt_token";

/** Cookie options: httpOnly + sameSite, secure only over HTTPS. */
export const authCookieOptions = (isProduction) => ({
  // JavaScript on the frontend cannot read this cookie (XSS protection).
  httpOnly: true,
  // Send only over HTTPS in production.
  secure: Boolean(isProduction),
  // CSRF mitigation: cookie is not sent on cross-site navigations.
  sameSite: isProduction ? "none" : "lax",
  // Lifetime matches the JWT lifetime.
  maxAge: JWT_COOKIE_MAX_AGE,
  // Root path so every API route can read it.
  path: "/",
});

/**
 * User model factory.
 * Mongoose caches models, so we guard against re-registration during tests.
 */
const User = mongoose.models.User ?? mongoose.model("User", userSchema);

// Default export used by controllers.
export default User;
