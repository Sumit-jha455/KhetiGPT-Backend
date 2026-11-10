/**
 * services/weatherService.js
 * -----------------------------------------------------------------------------
 * OpenWeather API integration.
 *
 * ENDPOINTS USED:
 *   GET /data/2.5/weather           -> current conditions (free plan)
 *   GET /data/2.5/forecast          -> 5 day / 3 hour forecast (free plan)
 *
 * The free OpenWeather plan does NOT include the One Call 3.0 endpoints, so
 * this service deliberately uses the two endpoints above - they work on the
 * standard free key.
 *
 * The public response shape matches the existing React weather page exactly:
 *   current:  { location, temperature, feelsLike, condition, description, icon,
 *               humidity, windSpeed, rainProbability, sunrise, sunset, updatedAt }
 *   forecast: [{ date, condition, description, icon, high, low, rain, humidity, wind }]
 */

import axios from "axios";
// Validated configuration values.
import { OPENWEATHER_API_KEY, OPENWEATHER_BASE_URL } from "../config/env.js";
// Operational error type with correct HTTP status codes.
import ApiError from "../utils/ApiError.js";

/** Shared axios instance for OpenWeather with a sane timeout. */
const http = axios.create({
  // Base URL from the environment.
  baseURL: OPENWEATHER_BASE_URL,
  // Abort after 8 seconds so the request never hangs the API.
  timeout: 8000,
});

/** True when the OpenWeather feature is usable. Used by /api/health. */
export const isWeatherConfigured = () => Boolean(OPENWEATHER_API_KEY);

/**
 * ICON_MAP - translates OpenWeather's icon codes into a small, stable set of
 * keys the frontend maps onto its own icons.
 * Reference: https://openweathermap.org/weather-conditions
 */
const ICON_MAP = {
  "01d": "sun",
  "01n": "sun",
  "02d": "cloud-sun",
  "02n": "cloud-sun",
  "03d": "cloud",
  "03n": "cloud",
  "04d": "cloud",
  "04n": "cloud",
  "09d": "cloud-rain",
  "09n": "cloud-rain",
  "10d": "cloud-rain",
  "10n": "cloud-rain",
  "11d": "cloud-lightning",
  "11n": "cloud-lightning",
  "13d": "cloud",
  "13n": "cloud",
  "50d": "cloud",
  "50n": "cloud",
};

/**
 * kelvinToCelsius - converts the Kelvin value OpenWeather returns into Celsius,
 * rounded to one decimal place.
 */
const kelvinToCelsius = (kelvin) => Math.round(((Number(kelvin) ?? 0) - 273.15) * 10) / 10;

/**
 * mapIcon - returns the internal icon key for an OpenWeather icon code.
 */
const mapIcon = (code) => ICON_MAP[code] ?? "cloud-sun";

/**
 * formatTime - formats a Unix UTC timestamp for a given timezone offset into
 * a readable local "hh:mm AM" string.
 */
const formatTime = (unixSeconds, timezoneOffsetSeconds) => {
  // Build a Date shifted by the location's timezone offset.
  const date = new Date((Number(unixSeconds) + Number(timezoneOffsetSeconds ?? 0)) * 1000);
  // Format as UTC hours/minutes, which after the shift represent local time.
  const hours = date.getUTCHours();
  // 12-hour clock hour value.
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  // Meridiem label.
  const meridiem = hours >= 12 ? "PM" : "AM";
  // Zero-padded minutes.
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  // Combine into the final string.
  return `${String(hour12).padStart(2, "0")}:${minutes} ${meridiem}`;
};

/**
 * throwWeatherError - converts an axios/OpenWeather failure into an ApiError.
 * Kept separate so the mapping is easy to read and test.
 *
 * @param {Error}  error  - the caught error
 * @param {string} target - what was requested, used in the log only
 */
const throwWeatherError = (error, target) => {
  // Status returned by OpenWeather, when the request reached it.
  const status = error?.response?.status;

  // Log the underlying cause server-side with the target for context.
  console.error(`[weather] request failed for "${target}":`, error?.message);

  // --- 404: the city name was not recognised ------------------------------
  if (status === 404) {
    // Tell the user their input was the problem, not the server.
    return ApiError.notFound(
      "That location could not be found. Please check the spelling or try a nearby larger town."
    );
  }

  // --- 401: invalid or not-yet-active API key -----------------------------
  if (status === 401) {
    // New OpenWeather keys take a couple of hours to activate.
    return ApiError.serviceUnavailable(
      "The weather service rejected its API key. Please verify OPENWEATHER_API_KEY (new keys can take up to 2 hours to activate)."
    );
  }

  // --- 429: plan or rate limit exceeded -----------------------------------
  if (status === 429) {
    // Too many requests on the current plan.
    return ApiError.tooManyRequests("The weather service is rate limited right now. Please try again shortly.");
  }

  // --- Timeout ------------------------------------------------------------
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    // OpenWeather did not respond in time.
    return ApiError.serviceUnavailable("The weather service did not respond in time. Please try again.");
  }

  // --- Network unreachable ------------------------------------------------
  if (error?.code === "ENOTFOUND" || error?.code === "ECONNREFUSED") {
    // The server has no outbound access to OpenWeather.
    return ApiError.serviceUnavailable("The weather service could not be reached from the server.");
  }

  // --- Anything else ------------------------------------------------------
  // Hide the provider's message; show a generic retry note.
  return ApiError.serviceUnavailable("Weather information is temporarily unavailable. Please try again later.");
};

/**
 * fetchCurrentWeather - current conditions for a city name or coordinates.
 *
 * @param {Object} params
 * @param {string}  [params.city]  - city name, optionally "City,IN"
 * @param {number}  [params.lat]   - latitude (used when city is absent)
 * @param {number}  [params.lon]   - longitude (used when city is absent)
 * @param {string}  [params.units] - "metric" (default) or "imperial"
 * @returns {Promise<Object>} normalised current weather object
 */
export const fetchCurrentWeather = async ({ city, lat, lon, units = "metric" } = {}) => {
  // --- Configuration check ------------------------------------------------
  if (!isWeatherConfigured()) {
    // Missing key is a server configuration problem.
    throw ApiError.serviceUnavailable(
      "Weather information is not configured on this server. Add OPENWEATHER_API_KEY to the environment to enable it."
    );
  }

  // --- Build the request parameters --------------------------------------
  const params = {
    // App id is required by OpenWeather.
    appid: OPENWEATHER_API_KEY,
    // Metric units give °C and m/s.
    units,
  };

  // Prefer coordinates when both were supplied (more accurate for a farm).
  if (lat !== undefined && lon !== undefined) {
    // Attach the coordinates.
    params.lat = lat;
    params.lon = lon;
  } else {
    // A city name is required otherwise.
    if (!city || String(city).trim().length < 2) {
      // Reject an empty or too-short location.
      throw ApiError.badRequest("Please provide a valid city name, or latitude and longitude.");
    }
    // Attach the city, trimmed. Appending ",IN" biases results towards India,
    // which is the intended audience of this project.
    params.q = `${String(city).trim()},IN`;
  }

  try {
    // --- Call the API ------------------------------------------------------
    const response = await http.get("/data/2.5/weather", { params });
    // Unpack the payload we need.
    const data = response.data ?? {};
    // Main block holds temperature, humidity and pressure.
    const main = data.main ?? {};
    // Wind block holds the speed.
    const wind = data.wind ?? {};
    // First weather entry holds the condition text and icon.
    const weather = Array.isArray(data.weather) ? data.weather[0] ?? {} : {};
    // Rain block holds the 1h/3h precipitation in millimetres when present.
    const rain = data.rain ?? {};
    // Cloud cover percentage.
    const clouds = data.clouds?.clouds ?? data.clouds?.all ?? 0;

    // Return the normalised object consumed by the frontend.
    return {
      // Human readable location, built from the API's own fields.
      location:
        [data.name, data.sys?.country].filter(Boolean).join(", ") || String(city ?? "").trim(),
      // Coordinates, useful for the crop module.
      coordinates: {
        // Latitude.
        lat: data.coord?.lat ?? null,
        // Longitude.
        lon: data.coord?.lon ?? null,
      },
      // Current temperature in °C.
      temperature: kelvinToCelsius(main.temp),
      // "Feels like" temperature in °C.
      feelsLike: kelvinToCelsius(main.feels_like),
      // Minimum and maximum of the current period.
      tempMin: main.temp_min !== undefined ? kelvinToCelsius(main.temp_min) : null,
      tempMax: main.temp_max !== undefined ? kelvinToCelsius(main.temp_max) : null,
      // Short condition label, e.g. "Clouds" -> "Cloudy".
      condition: weather.main ?? "Unknown",
      // Longer description, e.g. "few clouds".
      description: weather.description ?? "",
      // Internal icon key mapped to the frontend's icon set.
      icon: mapIcon(weather.icon),
      // Relative humidity percentage.
      humidity: main.humidity ?? null,
      // Wind speed converted from m/s to km/h (1 m/s = 3.6 km/h).
      windSpeed: wind.speed !== undefined ? Math.round(Number(wind.speed) * 3.6) : null,
      // Atmospheric pressure in hPa.
      pressure: main.pressure ?? null,
      // Cloud cover percentage.
      cloudiness: clouds,
      // Probability of rain: OpenWeather's current endpoint has no probability,
      // so we derive an indicative value from cloud cover and observed rain.
      rainProbability: rain["1h"] || rain["3h"] ? 80 : Math.round((clouds ?? 0) * 0.6),
      // Rainfall observed in the last 1-3 hours in millimetres.
      rainLastHour: rain["1h"] ?? rain["3h"] ?? 0,
      // Visibility in kilometres.
      visibilityKm: data.visibility !== undefined ? Math.round((data.visibility / 1000) * 10) / 10 : null,
      // Sunrise and sunset in the location's local time.
      sunrise: data.sys?.sunrise ? formatTime(data.sys.sunrise, data.timezone) : null,
      sunset: data.sys?.sunset ? formatTime(data.sys.sunset, data.timezone) : null,
      // Units label so the frontend can display them correctly.
      units: { temperature: "°C", wind: "km/h", rain: "mm" },
      // Provider name and the time the reading was taken.
      provider: "OpenWeather",
      updatedAt: new Date(data.dt ? data.dt * 1000 : Date.now()).toISOString(),
    };
  } catch (error) {
    // Convert the failure into a safe ApiError and rethrow.
    throw throwWeatherError(error, city ?? `${lat},${lon}`);
  }
};

/**
 * fetchForecast - 5 day forecast aggregated from 3-hourly steps into daily rows.
 *
 * @param {Object} params - same shape as fetchCurrentWeather
 * @returns {Promise<{location:string, days:Array}>}
 */
export const fetchForecast = async ({ city, lat, lon, units = "metric" } = {}) => {
  // --- Configuration check ------------------------------------------------
  if (!isWeatherConfigured()) {
    // Missing key blocks the forecast as well.
    throw ApiError.serviceUnavailable(
      "Weather information is not configured on this server. Add OPENWEATHER_API_KEY to the environment to enable it."
    );
  }

  // --- Build the request parameters (same rules as current weather) ------
  const params = { appid: OPENWEATHER_API_KEY, units };

  // Prefer coordinates when supplied.
  if (lat !== undefined && lon !== undefined) {
    // Attach the coordinates.
    params.lat = lat;
    params.lon = lon;
  } else {
    // Validate the city name.
    if (!city || String(city).trim().length < 2) {
      // Reject an invalid location.
      throw ApiError.badRequest("Please provide a valid city name, or latitude and longitude.");
    }
    // Attach the city name with an India bias.
    params.q = `${String(city).trim()},IN`;
  }

  try {
    // --- Call the API ------------------------------------------------------
    const response = await http.get("/data/2.5/forecast", { params });
    // The list holds 3-hourly entries (40 of them for 5 days).
    const entries = Array.isArray(response.data?.list) ? response.data.list : [];
    // Location label from the response.
    const location =
      [response.data?.city?.name, response.data?.city?.country].filter(Boolean).join(", ") ||
      String(city ?? "").trim();

    // --- Aggregate into daily buckets -------------------------------------
    // Map keyed by the calendar date string.
    const buckets = new Map();

    // Process each 3-hourly entry.
    for (const entry of entries) {
      // Derive the local calendar date using the location's timezone offset.
      const localDate = new Date((entry.dt + (response.data.city?.timezone ?? 0)) * 1000)
        .toISOString()
        .slice(0, 10);
      // Get or create the bucket for this date.
      const bucket = buckets.get(localDate) ?? {
        // Date string (YYYY-MM-DD) for the frontend.
        date: localDate,
        // Running maximum temperature.
        high: -Infinity,
        // Running minimum temperature.
        low: Infinity,
        // Running humidity total for averaging.
        humiditySum: 0,
        // Number of humidity readings.
        humidityCount: 0,
        // Running wind speed total for averaging.
        windSum: 0,
        // Number of wind readings.
        windCount: 0,
        // Maximum precipitation seen in any 3-hour step.
        rainVolume: 0,
        // Number of steps where rain was forecast (for probability).
        rainSteps: 0,
        // Total steps in the day.
        steps: 0,
        // Condition counts, used to pick the day's dominant condition.
        conditions: new Map(),
        // Representative icon code, taken from midday when possible.
        iconCode: null,
      };

      // Update the temperature extremes.
      if (entry.main?.temp !== undefined) {
        // Track the maximum.
        bucket.high = Math.max(bucket.high, kelvinToCelsius(entry.main.temp));
        // Track the minimum.
        bucket.low = Math.min(bucket.low, kelvinToCelsius(entry.main.temp));
      }

      // Accumulate humidity.
      if (entry.main?.humidity !== undefined) {
        // Add to the sum.
        bucket.humiditySum += entry.main.humidity;
        // Count the reading.
        bucket.humidityCount += 1;
      }

      // Accumulate wind speed (m/s -> km/h).
      if (entry.wind?.speed !== undefined) {
        // Convert and add to the sum.
        bucket.windSum += Number(entry.wind.speed) * 3.6;
        // Count the reading.
        bucket.windCount += 1;
      }

      // Accumulate precipitation volume.
      const rainVolume = entry.rain?.["3h"] ?? 0;
      // Add to the day's total.
      bucket.rainVolume += rainVolume;
      // Count this as a rainy step when any measurable rain is forecast.
      if (rainVolume > 0) bucket.rainSteps += 1;

      // Count the step.
      bucket.steps += 1;

      // Track the dominant condition by frequency.
      const conditionKey = entry.weather?.[0]?.main ?? "Unknown";
      // Increment the count for this condition.
      bucket.conditions.set(conditionKey, (bucket.conditions.get(conditionKey) ?? 0) + 1);

      // Prefer the midday icon as the day's representative icon.
      const hour = new Date((entry.dt + (response.data.city?.timezone ?? 0)) * 1000).getUTCHours();
      // Only midday entries (11:00-14:00 local) are considered.
      if (hour >= 11 && hour <= 14 && !bucket.iconCode) {
        // Store the icon code.
        bucket.iconCode = entry.weather?.[0]?.icon ?? null;
      }

      // Save the bucket back into the map.
      buckets.set(localDate, bucket);
    }

    // --- Convert the buckets into the final array -------------------------
    const days = Array.from(buckets.values()).map((bucket) => {
      // Pick the most frequent condition of the day.
      const condition =
        Array.from(bucket.conditions.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unknown";
      // Keep a reference to the description map so we can find a matching description.
      return {
        // Date string for the frontend.
        date: bucket.date,
        // Day's maximum temperature.
        high: Math.round(bucket.high),
        // Day's minimum temperature.
        low: Math.round(bucket.low),
        // Dominant condition label.
        condition,
        // Average humidity rounded to the nearest whole number.
        humidity: bucket.humidityCount ? Math.round(bucket.humiditySum / bucket.humidityCount) : null,
        // Average wind speed rounded to the nearest whole number.
        wind: bucket.windCount ? Math.round(bucket.windSum / bucket.windCount) : null,
        // Probability of rain: the share of 3-hour steps with measurable rain.
        rain: bucket.steps ? Math.round((bucket.rainSteps / bucket.steps) * 100) : 0,
        // Total expected rainfall in millimetres.
        rainVolumeMm: Math.round(bucket.rainVolume * 10) / 10,
        // Representative icon key. Chosen from the midday entry when available.
        icon: bucket.iconCode ? mapIcon(bucket.iconCode) : "cloud-sun",
      };
    });

    // Return the location plus the daily forecast.
    return { location, days };
  } catch (error) {
    // Convert the failure into a safe ApiError and rethrow.
    throw throwWeatherError(error, city ?? `${lat},${lon}`);
  }
};
