/**
 * data/schemes.js
 * -----------------------------------------------------------------------------
 * Government scheme reference dataset.
 *
 * HONESTY / VERIFICATION POLICY (this is an academic project):
 *   - Every record carries a `verification` field that states exactly how much
 *     has been confirmed, so the application never presents unverified text as
 *     current government information.
 *   - Only schemes that are widely documented and long-running are listed, and
 *     only their OFFICIAL portal domains are recorded.
 *   - No benefit amount, eligibility rule or deadline is stated as a guaranteed
 *     current figure. Where a figure would normally be expected, the record says
 *     "verify on the official portal".
 *   - KhetiGPT does NOT accept applications. `applicationMode` explains the
 *     official channel only.
 *
 * TO ADD OR UPDATE A SCHEME: edit this file, or replace this module with a
 * MongoDB collection later. The service layer already treats it as a data source.
 */

/** Categories exposed through the /api/schemes?category= filter. */
export const SCHEME_CATEGORIES = ["All", "Central", "State", "Agriculture", "Farmer Support"];

/** The reference dataset. */
export const SCHEMES = [
  {
    // Stable public id used in the URL: /api/schemes/pm-kisan
    id: "pm-kisan",
    // Official scheme name.
    title: "PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)",
    // Filter category.
    category: "Central",
    // Implementing authority.
    authority: "Ministry of Agriculture and Farmers Welfare, Government of India",
    // One-paragraph summary.
    summary:
      "A central sector scheme that provides income support to eligible landholding farmer families through direct benefit transfer into their bank accounts.",
    // Benefit highlights (descriptive, no amounts asserted).
    benefits: [
      "Direct income support paid to eligible landholding farmer families",
      "Amount is credited directly to the beneficiary's bank account through DBT",
      "Paid in instalments as per the scheme guidelines",
    ],
    // Eligibility outline. The portal is authoritative.
    eligibility: [
      "Landholding farmer families as defined in the scheme guidelines",
      "Valid Aadhaar and bank account linked to the applicant",
      "Certain categories, such as institutional landholders and serving government employees, are excluded",
      "Exact exclusion list and current conditions must be verified on the official portal",
    ],
    // Documents generally required (indicative).
    documents: [
      "Aadhaar card",
      "Bank account details / passbook",
      "Land ownership records (record of rights / khatauni)",
      "Mobile number registered in the applicant's name",
    ],
    // How one applies - the official channel only.
    applicationMode: "Online registration on the official PM-KISAN portal or through a Common Service Centre (CSC)",
    // Official website domain.
    officialWebsite: "https://pmkisan.gov.in",
    // Verification status, shown in the UI.
    verification: {
      // One of: "official-portal" | "needs-verification"
      status: "official-portal",
      // Plain language explanation shown to the user.
      note:
        "The scheme name, purpose and official portal are well established. Current benefit amounts and exclusion rules must be confirmed on the official portal.",
      // When this record was last reviewed by the project author.
      lastReviewed: "2026-01",
    },
  },
  {
    id: "pm-fasal-bima-yojana",
    title: "Pradhan Mantri Fasal Bima Yojana (PMFBY)",
    category: "Central",
    authority: "Ministry of Agriculture and Farmers Welfare, Government of India",
    summary:
      "A crop insurance scheme that provides risk cover for notified crops against natural calamities, pests and diseases, implemented through empanelled insurance companies.",
    benefits: [
      "Insurance cover for crops notified by the state government",
      "Farmer premium share is subsidised as per the scheme guidelines",
      "Claim assessment for yield loss, localised calamities and post-harvest loss",
      "Claims are settled through the insurance company, not through KhetiGPT",
    ],
    eligibility: [
      "Farmers growing notified crops in notified areas",
      "Loanee farmers are covered as per scheme rules",
      "Non-loanee farmers can enrol voluntarily with land and sowing documents",
      "Enrolment windows and state-specific rules must be verified on the official portal",
    ],
    documents: [
      "Aadhaar card",
      "Land records or tenancy agreement",
      "Bank account details",
      "Sowing certificate for non-loanee farmers",
    ],
    applicationMode: "Online on the official PMFBY portal, through a bank, or through a CSC",
    officialWebsite: "https://pmfby.gov.in",
    verification: {
      status: "official-portal",
      note: "Scheme identity, purpose and official portal are confirmed. Premium rates, notified crops and cut-off dates change by season and state.",
      lastReviewed: "2026-01",
    },
  },
  {
    id: "soil-health-card",
    title: "Soil Health Card Scheme",
    category: "Agriculture",
    authority: "Department of Agriculture & Farmers Welfare, Government of India",
    summary:
      "Provides farmers with a soil test based report for their holding, along with crop-wise nutrient recommendations, so fertilizer use can be planned properly.",
    benefits: [
      "Soil sample testing and a printed or digital soil health card",
      "Crop-wise nutrient recommendation based on measured values",
      "Helps avoid both under-use and over-use of fertilizers",
      "Directly useful input for the KhetiGPT fertilizer guidance module",
    ],
    eligibility: [
      "Farmers with cultivable land",
      "Sample collection is arranged through the local agriculture office",
      "Availability of testing cycles depends on the state",
    ],
    documents: [
      "Land records",
      "Aadhaar card",
      "Contact details for sample collection",
    ],
    applicationMode: "Through the local agriculture office or the state soil testing laboratory",
    officialWebsite: "https://soilhealth.dac.gov.in",
    verification: {
      status: "official-portal",
      note: "Scheme identity and purpose are confirmed. Portal availability and the current testing cycle should be confirmed locally.",
      lastReviewed: "2026-01",
    },
  },
  {
    id: "kisan-credit-card",
    title: "Kisan Credit Card (KCC)",
    category: "Farmer Support",
    authority: "Department of Financial Services / NABARD, implemented by banks",
    summary:
      "A credit facility that gives farmers short-term working capital for crop cultivation and related needs through a card linked to their bank account.",
    benefits: [
      "Short-term crop loan access through a single card",
      "Interest subvention may apply as per current government guidelines",
      "Flexible repayment generally aligned with the harvest cycle",
      "Can also cover post-harvest and allied activity needs as per bank rules",
    ],
    eligibility: [
      "Farmers with cultivable land, tenant farmers and sharecroppers",
      "Valid identity and land documents",
      "Sanction depends on the bank's credit appraisal",
      "Current interest rate and subvention terms must be confirmed with the lending bank",
    ],
    documents: [
      "Aadhaar card and PAN card",
      "Land records or tenancy agreement",
      "Passport size photographs",
      "Bank account details",
    ],
    applicationMode: "Directly at a bank branch or through the bank's online portal",
    officialWebsite: "https://www.myscheme.gov.in/schemes/kcc",
    verification: {
      status: "needs-verification",
      note: "The scheme and purpose are well established. Interest subvention rates and eligible loan amounts change frequently and must be confirmed with the bank.",
      lastReviewed: "2026-01",
    },
  },
  {
    id: "per-drop-more-crop",
    title: "Per Drop More Crop (Micro Irrigation Fund)",
    category: "Agriculture",
    authority: "Department of Agriculture & Farmers Welfare, Government of India",
    summary:
      "A component of the Pradhan Mantri Krishi Sinchayee Yojana that promotes water efficient micro-irrigation, mainly drip and sprinkler systems, through subsidy support.",
    benefits: [
      "Subsidy support for drip and sprinkler irrigation systems",
      "Higher assistance percentage for small and marginal farmers",
      "Reduces water consumption and allows fertigation",
      "Implementation and subsidy percentages are state specific",
    ],
    eligibility: [
      "Farmers with an assured water source on the holding",
      "Small and marginal farmers receive the higher assistance slab",
      "Installation must normally be done through an empanelled vendor",
      "State level conditions must be verified with the state horticulture or agriculture department",
    ],
    documents: [
      "Land records",
      "Aadhaar card",
      "Bank account details",
      "Water source proof (borewell / canal / well documents)",
    ],
    applicationMode: "State agriculture or horticulture department portal, or through the district agriculture office",
    officialWebsite: "https://pmksy.gov.in",
    verification: {
      status: "needs-verification",
      note: "The programme and purpose are confirmed. Subsidy percentages and vendor processes differ by state and must be verified locally.",
      lastReviewed: "2026-01",
    },
  },
  {
    id: "e-nam",
    title: "e-NAM (National Agriculture Market)",
    category: "Farmer Support",
    authority: "Small Farmers' Agri-Business Consortium (SFAC), Ministry of Agriculture",
    summary:
      "A pan-India electronic trading platform that connects regulated mandis, allowing registered farmers to see prices and sell to buyers across participating markets.",
    benefits: [
      "Online price discovery across participating APMC mandis",
      "Transparent bidding and online payment to the farmer's bank account",
      "Access to buyers beyond the local mandi",
      "KhetiGPT does not facilitate any sale; this is information only",
    ],
    eligibility: [
      "Farmer registration on the platform",
      "Produce must meet the lot and quality specifications of the trade",
      "Bank account required for payment settlement",
    ],
    documents: [
      "Aadhaar card",
      "Bank account details",
      "Land records or farmer certificate",
    ],
    applicationMode: "Online registration on the official e-NAM portal or through the e-NAM mobile application",
    officialWebsite: "https://www.enam.gov.in",
    verification: {
      status: "official-portal",
      note: "The platform and purpose are confirmed. Participating mandis and trade rules should be checked on the portal before planning a sale.",
      lastReviewed: "2026-01",
    },
  },
  {
    id: "kvk-support",
    title: "Krishi Vigyan Kendra (KVK) Advisory and Training",
    category: "Agriculture",
    authority: "Indian Council of Agricultural Research (ICAR)",
    summary:
      "District level farm science centres that provide technology assessment, demonstrations, training and frontline advisory support to farmers in their district.",
    benefits: [
      "Free or low cost training programmes on crops, soil and plant protection",
      "On-field demonstrations of improved practices",
      "Soil, water and plant tissue testing support in many locations",
      "Direct access to subject matter specialists",
    ],
    eligibility: [
      "Open to farmers in the KVK's operating district",
      "Prior registration is usually required for scheduled training",
      "Group participation from farmer organisations is encouraged",
    ],
    documents: [
      "Basic identity details",
      "Contact information",
      "Details of the farm and crop for advisory purposes",
    ],
    applicationMode: "Direct contact with the district KVK, in person or by telephone",
    officialWebsite: "https://kvk.icar.gov.in",
    verification: {
      status: "official-portal",
      note: "The KVK network and its purpose are confirmed. Individual KVK contact details and programme calendars change, so verify locally.",
      lastReviewed: "2026-01",
    },
  },
  {
    id: "state-agri-subsidy",
    title: "State Agricultural Mechanisation Subsidy (illustrative record)",
    category: "State",
    authority: "State Department of Agriculture (varies by state)",
    summary:
      "Illustrative record representing state level programmes that subsidise farm machinery, implements and custom hiring centres. State rules, subsidy percentages and eligibility differ significantly.",
    benefits: [
      "Subsidy on the purchase of selected farm machinery and implements",
      "Support for custom hiring centres that rent equipment to small farmers",
      "Training sessions on safe machine operation",
    ],
    eligibility: [
      "Resident farmers of the respective state",
      "Land records or a tenant certificate are usually required",
      "Purchase normally has to be from an approved vendor",
      "State specific rules apply and MUST be verified with the state department",
    ],
    documents: [
      "Aadhaar card",
      "Land records",
      "Bank account details",
      "Quotation from the approved vendor",
    ],
    applicationMode: "State agriculture department portal or district agriculture office",
    officialWebsite: "https://www.myscheme.gov.in",
    verification: {
      status: "needs-verification",
      note:
        "This is an illustrative placeholder record, NOT a specific verified state scheme. Replace it with your own state's actual scheme details before any real deployment.",
      lastReviewed: "2026-01",
    },
  },
];

/**
 * findSchemeById - case-insensitive lookup by scheme id.
 * @param {string} id
 */
export const findSchemeById = (id) => {
  // Normalise the incoming id.
  const key = String(id ?? "").toLowerCase().trim();
  // Return the matching record or undefined.
  return SCHEMES.find((scheme) => scheme.id.toLowerCase() === key);
};

/**
 * filterSchemes - applies the search text and category filter.
 * Pure function so it can be unit tested without HTTP.
 *
 * @param {Object} params
 * @param {string} [params.search]   - free text searched against title/summary/authority
 * @param {string} [params.category] - one of SCHEME_CATEGORIES, or "All"
 * @param {number} [params.page]     - 1-based page number
 * @param {number} [params.limit]    - records per page
 */
export const filterSchemes = ({ search = "", category = "All", page = 1, limit = 20 } = {}) => {
  // Normalise the search term once for case-insensitive matching.
  const term = String(search).trim().toLowerCase();

  // Step 1: filter.
  const filtered = SCHEMES.filter((scheme) => {
    // Category must match unless "All" was requested.
    const categoryMatch = !category || category === "All" || scheme.category === category;
    // Empty search matches everything.
    if (!term) return categoryMatch;
    // Build one searchable string from the main text fields.
    const haystack = [scheme.title, scheme.summary, scheme.authority, scheme.category, scheme.id]
      .join(" ")
      .toLowerCase();
    // Both conditions must hold.
    return categoryMatch && haystack.includes(term);
  });

  // Step 2: paginate.
  // Ensure the page and limit are sane numbers.
  const safePage = Math.max(1, Number(page) || 1);
  // Cap the page size so a single request cannot return everything.
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  // Calculate the array slice boundaries.
  const start = (safePage - 1) * safeLimit;
  // Slice the filtered list.
  const records = filtered.slice(start, start + safeLimit);

  // Return the records plus the pagination metadata.
  return {
    records,
    meta: {
      // Total records matching the filters (before pagination).
      total: filtered.length,
      // Current page number.
      page: safePage,
      // Page size used.
      limit: safeLimit,
      // Total pages available.
      totalPages: Math.max(1, Math.ceil(filtered.length / safeLimit)),
    },
  };
};
