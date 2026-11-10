/**
 * data/cropKnowledge.js
 * -----------------------------------------------------------------------------
 * Transparent rule base for the crop recommendation engine.
 *
 * HONESTY RULES FOR THIS PROJECT:
 *   - Every value here is a general textbook-level agronomic characteristic
 *     written for an academic demonstration.
 *   - The engine EXPLAINS its reasoning (see scoreCrop) instead of returning an
 *     opaque score, and it always labels the output as indicative guidance.
 *   - This module is intentionally separated from cropService.js so a machine
 *     learning model can replace `scoreCrop` later without touching the routes.
 */

/**
 * CROP_CATALOGUE
 * Each entry describes the conditions a crop is commonly associated with.
 * `soil` values use the same names as the frontend soil dropdown.
 */
export const CROP_CATALOGUE = [
  {
    // Crop display name.
    name: "Rice (Paddy)",
    // Growing seasons in which the crop is normally cultivated in India.
    seasons: ["Kharif"],
    // Soil types where the crop is commonly grown.
    soils: ["Clay", "Alluvial"],
    // Water demand category.
    waterNeed: "High",
    // Optimum temperature range in °C (used only as an indicative filter).
    tempRange: [20, 35],
    // Indicative water requirement in millimetres across the season.
    waterMm: [1000, 1500],
    // Typical field duration.
    durationDays: "120-150 days",
    // Short cultivation notes returned with the recommendation.
    notes:
      "Rice needs standing water for most of its growth, so it suits fields with assured irrigation or high rainfall.",
    // General category label shown in the UI.
    category: "Cereal",
  },
  {
    name: "Wheat",
    seasons: ["Rabi"],
    soils: ["Loamy", "Alluvial", "Clay"],
    waterNeed: "Medium",
    tempRange: [10, 25],
    waterMm: [450, 650],
    durationDays: "110-130 days",
    notes: "Wheat is the main Rabi cereal in north and central India and needs cool nights during grain filling.",
    category: "Cereal",
  },
  {
    name: "Maize",
    seasons: ["Kharif", "Zaid", "Rabi"],
    soils: ["Loamy", "Alluvial", "Sandy"],
    waterNeed: "Medium",
    tempRange: [21, 30],
    waterMm: [500, 800],
    durationDays: "90-120 days",
    notes: "Maize is flexible across seasons and fits short windows between two main crops.",
    category: "Cereal",
  },
  {
    name: "Cotton",
    seasons: ["Kharif"],
    soils: ["Black", "Clay"],
    waterNeed: "Medium",
    tempRange: [21, 35],
    waterMm: [600, 1000],
    durationDays: "150-180 days",
    notes: "Cotton performs best on deep black soils with a long, warm growing period.",
    category: "Fibre",
  },
  {
    name: "Sugarcane",
    seasons: ["Kharif", "Zaid"],
    soils: ["Alluvial", "Black", "Loamy"],
    waterNeed: "High",
    tempRange: [20, 35],
    waterMm: [1500, 2500],
    durationDays: "10-12 months",
    notes: "Sugarcane is a long duration crop with a very high irrigation demand, so it needs assured water.",
    category: "Commercial",
  },
  {
    name: "Chickpea (Gram)",
    seasons: ["Rabi"],
    soils: ["Black", "Loamy"],
    waterNeed: "Low",
    tempRange: [15, 28],
    waterMm: [300, 400],
    durationDays: "95-110 days",
    notes: "Chickpea is a pulse that grows well on residual soil moisture and also supports soil nitrogen.",
    category: "Pulse",
  },
  {
    name: "Mustard",
    seasons: ["Rabi"],
    soils: ["Loamy", "Sandy", "Alluvial"],
    waterNeed: "Low",
    tempRange: [10, 27],
    waterMm: [250, 400],
    durationDays: "100-120 days",
    notes: "Mustard is a hardy oilseed crop suited to drier Rabi conditions.",
    category: "Oilseed",
  },
  {
    name: "Groundnut",
    seasons: ["Kharif", "Zaid"],
    soils: ["Sandy", "Loamy", "Red"],
    waterNeed: "Low",
    tempRange: [25, 33],
    waterMm: [500, 700],
    durationDays: "100-130 days",
    notes: "Groundnut prefers light, well-drained soils where the pods can develop freely.",
    category: "Oilseed",
  },
  {
    name: "Moong (Green Gram)",
    seasons: ["Zaid", "Kharif"],
    soils: ["Loamy", "Sandy", "Alluvial"],
    waterNeed: "Low",
    tempRange: [25, 35],
    waterMm: [300, 500],
    durationDays: "60-70 days",
    notes: "Moong is a short duration pulse, often used as a catch crop in the summer window.",
    category: "Pulse",
  },
  {
    name: "Tomato",
    seasons: ["Rabi", "Zaid"],
    soils: ["Loamy", "Alluvial"],
    waterNeed: "Medium",
    tempRange: [18, 30],
    waterMm: [400, 600],
    durationDays: "90-120 days",
    notes: "Tomato is usually grown with staking and drip lines and needs steady moisture to avoid fruit cracking.",
    category: "Vegetable",
  },
  {
    name: "Onion",
    seasons: ["Rabi", "Zaid"],
    soils: ["Loamy", "Sandy", "Alluvial"],
    waterNeed: "Medium",
    tempRange: [13, 28],
    waterMm: [350, 550],
    durationDays: "110-130 days",
    notes: "Onion needs good drainage; waterlogging causes bulb rot.",
    category: "Vegetable",
  },
  {
    name: "Potato",
    seasons: ["Rabi"],
    soils: ["Loamy", "Sandy", "Alluvial"],
    waterNeed: "Medium",
    tempRange: [15, 25],
    waterMm: [500, 700],
    durationDays: "90-110 days",
    notes: "Potato needs cool weather for tuber formation and loose soil for even tuber growth.",
    category: "Vegetable",
  },
  {
    name: "Soybean",
    seasons: ["Kharif"],
    soils: ["Black", "Loamy"],
    waterNeed: "Medium",
    tempRange: [20, 32],
    waterMm: [600, 900],
    durationDays: "95-110 days",
    notes: "Soybean is a Kharif oilseed and pulse alternative for medium to deep soils.",
    category: "Oilseed",
  },
  {
    name: "Pearl Millet (Bajra)",
    seasons: ["Kharif", "Zaid"],
    soils: ["Sandy", "Loamy", "Red"],
    waterNeed: "Low",
    tempRange: [25, 38],
    waterMm: [300, 500],
    durationDays: "70-90 days",
    notes: "Bajra is drought tolerant and is the usual choice for low rainfall, light textured soils.",
    category: "Cereal",
  },
  {
    name: "Sunflower",
    seasons: ["Zaid", "Rabi"],
    soils: ["Black", "Loamy", "Alluvial"],
    waterNeed: "Medium",
    tempRange: [18, 33],
    waterMm: [400, 600],
    durationDays: "90-110 days",
    notes: "Sunflower is a short duration oilseed useful for filling a season gap.",
    category: "Oilseed",
  },
];

/**
 * SEASON_WINDOWS - indicative calendar information used in the explanation text.
 * Indian cropping seasons; exact dates shift by region, which is stated to the user.
 */
export const SEASON_WINDOWS = {
  Kharif: "June to October (monsoon season)",
  Rabi: "October to March (winter season)",
  Zaid: "March to June (summer season)",
};

/**
 * WATER_LEVELS - normalised irrigation availability labels.
 * The frontend sends "Low" | "Medium" | "High"; the extra keys map irrigation
 * system names sent by the profile to the same three levels.
 */
export const WATER_LEVEL_MAP = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
  Rainfed: "Low",
  Drip: "Medium",
  Sprinkler: "Medium",
  Canal: "High",
};

/**
 * SOIL_DRAINAGE - indicative drainage notes used in the explanation text.
 */
export const SOIL_NOTES = {
  Loamy: "Loamy soil holds moisture and nutrients in balance and suits a wide range of crops.",
  Clay: "Clay soil retains water for long periods and suits crops that tolerate wet roots.",
  Sandy: "Sandy soil drains quickly and holds fewer nutrients, so it needs frequent light irrigation.",
  Black: "Black cotton soil is moisture retentive and becomes sticky when wet, ideal for cotton and pulses.",
  Alluvial: "Alluvial soil is generally fertile and is the most widely suitable soil group.",
  Red: "Red soil is well drained but often low in nitrogen and organic matter.",
  Laterite: "Laterite soil is acidic and low in fertility, needing organic matter before cultivation.",
  Other: "A soil test is recommended to identify the exact soil group before choosing a crop.",
};

/**
 * scoreCrop - transparent scoring function.
 *
 * Points are awarded for each match so the total can be explained in words:
 *   +35 season match        +25 soil match
 *   +20 water alignment     +15 temperature inside range
 *   +5 rainfall plausibility
 * The maximum is 100. Because the criteria are indicative, the result is
 * presented as "indicative guidance", never as a guaranteed outcome.
 *
 * @param {Object} crop    - entry from CROP_CATALOGUE
 * @param {Object} input   - normalised farmer inputs
 * @returns {{ score: number, matched: string[], missed: string[] }}
 */
export const scoreCrop = (crop, input) => {
  // Running total for this crop.
  let score = 0;
  // Reasons that support this crop (shown in the response).
  const matched = [];
  // Conditions that did not match (also shown, for transparency).
  const missed = [];

  // --- Season ---------------------------------------------------------------
  if (crop.seasons.includes(input.season)) {
    // The crop is normally grown in the requested season.
    score += 35;
    // Record the reason.
    matched.push(`Commonly cultivated in the ${input.season} season`);
  } else {
    // Record the mismatch so the farmer sees the full picture.
    missed.push(`Not usually grown in the ${input.season} season`);
  }

  // --- Soil -----------------------------------------------------------------
  if (crop.soils.includes(input.soilType)) {
    // The soil group suits this crop.
    score += 25;
    matched.push(`${input.soilType} soil is generally suitable`);
  } else {
    missed.push(`${input.soilType} soil is not listed among its preferred soil types`);
  }

  // --- Water availability ---------------------------------------------------
  if (crop.waterNeed === input.water) {
    // Water demand exactly matches what the farmer can provide.
    score += 20;
    matched.push(`${input.water.toLowerCase()} water availability matches its ${crop.waterNeed.toLowerCase()} water requirement`);
  } else if (crop.waterNeed === "Low") {
    // A low water requirement crop can still be grown when more water exists.
    score += 8;
    matched.push("Low water requirement, so it can be grown with a safety margin");
  } else if (crop.waterNeed === "Medium" && input.water === "High") {
    // Medium requirement is comfortably met by high availability.
    score += 10;
    matched.push("Medium water requirement is comfortably met by high availability");
  } else {
    // The demand exceeds what the farmer can supply - an important warning.
    missed.push(`Needs ${crop.waterNeed.toLowerCase()} water, which exceeds the reported ${input.water.toLowerCase()} availability`);
  }

  // --- Temperature ----------------------------------------------------------
  if (typeof input.temperature === "number") {
    // Unpack the indicative optimum range.
    const [min, max] = crop.tempRange;
    // Check whether the reported temperature falls inside the range.
    if (input.temperature >= min && input.temperature <= max) {
      // Award the temperature points.
      score += 15;
      matched.push(`Current temperature around ${Math.round(input.temperature)}°C is inside its typical range (${min}-${max}°C)`);
    } else {
      // Temperature is outside the typical range.
      missed.push(`Typical temperature range is ${min}-${max}°C, which does not match the reported conditions`);
    }
  }

  // --- Rainfall -------------------------------------------------------------
  if (typeof input.rainfall === "number") {
    // Unpack the indicative seasonal rainfall band.
    const [minMm, maxMm] = crop.waterMm;
    // Treat rainfall up to 1.5x the upper band as acceptable (irrigation can top up).
    if (input.rainfall >= minMm * 0.6 && input.rainfall <= maxMm * 1.5) {
      // Award the rainfall points.
      score += 5;
      matched.push("Reported rainfall is broadly compatible with its water requirement");
    } else {
      // Rainfall is clearly outside the expected band.
      missed.push("Reported rainfall is outside the typical range for this crop");
    }
  }

  // Clamp the score to 0-100 so it can be shown as a percentage.
  return { score: Math.max(0, Math.min(100, score)), matched, missed };
};

/**
 * normaliseInput - coerces raw request data into the shape the scorer expects.
 * @param {Object} raw - request body merged with the user's saved profile
 */
export const normaliseInput = (raw = {}) => {
  // Resolve the water level from either field name used by the frontend.
  const waterRaw = raw.waterAvailability ?? raw.water ?? raw.irrigationType ?? "Medium";
  // Map the value onto Low/Medium/High, defaulting to Medium for unknown input.
  const water = WATER_LEVEL_MAP[waterRaw] ?? "Medium";

  // Return the normalised, validated shape.
  // NOTE: soilType and season are intentionally NOT defaulted here. Silently
  // assuming "Loamy" and "Kharif" would produce a misleading recommendation, so
  // an empty value is passed through and the service rejects it with a clear 400.
  return {
    // Soil type as a trimmed string (empty when not supplied).
    soilType: String(raw.soilType ?? "").trim(),
    // Season as a trimmed string (empty when not supplied).
    season: String(raw.season ?? "").trim(),
    // Normalised water availability.
    water,
    // Original water label, preserved for the response.
    waterLabel: String(waterRaw).trim(),
    // Location string (optional).
    location: String(raw.location ?? "").trim(),
    // Numeric farm size when provided.
    farmSize: Number.isFinite(Number(raw.farmSize)) && raw.farmSize !== null ? Number(raw.farmSize) : null,
    // Optional temperature override in °C.
    temperature: Number.isFinite(Number(raw.temperature)) && raw.temperature !== "" ? Number(raw.temperature) : null,
    // Optional seasonal rainfall override in millimetres.
    rainfall: Number.isFinite(Number(raw.rainfall)) && raw.rainfall !== "" ? Number(raw.rainfall) : null,
  };
};
