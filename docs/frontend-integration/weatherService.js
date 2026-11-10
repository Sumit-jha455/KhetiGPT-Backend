/**
 * weatherService.js — READY TO PASTE into the React frontend at src/services/weatherService.js
 * -----------------------------------------------------------------------------
 * Replaces the static sample data with real OpenWeather data.
 * The returned field names match src/data/mockWeather.js exactly, so Weather.jsx
 * and the dashboard's weather card need NO JSX changes.
 */

// Shared axios instance.
import api from "./api";

/**
 * Fetches the current conditions and the 5-day forecast in ONE request.
 *
 * @param {string} location - e.g. "Nashik, Maharashtra"
 * @returns {Promise<{current: Object, forecast: Array, location: string}>}
 */
export async function fetchWeatherBundle(location) {
  // GET /api/weather/bundle?city=…
  // An authenticated request with no `city` uses the profile's saved location.
  const { data } = await api.get("/weather/bundle", {
    params: location ? { city: location } : {},
  });

  // Return the two blocks your page already renders.
  return {
    // Current conditions block.
    current: data.data.weather,
    // Daily forecast array.
    forecast: data.data.forecast,
    // Location label the data belongs to.
    location: data.data.location,
  };
}

/** Backwards-compatible alias matching your existing function name. */
export async function fetchCurrentWeather(location) {
  // Delegate to the bundle call and return only the current block.
  const bundle = await fetchWeatherBundle(location);
  // Return the current conditions.
  return bundle.current;
}

/** Returns the 5-day forecast. */
export async function fetchForecast(location) {
  // Delegate to the bundle call and return only the forecast.
  const bundle = await fetchWeatherBundle(location);
  // Return the daily rows.
  return bundle.forecast;
}

/** Reports whether the weather module is configured on the server. */
export async function getWeatherStatus() {
  try {
    // GET /api/weather/status
    const { data } = await api.get("/weather/status");
    // Return the status block.
    return data.data;
  } catch {
    // Degrade gracefully.
    return { configured: false, profileLocation: null };
  }
}

/**
 * Maps the backend's icon keys onto the same keys your ICON_MAP already uses.
 * They are identical, so this is a no-op kept for explicitness.
 */
export const mapIcon = (icon) => icon ?? "cloud-sun";

// Default export.
export default { fetchWeatherBundle, fetchCurrentWeather, fetchForecast, getWeatherStatus, mapIcon };
