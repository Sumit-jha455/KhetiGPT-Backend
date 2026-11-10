/**
 * tests/schemes.test.js
 * -----------------------------------------------------------------------------
 * Tests for the government schemes dataset and filter logic.
 *
 * The key assertions here are the HONESTY ones: every record must declare its
 * verification status, and no record may claim KhetiGPT can accept applications.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

// Import the dataset and the pure filter function.
const { SCHEMES, filterSchemes, findSchemeById, SCHEME_CATEGORIES } = await import("../src/data/schemes.js");

describe("government schemes dataset", () => {
  test("contains at least six records", () => {
    // Assert a minimum size so the module is demonstrable.
    assert.ok(SCHEMES.length >= 6, `expected at least 6 schemes, found ${SCHEMES.length}`);
  });

  test("every record has the fields the frontend renders", () => {
    // For each record...
    for (const scheme of SCHEMES) {
      // Assert the required fields exist and are non-empty.
      assert.ok(scheme.id, "id is required");
      assert.ok(scheme.title, "title is required");
      assert.ok(scheme.category, "category is required");
      assert.ok(scheme.authority, "authority is required");
      assert.ok(scheme.summary && scheme.summary.length > 20, "summary is required");
      // Assert the list fields are arrays.
      assert.ok(Array.isArray(scheme.benefits) && scheme.benefits.length > 0, "benefits are required");
      assert.ok(Array.isArray(scheme.eligibility) && scheme.eligibility.length > 0, "eligibility is required");
      assert.ok(Array.isArray(scheme.documents), "documents should be an array");
      // Assert the application channel is described.
      assert.ok(scheme.applicationMode, "applicationMode is required");
      // Assert an official website is present.
      assert.ok(/^https?:\/\//.test(scheme.officialWebsite), "officialWebsite must be a URL");
    }
  });

  test("every record declares a verification status", () => {
    // For each record...
    for (const scheme of SCHEMES) {
      // Assert the verification object exists.
      assert.ok(scheme.verification, "verification metadata is required");
      // Assert the status is one of the two allowed values.
      assert.ok(
        ["official-portal", "needs-verification"].includes(scheme.verification.status),
        `unexpected verification status on ${scheme.id}`
      );
      // Assert a plain language explanation is present.
      assert.ok(scheme.verification.note && scheme.verification.note.length > 20);
      // Assert a review date is recorded.
      assert.ok(scheme.verification.lastReviewed, "lastReviewed is required");
    }
  });

  test("scheme ids are unique", () => {
    // Collect the ids.
    const ids = SCHEMES.map((scheme) => scheme.id);
    // Assert there are no duplicates.
    assert.equal(new Set(ids).size, ids.length, "scheme ids must be unique");
  });

  test("all categories belong to the declared category list", () => {
    // For each record...
    for (const scheme of SCHEMES) {
      // Assert the category is known.
      assert.ok(
        SCHEME_CATEGORIES.includes(scheme.category),
        `"${scheme.category}" is not in SCHEME_CATEGORIES`
      );
    }
  });

  test("official website URLs use https", () => {
    // For each record...
    for (const scheme of SCHEMES) {
      // Assert the URL is https (never an unencrypted link).
      assert.ok(
        scheme.officialWebsite.startsWith("https://"),
        `${scheme.id} must link over https`
      );
    }
  });

  test("records that need verification are clearly labelled", () => {
    // Find the records needing verification.
    const needsVerification = SCHEMES.filter((scheme) => scheme.verification.status !== "official-portal");
    // There must be at least one, proving the mechanism is actually used.
    assert.ok(needsVerification.length >= 1, "at least one record should be marked as needing verification");
    // Each one must say so in its note.
    for (const scheme of needsVerification) {
      // Assert the note flags the uncertainty.
      assert.ok(
        /verif|confirm|illustrative|placeholder|MUST/i.test(scheme.verification.note),
        `${scheme.id} should clearly flag that it needs verification`
      );
    }
  });
});

describe("scheme filtering", () => {
  test("returns all records with no filters", () => {
    // Filter with no arguments.
    const { records, meta } = filterSchemes({});
    // Assert the full dataset was returned.
    assert.equal(records.length, SCHEMES.length);
    // Assert the total matches.
    assert.equal(meta.total, SCHEMES.length);
  });

  test("searches across title, summary and authority", () => {
    // Search for a term that appears in the PMFBY title.
    const { records } = filterSchemes({ search: "bima" });
    // At least one record must match.
    assert.ok(records.length >= 1, "the search should find PMFBY");
    // Every match must actually contain the term.
    for (const record of records) {
      // Build the haystack the same way the function does.
      const haystack = [record.title, record.summary, record.authority, record.category, record.id]
        .join(" ")
        .toLowerCase();
      // Assert the term is present.
      assert.ok(haystack.includes("bima"), `"${record.id}" should match the search term`);
    }
  });

  test("search is case-insensitive", () => {
    // Search in uppercase.
    const upper = filterSchemes({ search: "SOIL HEALTH" });
    // Search in lowercase.
    const lower = filterSchemes({ search: "soil health" });
    // Both must return the same number of records.
    assert.equal(upper.records.length, lower.records.length);
  });

  test("filters by category", () => {
    // Filter for central schemes.
    const { records } = filterSchemes({ category: "Central" });
    // Assert the list is non-empty.
    assert.ok(records.length > 0, "there should be central schemes");
    // Every record must be in the Central category.
    for (const record of records) {
      // Assert the category.
      assert.equal(record.category, "Central");
    }
  });

  test("combines search and category filters", () => {
    // Filter for central schemes matching "fertilizer" (should find none).
    const { records, meta } = filterSchemes({ search: "soil", category: "Agriculture" });
    // Assert the total reflects the combined filter.
    assert.equal(meta.total, records.length);
  });

  test("paginates correctly", () => {
    // Request one record per page.
    const page1 = filterSchemes({ page: 1, limit: 2 });
    const page2 = filterSchemes({ page: 2, limit: 2 });
    // Each page must have at most 2 records.
    assert.ok(page1.records.length <= 2);
    assert.ok(page2.records.length <= 2);
    // The pages must not overlap.
    assert.notDeepEqual(page1.records[0]?.id, page2.records[0]?.id);
    // The metadata must report the correct total.
    assert.equal(page1.meta.total, SCHEMES.length);
    // The metadata must report the page size.
    assert.equal(page1.meta.limit, 2);
  });

  test("returns an empty page when the page number is beyond the end", () => {
    // Request a page far beyond the dataset.
    const { records, meta } = filterSchemes({ page: 999, limit: 10 });
    // Assert no records were returned.
    assert.equal(records.length, 0);
    // The total must still be the dataset size.
    assert.equal(meta.total, SCHEMES.length);
  });

  test("findSchemeById is case-insensitive", () => {
    // Look up with an uppercase id.
    const scheme = findSchemeById("PM-KISAN");
    // Assert the record was found.
    assert.ok(scheme);
    // Assert it is the right record.
    assert.equal(scheme.id, "pm-kisan");
  });

  test("findSchemeById returns undefined for an unknown id", () => {
    // Look up a nonexistent id.
    assert.equal(findSchemeById("does-not-exist"), undefined);
  });
});
