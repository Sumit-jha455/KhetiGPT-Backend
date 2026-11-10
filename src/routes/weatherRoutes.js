/**
 * routes/weatherRoutes.js
 * -----------------------------------------------------------------------------
 * Weather route definitions.
 *
 *   GET /api/weather/current?city=Delhi   -> getCurrentWeather
 *   GET /api/weather/forecast?city=Delhi  -> getForecast
 *   GET /api/weather/bundle?city=Delhi    -> getWeatherBundle (current + forecast)
 *   GET /api/weather/status               -> getWeatherStatus
 *   GET /api/weather?city=Delhi           -> getCurrentWeather (alias)
 *
 * Optional auth is applied so a logged-in farmer can omit the `city` parameter
 * and have their saved profile location used instead.
 */

import { Router } from "express";
// Controller functions.
import {
  getCurrentWeather,
  getForecast,
  getWeatherBundle,
  getWeatherStatus,
} from "../controllers/weatherController.js";
// Validation helper and the weather rules.
import { validate, weatherRules } from "../middleware/validateMiddleware.js";
// optionalAuth lets the profile location be used without blocking anonymous calls.
import { optionalAuth } from "../middleware/authMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the weather router.
const router = Router();

/**
 * GET /api/weather/current
 * Returns current conditions for a city or for lat/lon coordinates.
 */
router.get("/current", optionalAuth, validate(weatherRules), asyncHandler(getCurrentWeather));

/**
 * GET /api/weather/forecast
 * Returns a 5 day forecast aggregated from OpenWeather's 3-hourly steps.
 */
router.get("/forecast", optionalAuth, validate(weatherRules), asyncHandler(getForecast));

/**
 * GET /api/weather/bundle
 * Returns the current conditions and the forecast in a single response, which
 * matches what the React weather page renders in one visit.
 */
router.get("/bundle", optionalAuth, validate(weatherRules), asyncHandler(getWeatherBundle));

/**
 * GET /api/weather/status
 * Reports whether the OpenWeather key is configured and returns the farmer's
 * saved location so the UI can preselect it.
 */
router.get("/status", optionalAuth, asyncHandler(getWeatherStatus));

/**
 * GET /api/weather
 * Alias of /current. The existing React frontend's ENDPOINTS map already
 * contains "/weather", so this alias keeps it working unchanged.
 */
router.get("/", optionalAuth, validate(weatherRules), asyncHandler(getCurrentWeather));

// Export the configured router.
export default router;
