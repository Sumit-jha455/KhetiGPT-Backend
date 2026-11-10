/**
 * middleware/validateMiddleware.js
 * -----------------------------------------------------------------------------
 * express-validator integration.
 *
 * Exports:
 *   validate(rules)  -> runs a rule chain, then rejects invalid input with 400
 *   handleValidationErrors -> converts collected errors into the API envelope
 *   rules            -> shared, reusable rule chains for common payloads
 *
 * WHY express-validator:
 *   The rules sit next to the route they protect, which is the easiest pattern
 *   for a student to read, extend and demonstrate in a viva.
 */

// Validation builders and the result reader from express-validator v7.
import { validationResult, body, param, query } from "express-validator";
// Operational error carrying a 400 status plus the field details.
import ApiError from "../utils/ApiError.js";

// Re-export the builders so route files can import everything from this module.
export { body, param, query };

/**
 * handleValidationErrors - turns express-validator failures into an ApiError.
 * Must be placed immediately after the rules in the route chain.
 */
export const handleValidationErrors = (req, _res, next) => {
  // Read the errors collected by the preceding rule chains.
  const result = validationResult(req);
  // Nothing failed -> hand control to the controller.
  if (result.isEmpty()) return next();

  // Normalise each failure into the { field, message } shape used by the frontend.
  const errors = result.array({ onlyFirstError: true }).map((error) => ({
    // `path` is the field name in express-validator v7.
    field: error.path ?? error.param ?? "unknown",
    // Human readable message produced by the failing rule.
    message: error.msg,
  }));

  // 400 Bad Request with field level details attached.
  return next(ApiError.badRequest("Validation failed. Please check the highlighted fields.", errors));
};

/**
 * validate - composes rules with the error handler.
 * Usage: router.post("/login", validate(rules.login), loginController)
 *
 * @param {Array} rules - express-validator chains
 * @returns {Array} middleware chain
 */
export const validate = (rules) => [...rules, handleValidationErrors];

/* --------------------------------------------------------------------------
 * Shared rule chains
 * ------------------------------------------------------------------------ */

/**
 * trim + normalise helper: applies to every field so "  A@B.COM " becomes
 * "a@b.com" before the rule chain runs.
 */
const sanitise = (field) => body(field).trim();

/**
 * COMPATIBILITY NOTE
 * The existing React register form sends `name`, while the canonical API field
 * is `fullName`. Both must therefore be OPTIONAL here: marking `fullName` as
 * required would reject every request that only sends `name`, and the validation
 * middleware runs BEFORE the controller's alias resolution ever runs.
 *
 * Presence is enforced in the controller (authController.registerUser), which
 * already resolves `name` -> `fullName`.
 */
export const registerRules = [
  // Canonical field. Validated only when supplied.
  sanitise("fullName")
    .optional({ checkFalsy: true })
    .isLength({ min: 2, max: 80 }).withMessage("Full name must be between 2 and 80 characters")
    .matches(/^[\p{L}\s.'-]+$/u).withMessage("Full name may only contain letters, spaces, apostrophes and hyphens"),
  // Frontend alias for `fullName`.
  sanitise("name")
    .optional({ checkFalsy: true })
    .isLength({ min: 2, max: 80 }).withMessage("Name must be between 2 and 80 characters")
    .matches(/^[\p{L}\s.'-]+$/u).withMessage("Name may only contain letters, spaces, apostrophes and hyphens"),
  // Email: required and validated.
  sanitise("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Please provide a valid email address")
    .normalizeEmail({ gmail_remove_dots: false }),
  // Password: required, minimum 8 characters, must contain a letter and a number.
  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8, max: 72 }).withMessage("Password must be between 8 and 72 characters")
    .matches(/[A-Za-z]/).withMessage("Password must contain at least one letter")
    .matches(/\d/).withMessage("Password must contain at least one number"),
  // Optional confirm password, compared in the controller.
  body("confirmPassword").optional().isString(),
  // Optional location (free text, used by weather and crop modules).
  sanitise("location").optional().isLength({ max: 120 }).withMessage("Location is too long"),
  sanitise("state").optional().isLength({ max: 80 }).withMessage("State is too long"),
  sanitise("district").optional().isLength({ max: 80 }).withMessage("District is too long"),
  // Optional phone: digits, spaces, +, - only.
  sanitise("phone").optional().matches(/^[0-9+\-\s()]{6,20}$/).withMessage("Phone number is not valid"),
  // Optional language preference.
  sanitise("preferredLanguage").optional().isLength({ max: 40 }).withMessage("Language value is too long"),
  sanitise("language").optional().isLength({ max: 40 }).withMessage("Language value is too long"),
  // Optional farm fields, validated against the model enums in the controller.
  body("farmSize").optional({ nullable: true }).isFloat({ min: 0, max: 100000 }).withMessage("Farm size must be a positive number"),
  sanitise("farmSizeUnit").optional().isLength({ max: 20 }).withMessage("Farm size unit is not valid"),
  sanitise("soilType").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Soil type is not valid"),
  sanitise("irrigationType").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Irrigation type is not valid"),
  sanitise("waterAvailability").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Water availability is not valid"),
  sanitise("currentCrop").optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage("Current crop is not valid"),
  sanitise("season").optional({ checkFalsy: true }).isIn(["Kharif", "Rabi", "Zaid"]).withMessage("Season must be Kharif, Rabi or Zaid"),
];

/** Rules for POST /api/auth/login */
export const loginRules = [
  sanitise("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Please provide a valid email address")
    .normalizeEmail({ gmail_remove_dots: false }),
  // Login only checks presence: never reveal whether the password was too short.
  body("password").notEmpty().withMessage("Password is required"),
];

/** Rules for PUT /api/users/profile - every field is optional (partial update). */
export const profileUpdateRules = [
  sanitise("fullName").optional().isLength({ min: 2, max: 80 }).withMessage("Full name must be between 2 and 80 characters"),
  sanitise("name").optional().isLength({ min: 2, max: 80 }).withMessage("Name must be between 2 and 80 characters"),
  sanitise("phone").optional({ checkFalsy: true }).matches(/^[0-9+\-\s()]{6,20}$/).withMessage("Phone number is not valid"),
  sanitise("location").optional({ checkFalsy: true }).isLength({ max: 120 }).withMessage("Location is too long"),
  sanitise("state").optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage("State is too long"),
  sanitise("district").optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage("District is too long"),
  sanitise("preferredLanguage").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Language value is too long"),
  sanitise("language").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Language value is too long"),
  body("farmSize").optional({ nullable: true }).isFloat({ min: 0, max: 100000 }).withMessage("Farm size must be a positive number"),
  sanitise("farmSizeUnit").optional({ checkFalsy: true }).isLength({ max: 20 }).withMessage("Farm size unit is not valid"),
  sanitise("soilType").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Soil type is not valid"),
  sanitise("irrigationType").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Irrigation type is not valid"),
  sanitise("waterAvailability").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Water availability is not valid"),
  sanitise("currentCrop").optional({ checkFalsy: true }).isLength({ max: 80 }).withMessage("Current crop is not valid"),
  sanitise("season").optional({ checkFalsy: true }).isIn(["Kharif", "Rabi", "Zaid"]).withMessage("Season must be Kharif, Rabi or Zaid"),
];

/** Rules for POST /api/assistant/chat */
export const chatRules = [
  body("message")
    .notEmpty().withMessage("Message is required")
    .isString().withMessage("Message must be text")
    .trim()
    .isLength({ min: 2, max: 2000 }).withMessage("Message must be between 2 and 2000 characters"),
  // Optional client-side conversation id, reserved for multi-session support.
  body("conversationId").optional({ checkFalsy: true }).isLength({ max: 64 }),
];

/** Rules for GET /api/weather/current */
export const weatherRules = [
  query("city")
    .optional({ checkFalsy: true })
    .isLength({ min: 2, max: 100 }).withMessage("City name must be between 2 and 100 characters")
    .matches(/^[\p{L}\s,.'-]+$/u).withMessage("City name contains invalid characters"),
  query("lat").optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage("Latitude must be between -90 and 90"),
  query("lon").optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage("Longitude must be between -180 and 180"),
];

/** Rules for POST /api/crops/recommend */
export const cropRules = [
  sanitise("soilType").notEmpty().withMessage("Soil type is required").isLength({ max: 40 }),
  sanitise("season").notEmpty().withMessage("Season is required").isIn(["Kharif", "Rabi", "Zaid"]).withMessage("Season must be Kharif, Rabi or Zaid"),
  sanitise("water").optional({ checkFalsy: true }).isLength({ max: 40 }),
  sanitise("waterAvailability").optional({ checkFalsy: true }).isLength({ max: 40 }),
  sanitise("location").optional({ checkFalsy: true }).isLength({ max: 120 }),
  body("farmSize").optional({ nullable: true }).isFloat({ min: 0, max: 100000 }).withMessage("Farm size must be a positive number"),
  body("temperature").optional({ nullable: true }).isFloat({ min: -20, max: 60 }).withMessage("Temperature must be between -20 and 60 °C"),
  body("rainfall").optional({ nullable: true }).isFloat({ min: 0, max: 12000 }).withMessage("Rainfall must be a positive number of millimetres"),
];

/** Rules for POST /api/fertilizer/guidance */
export const fertilizerRules = [
  sanitise("crop").notEmpty().withMessage("Crop is required").isLength({ max: 80 }),
  sanitise("soilType").notEmpty().withMessage("Soil type is required").isLength({ max: 40 }),
  sanitise("growthStage").notEmpty().withMessage("Growth stage is required")
    .isIn(["Seedling", "Vegetative", "Flowering", "Harvest"]).withMessage("Growth stage must be Seedling, Vegetative, Flowering or Harvest"),
];

/** Rules for GET /api/schemes */
export const schemeRules = [
  query("search").optional({ checkFalsy: true }).isLength({ max: 100 }).withMessage("Search term is too long"),
  query("category").optional({ checkFalsy: true }).isLength({ max: 40 }).withMessage("Category is not valid"),
  query("page").optional({ checkFalsy: true }).isInt({ min: 1, max: 1000 }).withMessage("Page must be a positive integer"),
  query("limit").optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

/** Rules for GET /api/schemes/:id */
export const schemeIdRules = [
  param("id").notEmpty().withMessage("Scheme id is required").isLength({ max: 64 }),
];
