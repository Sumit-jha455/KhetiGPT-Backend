/**
 * schemesService.js — READY TO PASTE into the React frontend at src/services/schemesService.js
 * -----------------------------------------------------------------------------
 * Replaces the static scheme array with the searchable, filterable backend endpoint.
 */

// Shared axios instance.
import api from "./api";

/**
 * Fetches schemes with search, category filter and pagination.
 * Returns the same array shape your Schemes.jsx already maps over.
 *
 * @param {string} searchText - free text
 * @param {string} category   - "All" | "Central" | "State" | "Agriculture" | "Farmer Support"
 */
export async function fetchSchemes(searchText = "", category = "All") {
  // GET /api/schemes?search=…&category=…
  const { data } = await api.get("/schemes", {
    params: {
      // Only send the search when it is non-empty.
      ...(searchText ? { search: searchText } : {}),
      // Always send the category (the backend defaults to "All").
      category,
      // Page size; increase if you prefer a single long list.
      limit: 50,
    },
  });

  // Return just the array, matching your existing function's return type.
  return data.data.schemes;
}

/** Returns the categories and the dataset verification policy. */
export async function getSchemeMeta() {
  // GET /api/schemes/meta
  const { data } = await api.get("/schemes/meta");
  // Return the metadata block.
  return data.data;
}

/** Returns one scheme record by id. */
export async function getSchemeById(id) {
  // GET /api/schemes/:id
  const { data } = await api.get(`/schemes/${id}`);
  // Return the scheme record.
  return data.data.scheme;
}

// Default export.
export default { fetchSchemes, getSchemeMeta, getSchemeById };

/* ---------------------------------------------------------------------------
 * SCHEME SHAPE REFERENCE (superset of your current mock)
 *
 * {
 *   id: "pm-kisan",
 *   title: "PM-KISAN (Pradhan Mantri Kisan Samman Nidhi)",
 *   category: "Central",
 *   authority: "Ministry of Agriculture and Farmers Welfare, Government of India",
 *   summary: "…",
 *   benefits: ["…"],           <- same as your mock
 *   eligibility: ["…"],        <- same as your mock
 *   documents: ["…"],          <- NEW: show these in your details modal
 *   applicationMode: "…",      <- same as your `applyMode`
 *   officialWebsite: "https://pmkisan.gov.in",     <- NEW: link to the official portal
 *   verification: {            <- NEW: data-quality labelling
 *     status: "official-portal" | "needs-verification",
 *     note: "…",
 *     lastReviewed: "2026-01"
 *   }
 * }
 *
 * NOTE: your mock uses `applyMode`; the backend uses `applicationMode`.
 * Either rename it in the JSX, or add `applyMode: scheme.applicationMode` when mapping.
 * ------------------------------------------------------------------------- */
