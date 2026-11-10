/**
 * middleware/rateLimitMiddleware.js
 * -----------------------------------------------------------------------------
 * Request throttling.
 *
 * Two limiters:
 *   apiLimiter      -> general protection for every /api route
 *   aiLimiter       -> much stricter limit for the Gemini endpoint, because each
 *                      call consumes paid API credits and can be slow
 *   authLimiter     -> strict limit on login/register to slow credential stuffing
 *
 * express-rate-limit v8 uses the `limit` option (the older `max` is deprecated).
 */

// Rate limiter factory from express-rate-limit.
import rateLimit from "express-rate-limit";

/**
 * Builds a limiter with the shared response shape.
 * @param {number} windowMs - time window in milliseconds
 * @param {number} limit    - maximum requests per window per IP
 * @param {string} message  - safe message returned with 429
 */
const buildLimiter = (windowMs, limit, message) =>
  rateLimit({
    // Sliding window length.
    windowMs,
    // Maximum requests allowed inside the window (v8 option name).
    limit,
    // Response returned when the limit is exceeded.
    message: { success: false, message },
    // Status code for a throttled response.
    statusCode: 429,
    // Send the modern RateLimit-* headers so clients can self-throttle.
    standardHeaders: "draft-7",
    // Do not send the legacy X-RateLimit-* headers.
    legacyHeaders: false,
    // Skip throttling for successful OPTIONS pre-flight requests.
    skip: (req) => req.method === "OPTIONS",
    // Handlers kept separate so failures never return HTML.
    handler: (_req, res) => {
      // JSON body matching the API envelope.
      res.status(429).json({
        success: false,
        message,
        errors: null,
      });
    },
  });

/**
 * apiLimiter - default limiter applied to the whole /api router.
 * Values come from the environment so they can be tuned per environment.
 */
export const apiLimiter = buildLimiter(
  Number(process.env.RATE_LIMIT_WINDOW_MINUTES ?? 15) * 60 * 1000,
  Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 300),
  "Too many requests from this address. Please wait a few minutes and try again."
);

/**
 * aiLimiter - protects the Gemini powered assistant.
 * 30 requests / 15 minutes is enough for a demo and protects the API quota.
 */
export const aiLimiter = buildLimiter(
  Number(process.env.AI_RATE_LIMIT_WINDOW_MINUTES ?? 15) * 60 * 1000,
  Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS ?? 30),
  "AI assistant limit reached. Please try again in a few minutes."
);

/**
 * authLimiter - applies to login and registration.
 * 20 attempts / 15 minutes per IP makes brute-force attempts impractical.
 */
export const authLimiter = buildLimiter(
  15 * 60 * 1000,
  20,
  "Too many authentication attempts. Please wait 15 minutes and try again."
);
