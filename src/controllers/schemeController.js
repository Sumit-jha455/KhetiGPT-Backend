/**
 * controllers/schemeController.js
 * -----------------------------------------------------------------------------
 * Government scheme endpoints.
 *
 *   listSchemes    -> GET /api/schemes
 *   getSchemeById  -> GET /api/schemes/:id
 *   getSchemeMeta  -> GET /api/schemes/meta
 *
 * The dataset is a curated, clearly labelled reference list (data/schemes.js).
 * It needs no database, so the module works even before Atlas is configured.
 */

import { SCHEMES, filterSchemes, findSchemeById, SCHEME_CATEGORIES } from "../data/schemes.js";
// Operational error helpers.
import ApiError from "../utils/ApiError.js";
// Success envelope.
import { ok } from "../utils/response.js";

/**
 * listSchemes - returns a searchable, filterable, paginated scheme list.
 *
 * Query parameters:
 *   search   (string) - matches title, summary, authority, category and id
 *   category (string) - one of SCHEME_CATEGORIES, or "All"
 *   page     (number) - 1-based page number
 *   limit    (number) - records per page (1-100)
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const listSchemes = async (req, res) => {
  // --- Extract and normalise the query parameters -----------------------
  // Search term, empty when absent.
  const search = String(req.query?.search ?? "").trim();
  // Category filter, defaulting to "All".
  const category = String(req.query?.category ?? "All").trim() || "All";
  // Page number, defaulting to 1.
  const page = Number(req.query?.page ?? 1);
  // Page size, defaulting to 20.
  const limit = Number(req.query?.limit ?? 20);

  // --- Validate the category --------------------------------------------
  // Reject an unknown category so a typo returns 400 rather than an empty list.
  if (!SCHEME_CATEGORIES.includes(category)) {
    // 400 with the accepted values.
    throw ApiError.badRequest(`Category must be one of: ${SCHEME_CATEGORIES.join(", ")}.`, [
      { field: "category", message: "Unsupported category" },
    ]);
  }

  // --- Filter and paginate ----------------------------------------------
  const { records, meta } = filterSchemes({ search, category, page, limit });

  // Return the page plus the pagination metadata.
  return ok(
    res,
    "Schemes loaded.",
    {
      // The records for this page.
      schemes: records,
      // Available categories, so the UI can render its filter chips.
      categories: SCHEME_CATEGORIES,
    },
    // Pagination metadata in the standard `meta` field.
    meta
  );
};

/**
 * getSchemeById - returns a single scheme record.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getSchemeById = async (req, res) => {
  // --- Read and normalise the id -----------------------------------------
  const id = String(req.params?.id ?? "").trim();
  // Reject a missing id.
  if (!id) {
    // 400 because the path parameter was absent.
    throw ApiError.badRequest("Scheme id is required.");
  }

  // --- Look up the record ------------------------------------------------
  const scheme = findSchemeById(id);
  // 404 when the id does not match any record.
  if (!scheme) {
    // 404 with a message that does not hint at what ids exist.
    throw ApiError.notFound("No scheme was found with that id.");
  }

  // Return the full record.
  return ok(res, "Scheme loaded.", {
    // The complete scheme record.
    scheme,
    // The dataset total, useful context in the UI.
    totalSchemes: SCHEMES.length,
  });
};

/**
 * getSchemeMeta - returns the filter categories and the verification policy.
 * The frontend uses this to render its filter chips and its data-quality notice.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getSchemeMeta = async (req, res) => {
  // Count how many records are fully verified against an official portal.
  const verifiedCount = SCHEMES.filter((scheme) => scheme.verification?.status === "official-portal").length;

  // Return the metadata.
  return ok(res, "Scheme metadata loaded.", {
    // Available filter categories.
    categories: SCHEME_CATEGORIES,
    // Total number of records in the dataset.
    total: SCHEMES.length,
    // How many records are confirmed against an official portal.
    verified: verifiedCount,
    // How many records still need verification.
    needsVerification: SCHEMES.length - verifiedCount,
    // The data quality policy, displayed to the user.
    dataPolicy: [
      "Scheme records are a small curated reference list, not a live government feed.",
      "Scheme rules, benefit amounts and deadlines change frequently.",
      "KhetiGPT does not accept applications. It only points to the official channel.",
      "Each record shows its verification status and the date it was last reviewed.",
      "Always confirm details on the official portal or with a local agriculture office.",
    ],
    // Records that still need verification, so the UI can list them honestly.
    needsVerificationList: SCHEMES.filter((scheme) => scheme.verification?.status !== "official-portal").map(
      (scheme) => ({
        // Scheme id.
        id: scheme.id,
        // Scheme title.
        title: scheme.title,
        // Why it needs verification.
        note: scheme.verification?.note,
      })
    ),
  });
};
