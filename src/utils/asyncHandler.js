/**
 * utils/asyncHandler.js
 * -----------------------------------------------------------------------------
 * Wraps an async route handler so any rejected promise is forwarded to the
 * centralized Express error middleware instead of crashing the process.
 *
 * Without this wrapper, `await User.create(...)` throwing inside a route
 * handler produces an unhandled rejection in Express 4.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: Function) => Promise<any>} fn
 * @returns the wrapped handler
 */
const asyncHandler = (fn) =>
  // Express calls the returned function with (req, res, next).
  (req, res, next) => {
    // Resolve the handler and forward any rejection to `next` (the error middleware).
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// Export a single named function - there is no default object to keep it simple.
export default asyncHandler;
