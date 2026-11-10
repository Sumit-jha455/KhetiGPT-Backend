/**
 * middleware/errorMiddleware.js
 * -----------------------------------------------------------------------------
 * Centralised error handling.
 *
 * Every thrown error in the application ends up here:
 *   - ApiError          -> intentional, expected failure -> safe message + status
 *   - Mongoose ValidationError -> 400 with field details
 *   - Mongoose duplicate key (code 11000)     -> 409
 *   - Malformed JSON body                     -> 400
 *   - CastError (invalid ObjectId)            -> 400
 *   - anything else                           -> 500 with the details hidden
 *
 * No stack traces, no Mongo error text and no third-party API messages are ever
 * returned to the client.
 */

import mongoose from "mongoose";
// Configuration flags used to decide how much detail to reveal.
import { isProduction } from "../config/env.js";

/**
 * notFoundHandler - catches requests to unknown routes.
 * Placed AFTER every API route in app.js.
 */
export const notFoundHandler = (req, _res, next) => {
  // Build a readable message including the method and path.
  const message = `Route not found: ${req.method} ${req.originalUrl}`;
  // Forward a 404 error to the main handler.
  next(Object.assign(new Error(message), { statusCode: 404, isOperational: true }));
};

/**
 * translateError - maps framework/driver errors into a safe response.
 * @param {Error} error - the original error
 * @returns {{ status: number, message: string, errors: Array|null }}
 */
const translateError = (error) => {
  // --- Malformed JSON body -------------------------------------------------
  if (error.type === "entity.parse.failed" || error instanceof SyntaxError) {
    // The request body was not valid JSON.
    return { status: 400, message: "Request body must be valid JSON.", errors: null };
  }

  // --- Request body larger than the configured limit ----------------------
  if (error.type === "entity.too.large") {
    // Protects the server from oversized payloads.
    return { status: 413, message: "Request body is too large.", errors: null };
  }

  // --- Mongoose schema validation ----------------------------------------
  if (error instanceof mongoose.Error.ValidationError) {
    // Convert each validator failure into the shared { field, message } shape.
    const errors = Object.values(error.errors).map((issue) => ({
      // Field name that failed.
      field: issue.path,
      // Validator message defined in the model.
      message: issue.message,
    }));
    // 400 with the details so the frontend can highlight the fields.
    return { status: 400, message: "Validation failed. Please check the highlighted fields.", errors };
  }

  // --- Duplicate key (e.g. the same email registered twice) ---------------
  if (error.code === 11000) {
    // Extract the offending field name(s) from the driver error.
    const field = Object.keys(error.keyValue ?? {})[0] ?? "field";
    // 409 Conflict with a message that does not leak database details.
    return {
      status: 409,
      message: field === "email" ? "An account with this email already exists." : `This ${field} is already in use.`,
      errors: [{ field, message: "This value is already taken" }],
    };
  }

  // --- Invalid ObjectId ---------------------------------------------------
  if (error instanceof mongoose.Error.CastError) {
    // A malformed id was used in a query parameter.
    return { status: 400, message: "The provided identifier is not valid.", errors: null };
  }

  // --- Expired JWT --------------------------------------------------------
  if (error.name === "TokenExpiredError") {
    // 401 tells the frontend to refresh the session.
    return { status: 401, message: "Your session has expired. Please log in again.", errors: null };
  }

  // --- Invalid / tampered JWT --------------------------------------------
  if (error.name === "JsonWebTokenError") {
    // 401 with a generic message; never reveal why the signature failed.
    return { status: 401, message: "Invalid authentication token.", errors: null };
  }

  // --- Operational errors thrown by our own code -------------------------
  if (error.isOperational) {
    // The generic validation placeholder written by handleValidationErrors.
    // When the request failed several rules at once, promoting the FIRST field
    // message gives the frontend one immediately usable sentence for its toast,
    // while the complete list stays available in `errors`.
    const GENERIC_VALIDATION_MESSAGE = "Validation failed. Please check the highlighted fields.";
    // Only promote when the top level message is the generic placeholder, so a
    // specific message written by a controller is never overwritten.
    const shouldPromote = error.message === GENERIC_VALIDATION_MESSAGE && Array.isArray(error.errors) && error.errors.length > 0;
    // Safe to return the message we wrote ourselves.
    return {
      status: error.statusCode ?? 500,
      // Use the specific message, or the first field message for batch validation errors.
      message: shouldPromote ? error.errors[0].message : error.message,
      // Keep the full field list for forms that highlight every problem.
      errors: error.errors ?? null,
    };
  }

  // --- Anything else is a bug --------------------------------------------
  // Return a generic 500; details go to the server log only.
  return { status: 500, message: "Something went wrong on our side. Please try again.", errors: null };
};

/**
 * errorHandler - the single JSON error responder for the whole API.
 * Signature must be (err, req, res, next) for Express to recognise it.
 */
export const errorHandler = (error, req, res, _next) => {
  // Translate the raw error into a safe response description.
  const details = translateError(error);

  // Log server-side. Full details are visible in the terminal/hosting dashboard.
  if (details.status >= 500) {
    // 5xx errors are bugs or infrastructure failures: print the stack.
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${details.status}`, error);
  } else {
    // 4xx errors are client mistakes: a single line is enough.
    console.warn(`[error] ${req.method} ${req.originalUrl} -> ${details.status}: ${details.message}`);
  }

  // Build the response envelope.
  const body = {
    // Always false for errors.
    success: false,
    // Safe, client-displayable message.
    message: details.message,
    // Optional field level details.
    errors: details.errors,
  };

  // Include debugging information ONLY outside production.
  if (!isProduction) {
    // The error class name helps during development.
    body.debug = {
      // Error name, e.g. "ApiError".
      name: error.name,
      // Raw message, which is safe in development only.
      raw: error.message,
    };
  }

  // Send the JSON response with the resolved status code.
  return res.status(details.status).json(body);
};
