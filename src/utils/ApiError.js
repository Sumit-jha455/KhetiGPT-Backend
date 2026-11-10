/**
 * utils/ApiError.js
 * -----------------------------------------------------------------------------
 * Operational error class used by every controller and service.
 *
 * WHY: throwing plain `new Error("x")` loses the HTTP status code, which forces
 * the error middleware to guess. Throwing an ApiError carries the status code,
 * a safe public message and optional validation details in one object.
 */

class ApiError extends Error {
  /**
   * @param {number} statusCode   - HTTP status code to send (4xx / 5xx)
   * @param {string} message      - SAFE message that may be shown to the client
   * @param {Array|null} [errors] - optional field level validation details
   * @param {Object|null} [meta]  - optional extra context logged on the server only
   */
  constructor(statusCode, message, errors = null, meta = null) {
    // Pass the message to the base Error class so .message works normally.
    super(message);
    // Human readable error name, useful in server logs.
    this.name = "ApiError";
    // HTTP status code that the error middleware will send.
    this.statusCode = statusCode;
    // Marks this as an intentional, expected error (not a programming bug).
    this.isOperational = true;
    // Optional array of { field, message } objects for validation failures.
    this.errors = errors;
    // Optional server-only context (never serialised to the client).
    this.meta = meta;
    // Captures the stack trace at the throw site.
    Error.captureStackTrace(this, this.constructor);
  }

  /** 400 - the request body/query is malformed or fails validation. */
  static badRequest(message = "Invalid request", errors = null) {
    return new ApiError(400, message, errors);
  }

  /** 401 - missing, expired or invalid credentials. */
  static unauthorized(message = "Authentication required") {
    return new ApiError(401, message);
  }

  /** 403 - authenticated but not allowed to access this resource. */
  static forbidden(message = "You do not have access to this resource") {
    return new ApiError(403, message);
  }

  /** 404 - the requested resource does not exist. */
  static notFound(message = "Resource not found") {
    return new ApiError(404, message);
  }

  /** 409 - conflict, e.g. an email that is already registered. */
  static conflict(message = "Resource already exists") {
    return new ApiError(409, message);
  }

  /** 422 - syntactically valid request that fails business rules. */
  static unprocessable(message = "Request could not be processed", errors = null) {
    return new ApiError(422, message, errors);
  }

  /** 429 - too many requests (rate limit reached). */
  static tooManyRequests(message = "Too many requests, please slow down") {
    return new ApiError(429, message);
  }

  /** 503 - a required external dependency (database / API key) is unavailable. */
  static serviceUnavailable(message = "Service temporarily unavailable") {
    return new ApiError(503, message);
  }
}

// Export the class so controllers can `throw ApiError.notFound()`.
export default ApiError;
