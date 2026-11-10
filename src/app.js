/**
 * app.js
 * -----------------------------------------------------------------------------
 * Express application factory.
 *
 * Separating the app from server.js has two benefits:
 *   - `server.js` only concerns itself with listening on a port.
 *   - the automated tests can import the app without opening a port.
 *
 * MIDDLEWARE ORDER (this matters in Express):
 *   1. trust proxy           - correct client IP behind Render/Heroku/Nginx
 *   2. security headers      - helmet
 *   3. CORS                  - allowlist only
 *   4. body parsing          - JSON with a size limit
 *   5. cookies               - to read the httpOnly auth cookie
 *   6. request logging       - one concise line per request
 *   7. rate limiting         - applied to the /api router
 *   8. routes                - /api/*
 *   9. 404 handler           - catches unmatched routes
 *  10. error handler         - last, converts any error into JSON
 */

import express from "express";
// Security headers.
import helmet from "helmet";
// CORS middleware.
import cors from "cors";
// Cookie parsing, needed for the httpOnly auth cookie.
import cookieParser from "cookie-parser";
// Validated configuration.
import { isProduction, CORS_ORIGINS, PORT } from "./config/env.js";
// Rate limiters.
import { apiLimiter } from "./middleware/rateLimitMiddleware.js";
// 404 and centralized error handlers.
import { notFoundHandler, errorHandler } from "./middleware/errorMiddleware.js";
// API router with every module mounted.
import apiRouter, { API_PREFIX } from "./routes/index.js";

/** Prefix used for the root informational route. */
export const API_ROOT = API_PREFIX;

/**
 * buildCorsOptions - builds the CORS configuration.
 *
 * An explicit allowlist is used instead of `origin: *`, because the API carries
 * authentication credentials. A wildcard origin is not permitted with
 * credentials and would also let any website call the API with a stolen token.
 */
const buildCorsOptions = () => ({
  // Function form allows exact matching against the allowlist.
  origin: (origin, callback) => {
    // Allow requests with no Origin header (curl, Postman, server-to-server).
    if (!origin) return callback(null, true);
    // Normalise by removing a trailing slash for a safe comparison.
    const clean = origin.replace(/\/$/, "");
    // Allow when the origin is in the configured allowlist.
    if (CORS_ORIGINS.includes(clean)) return callback(null, true);
    // In development we are permissive so a student can test from any local port.
    if (!isProduction) return callback(null, true);
    // Otherwise reject with a clear CORS failure.
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  // Allow the browser to send the session cookie.
  credentials: true,
  // Explicitly allow the methods this API uses.
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  // Allow the headers the frontend sends.
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  // Cache the pre-flight response for one hour.
  maxAge: 3600,
});

/**
 * createApp - builds and returns the configured Express application.
 * @returns {import('express').Express}
 */
const createApp = () => {
  // Create the application instance.
  const app = express();

  // --- 1. Trust the reverse proxy ----------------------------------------
  // Required on Render/Heroku/Nginx so req.ip is the real client IP, which the
  // rate limiter depends on. Only enabled in production to avoid local spoofing.
  if (isProduction) app.set("trust proxy", 1);

  // Disable the X-Powered-By header, which reveals the server stack.
  app.disable("x-powered-by");

  // --- 2. Security headers ----------------------------------------------
  app.use(
    helmet({
      // contentSecurityPolicy is relaxed because this is a JSON API consumed
      // by a separate frontend origin; tightening it would block nothing but
      // add noise for a student deployment.
      contentSecurityPolicy: false,
      // crossOriginResourcePolicy must allow cross-origin reads by the frontend.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );

  // --- 3. CORS -----------------------------------------------------------
  app.use(cors(buildCorsOptions()));
  // Answer pre-flight requests for every route.
  app.options("*", cors(buildCorsOptions()));

  // --- 4. Body parsing with a size limit ---------------------------------
  // The limit protects the server from oversized payloads. 1mb is generous for
  // this API's payloads (a chat message is capped at 2000 characters anyway).
  app.use(express.json({ limit: "1mb" }));
  // Form encoded bodies are accepted for Postman convenience.
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // --- 5. Cookies --------------------------------------------------------
  app.use(cookieParser());

  // --- 6. Concise request logging ---------------------------------------
  // Skipped in production to keep logs and costs down.
  if (!isProduction) {
    app.use((req, _res, next) => {
      // Single line: method, path, and whether the request was authenticated.
      console.log(`[http] ${req.method} ${req.originalUrl}${req.user ? " (auth)" : ""}`);
      // Continue to the next middleware.
      next();
    });
  }

  // --- 7. Root informational route --------------------------------------
  app.get("/", (_req, res) => {
    // Small HTML-free JSON response describing the API.
    res.json({
      // API identity.
      success: true,
      message: "KhetiGPT Backend API is running.",
      data: {
        // Project name.
        service: "KhetiGPT - AI-Powered Personal Farming Assistant",
        // Documentation entry points.
        endpoints: {
          // Health check.
          health: `${API_PREFIX}/health`,
          // All module routers.
          auth: `${API_PREFIX}/auth`,
          users: `${API_PREFIX}/users`,
          assistant: `${API_PREFIX}/assistant`,
          weather: `${API_PREFIX}/weather`,
          crops: `${API_PREFIX}/crops`,
          fertilizer: `${API_PREFIX}/fertilizer`,
          schemes: `${API_PREFIX}/schemes`,
        },
        // Environment name.
        environment: isProduction ? "production" : "development",
        // Listening port, useful in the deployment logs.
        port: PORT,
      },
    });
  });

  // --- 8. API routes with the general rate limiter ----------------------
  app.use(API_PREFIX, apiLimiter, apiRouter);

  // --- 9. 404 for anything unmatched ------------------------------------
  app.use(notFoundHandler);

  // --- 10. Centralized error handler ------------------------------------
  // Must be registered last.
  app.use(errorHandler);

  // Return the configured app.
  return app;
};

// Export the factory as the default export.
export default createApp;
