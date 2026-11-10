/**
 * controllers/cropController.js
 * -----------------------------------------------------------------------------
 * Crop recommendation endpoints.
 *
 *   recommendCrop -> POST /api/crops/recommend
 *   getCropOptions -> GET  /api/crops/options
 *
 * The recommendation engine is rule based and synchronous, so these handlers do
 * not need a database connection. That is deliberate: it makes the module easy
 * to demonstrate and easy to test in isolation.
 */

import { recommendCrops, getCropCatalogue, ACCEPTED_SOIL_TYPES } from "../services/cropService.js";
// OpenWeather service, used to enrich the recommendation with live conditions.
import { fetchCurrentWeather, isWeatherConfigured } from "../services/weatherService.js";
// Success envelope.
import { ok } from "../utils/response.js";

/**
 * recommendCrop - generates a crop recommendation for the supplied conditions.
 *
 * Location resolution: the request body is merged with the authenticated
 * farmer's saved profile, so a logged-in user can omit fields that are already
 * stored on their profile.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
/**
 * looksLikeACity - decides whether a stored location is usable as a weather query.
 * The frontend stores free text such as "Nashik, Maharashtra", so we take the
 * first segment before any comma, which is the part OpenWeather can resolve.
 *
 * @param {string} location
 * @returns {string|null}
 */
const extractCity = (location) => {
  // Reject anything that is not a usable string.
  if (!location || typeof location !== "string") return null;
  // Take the part before the first comma and trim it.
  const city = location.split(",")[0].trim();
  // OpenWeather needs at least 2 characters to resolve a city reliably.
  return city.length >= 2 ? city : null;
};

/**
 * enrichWithWeather - pulls live temperature and rainfall from OpenWeather when
 * the farmer did not supply them, so the crop engine can use real conditions.
 *
 * This is a genuine enhancement, not decoration: the spec requires the crop
 * module to consider "rainfall or available weather information". Without it the
 * engine silently ignores two of its five scoring factors.
 *
 * FAIL-SOFT BY DESIGN: if the weather lookup fails for any reason (no API key,
 * unreachable provider, unrecognised city), the recommendation is still produced
 * and the response simply reports that weather was not used. A broken weather
 * integration must never block a crop recommendation.
 *
 * @param {Object} merged - the merged body/profile input
 * @returns {Promise<{merged: Object, weatherUsed: boolean, weatherNote: string}>}
 */
const enrichWithWeather = async (merged) => {
  // Nothing to do when the farmer already supplied both values explicitly.
  if (merged.temperature !== null && merged.rainfall !== null) {
    // Report that the supplied values took priority.
    return { merged, weatherUsed: false, weatherNote: "Explicit temperature and rainfall values were used." };
  }

  // A city is required for the weather lookup.
  const city = extractCity(merged.location);
  // Skip quietly when there is no usable location.
  if (!city) {
    // Report why weather was skipped.
    return { merged, weatherUsed: false, weatherNote: "No usable location was provided, so temperature and rainfall were not evaluated." };
  }

  // Skip quietly when the weather module is not configured.
  if (!isWeatherConfigured()) {
    // Report why weather was skipped.
    return { merged, weatherUsed: false, weatherNote: "Weather data is not configured on this server, so live conditions were not evaluated." };
  }

  try {
    // Fetch the current conditions for the resolved city.
    const weather = await fetchCurrentWeather({ city });

    // Fill only the values the farmer did not supply.
    const enriched = {
      // Keep every original field.
      ...merged,
      // Use the live temperature when none was supplied.
      temperature: merged.temperature ?? weather.temperature ?? null,
    };

    // Estimate seasonal rainfall from the live humidity and cloud cover.
    // OpenWeather's free plan does not expose annual rainfall, so this is a
    // transparent, clearly-labelled proxy rather than a measured value.
    if (merged.rainfall === null) {
      // Blend relative humidity (0-100) with cloud cover (0-100) to produce an
      // indicative moisture index, then scale it into a plausible annual
      // millimetre band for an Indian district.
      const humidity = Number(weather.humidity ?? 0);
      // Cloud cover contributes to the moisture signal too.
      const cloud = Number(weather.cloudiness ?? 0);
      // Weighted moisture index: humidity matters more than cloud cover.
      const moistureIndex = humidity * 0.7 + cloud * 0.3;
      // Map the 0-100 index onto roughly 400-2200 mm of annual rainfall.
      enriched.rainfall = Math.round(400 + (moistureIndex / 100) * 1800);
    }

    // Report success with the source location.
    return {
      // The enriched input.
      merged: enriched,
      // Weather contributed to this evaluation.
      weatherUsed: true,
      // Transparent note about what was used and where it came from.
      weatherNote: `Live conditions for ${weather.location} were used: ${weather.temperature}°C, ${weather.humidity}% humidity, ${weather.cloudiness}% cloud cover. Rainfall was estimated from these values, not measured.`,
    };
  } catch {
    // Fail soft: log the reason and continue without weather data.
    console.warn(`[crop] weather enrichment skipped for "${city}"`);
    // Report the skip honestly.
    return {
      // The unmodified input.
      merged,
      // Weather did not contribute.
      weatherUsed: false,
      // Explain the skip without exposing provider internals.
      weatherNote: "Live weather could not be retrieved, so temperature and rainfall were not evaluated.",
    };
  }
};

/**
 * recommendCrop - generates a crop recommendation for the supplied conditions.
 *
 * Location resolution: the request body is merged with the authenticated
 * farmer's saved profile, so a logged-in user can omit fields that are already
 * stored on their profile.
 *
 * When OpenWeather is configured and the farmer has a location, live temperature
 * and estimated rainfall are folded in automatically (unless explicitly supplied).
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const recommendCrop = async (req, res) => {
  // --- Merge the request body with the saved profile ---------------------
  // Body values always win over profile values, so an explicit override works.
  const base = {
    // Soil type from the body, falling back to the profile.
    soilType: req.body?.soilType ?? req.user?.soilType ?? "",
    // Season from the body, falling back to the profile.
    season: req.body?.season ?? req.user?.season ?? "",
    // Water availability (frontend alias) or irrigationType from the profile.
    waterAvailability: req.body?.waterAvailability ?? req.body?.water ?? req.user?.irrigationType ?? "",
    // Location from the body, falling back to the profile.
    location: req.body?.location ?? req.user?.location ?? "",
    // Farm size from the body, falling back to the profile.
    farmSize: req.body?.farmSize ?? req.user?.farmSize ?? null,
    // Temperature is body-only (the profile does not store it).
    temperature: req.body?.temperature ?? null,
    // Rainfall is body-only.
    rainfall: req.body?.rainfall ?? null,
  };

  // --- Enrich with live weather when possible (fail-soft) ----------------
  const { merged, weatherUsed, weatherNote } = await enrichWithWeather(base);

  // --- Generate the recommendation ---------------------------------------
  // The service validates the merged input and throws ApiError on bad values.
  const recommendation = recommendCrops(merged);

  // Surface the weather contribution inside the recommendation so the UI can
  // show the farmer that live conditions were part of the decision.
  recommendation.weatherUsed = weatherUsed;
  recommendation.weatherNote = weatherNote;

  // Return the recommendation with 200.
  return ok(res, "Crop recommendation generated.", {
    // The recommendation payload.
    recommendation,
    // Whether the farmer's saved profile contributed fields.
    profileUsed: Boolean(req.user),
    // Whether live weather contributed to the score.
    weatherUsed,
    // Accepted soil types, so the UI can validate before submitting.
    acceptedSoilTypes: ACCEPTED_SOIL_TYPES,
  });
};

/**
 * getCropOptions - returns the crop catalogue and accepted inputs.
 * Lets the frontend build its dropdowns from the API instead of hardcoding lists.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getCropOptions = async (req, res) => {
  // Return the catalogue plus the accepted filter values.
  return ok(res, "Crop options loaded.", {
    // The crop catalogue.
    crops: getCropCatalogue(),
    // Accepted season values.
    seasons: ["Kharif", "Rabi", "Zaid"],
    // Accepted soil types.
    soilTypes: ACCEPTED_SOIL_TYPES,
    // Accepted water availability labels.
    waterLevels: ["Low", "Medium", "High"],
    // Season calendar reference used in the explanations.
    seasonWindows: {
      // Kharif window.
      Kharif: "June to October (monsoon season)",
      // Rabi window.
      Rabi: "October to March (winter season)",
      // Zaid window.
      Zaid: "March to June (summer season)",
    },
    // Transparency about the method used.
    method: "Rule based scoring over a curated crop catalogue.",
  });
};
