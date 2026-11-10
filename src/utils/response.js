/**
 * utils/response.js
 * -----------------------------------------------------------------------------
 * Response envelope helpers.
 *
 * EVERY successful endpoint returns the SAME shape, which keeps the frontend
 * axios layer simple:
 *
 *   {
 *     "success": true,
 *     "message": "Human readable confirmation",
 *     "data":    { ...module specific payload... }
 *   }
 *
 * Errors are produced by middleware/errorMiddleware.js and mirror this shape
 * with success: false.
 */

/**
 * sendSuccess - sends a 2xx JSON response using the standard envelope.
 * @param {import('express').Response} res
 * @param {number} statusCode - HTTP status (200, 201...)
 * @param {string} message    - short human readable confirmation
 * @param {any}    data       - payload consumed by the frontend
 * @param {Object} [meta]     - optional pagination/count metadata
 */
export const sendSuccess = (res, statusCode, message, data = null, meta = null) => {
  // Build the envelope once so no endpoint can drift from the contract.
  const body = {
    // Always true on success.
    success: true,
    // Human readable message, safe to display in a toast.
    message,
    // The payload. Kept last so the first two keys are predictable.
    data,
  };

  // Attach pagination/count metadata only when the caller supplied it.
  if (meta) body.meta = meta;

  // Send the response with the requested status code.
  return res.status(statusCode).json(body);
};

/**
 * ok   -> 200 with data
 * created -> 201 with data (used by register and other creation endpoints)
 */
export const ok = (res, message, data = null, meta = null) =>
  // Delegate to sendSuccess with a 200 status.
  sendSuccess(res, 200, message, data, meta);

export const created = (res, message, data = null) =>
  // Delegate to sendSuccess with a 201 status.
  sendSuccess(res, 201, message, data);
