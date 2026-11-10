/**
 * controllers/weatherController.js
 * -----------------------------------------------------------------------------
 * Weather endpoints.
 *
 *   getCurrentWeather -> GET /api/weather/current?city=Delhi
 *                        alias: GET /api/weather?city=Delhi
 *   getForecast       -> GET /api/weather/forecast?city=Delhi
 *   getWeatherBundle  -> GET /api/weather/bundle?city=Delhi  (current + forecast)
 *
 * Location resolution order:
 *   1. lat + lon query parameters (most accurate)
 *   2. city query parameter
 *   3. the authenticated farmer's saved profile location
 */

import { fetchCurrentWeather, fetchForecast, isWeatherConfigured } from "../services/weatherService.js";
// Operational error helpers.
import ApiError from "../utils/ApiError.js";
// Success envelope.
import { ok } from "../utils/response.js";

/**
 * resolveLocation - decides which location to query.
 *
 * @param {import('express').Request} req
 * @returns {{ city?: string, lat?: number, lon?: number, source: string }}
 */
const resolveLocation = (req) => {
  // Read the query parameters.
  const { city, lat, lon } = req.query;

  // --- Coordinates take priority -----------------------------------------
  if (lat !== undefined && lon !== undefined && lat !== "" && lon !== "") {
    // Return the parsed coordinates.
    return {
      // Latitude as a float.
      lat: Number(lat),
      // Longitude as a float.
      lon: Number(lon),
      // Report that coordinates were used.
      source: "coordinates",
    };
  }

  // --- Explicit city -----------------------------------------------------
  if (city && String(city).trim().length >= 2) {
    // Return the trimmed city name.
    return { city: String(city).trim(), source: "query" };
  }

  // --- Fall back to the farmer's saved profile location -------------------
  const profileLocation = req.user?.location;
  // Only use it when it is non-empty.
  if (profileLocation && String(profileLocation).trim().length >= 2) {
    // Return the saved location.
    return { city: String(profileLocation).trim(), source: "profile" };
  }

  // --- Nothing usable was supplied ---------------------------------------
  // 400 tells the frontend it must ask the user for a location.
  throw ApiError.badRequest("Please provide a city name, or latitude and longitude.");
};

/**
 * getCurrentWeather - current conditions for a location.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getCurrentWeather = async (req, res) => {
  // --- Configuration guard ------------------------------------------------
  if (!isWeatherConfigured()) {
    // 503 because the key is a server configuration concern.
    throw ApiError.serviceUnavailable(
      "Weather information is not configured on this server. Add OPENWEATHER_API_KEY to the environment to enable it."
    );
  }

  // --- Resolve the location ----------------------------------------------
  const location = resolveLocation(req);

  // --- Fetch the current conditions --------------------------------------
  // The service throws an ApiError on any failure.
  const weather = await fetchCurrentWeather(location);

  // Return the normalised payload.
  return ok(res, "Current weather loaded.", {
    // The full current weather object.
    weather,
    // How the location was resolved (coordinates / query / profile).
    locationSource: location.source,
    // Whether the weather key is configured (always true here).
    configured: isWeatherConfigured(),
  });
};

/**
 * getForecast - 5 day forecast for a location.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getForecast = async (req, res) => {
  // --- Configuration guard ------------------------------------------------
  if (!isWeatherConfigured()) {
    // 503 because the key is a server configuration concern.
    throw ApiError.serviceUnavailable(
      "Weather information is not configured on this server. Add OPENWEATHER_API_KEY to the environment to enable it."
    );
  }

  // --- Resolve the location ----------------------------------------------
  const location = resolveLocation(req);

  // --- Fetch the forecast -------------------------------------------------
  const forecast = await fetchForecast(location);

  // Return the location and the daily rows.
  return ok(res, "Forecast loaded.", {
    // Location label the forecast belongs to.
    location: forecast.location,
    // Daily forecast rows.
    forecast: forecast.days,
    // How the location was resolved.
    locationSource: location.source,
    // Provider attribution.
    provider: "OpenWeather",
  });
};

/**
 * getWeatherBundle - current conditions and forecast in one request.
 * This matches what the React weather page renders, so the page needs a single
 * network call instead of two.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getWeatherBundle = async (req, res) => {
  // --- Configuration guard ------------------------------------------------
  if (!isWeatherConfigured()) {
    // 503 because the key is a server configuration concern.
    throw ApiError.serviceUnavailable(
      "Weather information is not configured on this server. Add OPENWEATHER_API_KEY to the environment to enable it."
    );
  }

  // --- Resolve the location once for both calls --------------------------
  const location = resolveLocation(req);

  // --- Fetch both datasets in parallel -----------------------------------
  // Promise.all rejects as soon as either call fails, which is the desired behaviour.
  const [weather, forecast] = await Promise.all([
    // Current conditions.
    fetchCurrentWeather(location),
    // 5 day forecast.
    fetchForecast(location),
  ]);

  // Return the combined payload.
  return ok(res, "Weather bundle loaded.", {
    // Current conditions.
    weather,
    // Daily forecast rows.
    forecast: forecast.days,
    // Location label used.
    location: forecast.location,
    // How the location was resolved.
    locationSource: location.source,
    // Provider attribution.
    provider: "OpenWeather",
  });
};

/**
 * getWeatherStatus - reports the weather module configuration.
 * Used by the frontend to decide whether to show a "sample data" notice.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getWeatherStatus = async (req, res) => {
  // Return the module status without calling the external API.
  return ok(res, "Weather status loaded.", {
    // Whether the OpenWeather key is configured.
    configured: isWeatherConfigured(),
    // Location saved on the farmer's profile, so the UI can preselect it.
    profileLocation: req.user?.location ?? null,
    // Supported query parameters, useful for the integration docs.
    supportedParameters: ["city", "lat", "lon", "units"],
    // Unit labels returned by the API.
    units: { temperature: "°C", wind: "km/h", rain: "mm" },
  });
};
