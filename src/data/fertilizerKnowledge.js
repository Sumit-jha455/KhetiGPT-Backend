/**
 * data/fertilizerKnowledge.js
 * -----------------------------------------------------------------------------
 * Structured fertilizer reference data + transparent guidance rules.
 *
 * IMPORTANT SAFETY POSITION (stated again in the API response):
 *   - This module explains nutrient ROLES and STAGE-wise priorities.
 *   - It deliberately does NOT output "apply 46 kg urea per acre" style numbers,
 *     because a correct dose depends on a soil test report and local
 *     recommendations that this application does not have.
 *   - The response always points the farmer to a soil test / agriculture officer.
 */

/** Primary nutrients and what they do. */
export const NUTRIENT_GUIDE = [
  {
    // Chemical symbol used in fertilizer labels.
    symbol: "N",
    // Full nutrient name.
    name: "Nitrogen",
    // What the nutrient is responsible for in the plant.
    role: "Drives leaf and stem growth and gives the crop a healthy green colour.",
    // Common fertilizer sources (generic categories, not brand names).
    sources: ["Urea", "Ammonium sulphate", "Calcium ammonium nitrate"],
    // What happens when the nutrient is lacking.
    deficiencySigns: "Older leaves turn yellow, growth is stunted.",
    // Consequence of over-application (important for honesty).
    excessRisk: "Excess nitrogen causes lush growth, lodging and can delay maturity.",
  },
  {
    symbol: "P",
    name: "Phosphorus",
    role: "Supports root development, flowering, seed and fruit formation.",
    sources: ["Single super phosphate", "Di-ammonium phosphate (DAP)", "Mussorie rock phosphate"],
    deficiencySigns: "Purplish or dull green leaves and poor root growth.",
    excessRisk: "Excess phosphorus can lock up zinc and iron in the soil.",
  },
  {
    symbol: "K",
    name: "Potassium",
    role: "Regulates water movement inside the plant and strengthens stems against lodging and disease.",
    sources: ["Muriate of potash (MOP)", "Sulphate of potash (SOP)"],
    deficiencySigns: "Yellowing and scorching along the leaf margins of older leaves.",
    excessRisk: "Excess potassium can interfere with calcium and magnesium uptake.",
  },
  {
    symbol: "Ca / Mg / S",
    name: "Secondary nutrients",
    role: "Support cell structure, chlorophyll formation and protein building.",
    sources: ["Gypsum", "Dolomitic lime", "Elemental sulphur"],
    deficiencySigns: "General yellowing, weak stems and poor grain filling.",
    excessRisk: "Over-liming can raise soil pH too far and reduce micronutrient availability.",
  },
  {
    symbol: "Zn / Fe / Mn / B",
    name: "Micronutrients",
    role: "Needed in very small amounts for enzyme function and healthy flowering.",
    sources: ["Zinc sulphate", "Iron sulphate", "Borax"],
    deficiencySigns: "Interveinal yellowing on young leaves, poor fruit set.",
    excessRisk: "Micronutrient excess can be toxic; apply only after a deficiency is confirmed.",
  },
];

/** Organic amendment options, included because they reduce chemical dependence. */
export const ORGANIC_OPTIONS = [
  {
    // Name of the amendment.
    name: "Farmyard manure (FYM)",
    // What it contributes.
    benefit: "Improves soil structure, water holding capacity and slow-release nutrients.",
    // Indicative general guidance.
    guidance: "Normally applied well before sowing and incorporated into the soil.",
  },
  {
    name: "Vermicompost",
    benefit: "Rich, well decomposed organic matter that supports soil biology.",
    guidance: "Applied at or before sowing, either alone or along with FYM.",
  },
  {
    name: "Green manuring (e.g. dhaincha, sunn hemp)",
    benefit: "Adds organic matter and nitrogen when the crop is turned into the soil.",
    guidance: "Grown for 40-50 days and incorporated before the main crop is sown.",
  },
  {
    name: "Biofertilizers (Rhizobium, Azotobacter, PSB)",
    benefit: "Beneficial microbes that improve nitrogen fixation or phosphorus availability.",
    guidance: "Usually applied as seed treatment or soil application, following product instructions.",
  },
];

/**
 * STAGE_GUIDE - nutrient priority and general practice for each growth stage.
 * The keys match the growth stage values in the API contract exactly.
 */
export const STAGE_GUIDE = {
  Seedling: {
    // Nutrient priority for the stage.
    emphasis: "Low dose, root-focused establishment",
    // Which nutrient matters most right now.
    priority: "Phosphorus for root development, with a small starter nitrogen dose",
    // Why this is the practice.
    summary:
      "Seedlings have a small root system and can be damaged by a heavy dose. A small starter application placed near the root zone is the usual practice.",
    // General practice description (no numbers).
    practice:
      "Apply a light starter dose in a band near the seed line, then irrigate lightly so the nutrients move into the root zone.",
    // Cautions for this stage.
    cautions: [
      "Do not place fertilizer in direct contact with the seed, as it can burn young roots.",
      "Ensure adequate moisture, because dry soil prevents nutrient uptake.",
    ],
  },
  Vegetative: {
    emphasis: "Higher nitrogen for canopy and stem growth",
    priority: "Nitrogen, applied in splits",
    summary:
      "This is the main growth phase and usually the period of highest nitrogen demand, because the plant is building leaves and stems.",
    practice:
      "Split the nitrogen into two or more applications during active growth instead of one heavy dose, so the crop can use it fully.",
    cautions: [
      "Too much nitrogen at once can cause lodging and excess leaf growth at the expense of yield.",
      "Keep weeds under control, because they compete for the same nutrients.",
    ],
  },
  Flowering: {
    emphasis: "Balanced phosphorus and potassium for flowering and fruit set",
    priority: "Phosphorus and potassium, with reduced nitrogen",
    summary:
      "Flowering, grain and fruit formation depend heavily on phosphorus and potassium, while nitrogen demand normally falls after the canopy is established.",
    practice:
      "Apply a phosphorus- and potassium-oriented nutrient mix at flowering and irrigate soon after application.",
    cautions: [
      "Avoid a heavy nitrogen dose now, as it can delay maturity and encourage pests.",
      "Water stress during this stage reduces fruit and grain set more than at any other time.",
    ],
  },
  Harvest: {
    emphasis: "Minimal or no application",
    priority: "None - stop applications",
    summary:
      "Nutrient application is normally stopped well before harvest so that residues decline and the produce is safe.",
    practice:
      "Stop fertilizer application and follow the pre-harvest interval stated on the product label.",
    cautions: [
      "Applying nutrients close to harvest can leave residues and wastes money.",
      "Plan the last application with the expected harvest date in mind.",
    ],
  },
};

/**
 * SOIL_ADJUSTMENTS - how the soil type changes the general guidance.
 */
export const SOIL_ADJUSTMENTS = {
  Loamy: {
    // Overall behaviour of this soil.
    behaviour: "Balanced water and nutrient retention.",
    // How the guidance is adjusted.
    adjustment: "Nutrients can be applied in even splits. Maintain organic matter to keep the balance.",
  },
  Clay: {
    behaviour: "Holds nutrients and water well but drains slowly.",
    adjustment: "Avoid waterlogging after application. Incorporate nutrients into the topsoil rather than surface broadcasting.",
  },
  Sandy: {
    behaviour: "Drains quickly and holds few nutrients.",
    adjustment: "Prefer smaller, more frequent splits and add organic matter to improve retention.",
  },
  Black: {
    behaviour: "Deep, moisture retentive and can become waterlogged.",
    adjustment: "Check field moisture before applying, and avoid applying just before heavy rain.",
  },
  Alluvial: {
    behaviour: "Generally fertile with good structure.",
    adjustment: "A soil test is especially valuable here, because over-application is a common problem on naturally fertile soil.",
  },
  Red: {
    behaviour: "Well drained but often low in nitrogen and organic matter.",
    adjustment: "Combine nutrient application with organic matter and monitor for micronutrient deficiencies.",
  },
  Laterite: {
    behaviour: "Acidic and low in fertility.",
    adjustment: "Consider a lime requirement test before applying nutrients, as acidity reduces availability.",
  },
  Other: {
    behaviour: "Not classified in this dataset.",
    adjustment: "Please carry out a soil test so the nutrient plan can be based on measured values.",
  },
};

/** Safety warnings always attached to the response. */
export const SAFETY_WARNINGS = [
  "Fertilizer decisions should be based on a soil health card report and local agricultural recommendations, not on general guidance alone.",
  "Always follow the dosage and safety instructions printed on the product label.",
  "Wear gloves and a mask while handling and mixing fertilizer, and wash hands afterwards.",
  "Never mix fertilizer with plant protection chemicals unless the label explicitly allows it.",
  "Do not apply fertilizer before heavy rain, as runoff wastes nutrients and can pollute water bodies.",
  "Store fertilizer away from food, fodder and out of the reach of children.",
];

/**
 * CROP_NUTRIENT_HINTS - crop specific emphasis.
 * Keys are matched case-insensitively against the requested crop name.
 */
export const CROP_NUTRIENT_HINTS = {
  rice: "Rice responds strongly to nitrogen, but split applications are needed because flooded fields lose nitrogen through leaching.",
  wheat: "Wheat needs a strong nitrogen supply during tillering, with potassium supporting stem strength.",
  maize: "Maize is a heavy nitrogen feeder and needs nitrogen in splits around the knee-high stage.",
  cotton: "Cotton needs balanced nitrogen and potassium during boll development; excess nitrogen delays maturity.",
  sugarcane: "Sugarcane removes large amounts of nutrients over a long duration, so scheduled splits and organic matter are important.",
  tomato: "Tomato needs reduced nitrogen after fruit set and more potassium for fruit quality.",
  onion: "Onion needs steady moderate nutrition; excess nitrogen produces thick necks that store poorly.",
  potato: "Potato needs good potassium for tuber quality and benefits from organic matter.",
  chickpea: "As a legume, chickpea needs little nitrogen and benefits more from phosphorus and biofertilizer seed treatment.",
  mustard: "Mustard needs sulphur along with nitrogen, so sulphur-containing sources are commonly used.",
  groundnut: "Groundnut is a legume and needs calcium in the pod zone more than nitrogen.",
  soybean: "Soybean fixes much of its own nitrogen, so phosphorus and biofertilizer treatment matter more.",
};

/**
 * lookupCropHint - finds the crop specific hint using a case-insensitive match.
 * @param {string} cropName - crop name from the request
 * @returns {string|null}
 */
export const lookupCropHint = (cropName) => {
  // Normalise the requested name to lowercase.
  const key = String(cropName ?? "").toLowerCase();
  // Return the first hint whose key appears inside the requested name.
  return (
    Object.entries(CROP_NUTRIENT_HINTS).find(([hintKey]) => key.includes(hintKey))?.[1] ?? null
  );
};
