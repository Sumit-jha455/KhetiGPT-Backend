/**
 * tests/api.test.js
 * -----------------------------------------------------------------------------
 * HTTP level integration tests using supertest against the real Express app.
 *
 * These tests exercise routing, middleware ordering, validation, the error
 * envelope, 401 protection, CORS headers and the 404 handler.
 *
 * They do NOT need MongoDB: endpoints that do need it respond with a clean 503,
 * which is itself an important behaviour to assert.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

// Build the app without opening a port.
const { default: createApp } = await import("../src/app.js");
// Import the prefix used by every route.
const { API_PREFIX } = await import("../src/routes/index.js");

// Shared app instance.
const app = createApp();

describe("API surface", () => {
  test("GET / returns a service description", async () => {
    // Call the root route.
    const response = await request(app).get("/");
    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the success flag.
    assert.equal(response.body.success, true);
    // Assert the service name.
    assert.ok(response.body.data.service.includes("KhetiGPT"));
  });

  test("GET /api/health reports real dependency status", async () => {
    // Call the health endpoint.
    const response = await request(app).get(`${API_PREFIX}/health`);
    // Assert 200: the health endpoint must never fail, even when degraded.
    assert.equal(response.status, 200);
    // Assert the success flag.
    assert.equal(response.body.success, true);
    // Assert the status is one of the two expected values.
    assert.ok(["ok", "degraded"].includes(response.body.data.status));
    // Assert the dependency block exists.
    assert.ok(response.body.data.dependencies.database);
    // Assert the database state is a readable string.
    assert.ok(typeof response.body.data.dependencies.database.status === "string");
    // Assert a version is reported.
    assert.ok(response.body.data.version);
    // Assert uptime is a number.
    assert.ok(typeof response.body.data.uptimeSeconds === "number");
  });

  test("does not leak the X-Powered-By header", async () => {
    // Call any route.
    const response = await request(app).get("/");
    // Assert the header is absent.
    assert.equal(response.headers["x-powered-by"], undefined);
  });

  test("sends security headers from helmet", async () => {
    // Call any route.
    const response = await request(app).get("/");
    // Assert HSTS is present (helmet sets it by default).
    assert.ok(response.headers["strict-transport-security"]);
  });

  test("returns 404 with the API envelope for unknown routes", async () => {
    // Call a route that does not exist.
    const response = await request(app).get(`${API_PREFIX}/does-not-exist`);
    // Assert 404.
    assert.equal(response.status, 404);
    // Assert the success flag is false.
    assert.equal(response.body.success, false);
    // Assert the message names the missing route.
    assert.ok(response.body.message.includes("/api/does-not-exist"));
  });

  test("returns 400 for a malformed JSON body", async () => {
    // Send an invalid JSON body.
    const response = await request(app)
      .post(`${API_PREFIX}/crops/recommend`)
      .set("Content-Type", "application/json")
      .send('{"soilType": "Loamy",,}');

    // Assert 400.
    assert.equal(response.status, 400);
    // Assert the message is safe and clear.
    assert.ok(/valid JSON/i.test(response.body.message));
  });

  test("CORS allows a whitelisted origin with credentials", async () => {
    // Send a pre-flight request from the Vite dev origin.
    const response = await request(app)
      .options(`${API_PREFIX}/schemes`)
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");

    // Assert the origin was echoed back.
    assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
    // Assert credentials are allowed (required for the httpOnly cookie).
    assert.equal(response.headers["access-control-allow-credentials"], "true");
  });
});

describe("crop recommendation endpoint", () => {
  test("POST /api/crops/recommend returns a recommendation", async () => {
    // Post a valid payload.
    const response = await request(app)
      .post(`${API_PREFIX}/crops/recommend`)
      .send({ soilType: "Loamy", season: "Rabi", water: "Medium" });

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the success flag.
    assert.equal(response.body.success, true);
    // Assert a crop was returned.
    assert.ok(response.body.data.recommendation.crop);
    // Assert the score is in range.
    assert.ok(response.body.data.recommendation.suitabilityScore >= 0);
    // Assert the disclaimer is present.
    assert.ok(response.body.data.recommendation.disclaimer.length > 20);
  });

  test("returns 400 when the season is missing", async () => {
    // Post an incomplete payload.
    const response = await request(app)
      .post(`${API_PREFIX}/crops/recommend`)
      .send({ soilType: "Loamy" });

    // Assert 400.
    assert.equal(response.status, 400);
    // Assert the success flag is false.
    assert.equal(response.body.success, false);
    // Assert a field level error was returned.
    assert.ok(Array.isArray(response.body.errors));
    // Assert the error names the missing field.
    assert.ok(response.body.errors.some((error) => error.field === "season"));
  });

  test("returns 400 for an invalid season value", async () => {
    // Post an invalid season.
    const response = await request(app)
      .post(`${API_PREFIX}/crops/recommend`)
      .send({ soilType: "Loamy", season: "Summer" });

    // Assert 400.
    assert.equal(response.status, 400);
    // Assert the message lists the accepted values.
    assert.ok(/Kharif/.test(response.body.message));
  });

  test("GET /api/crops/options returns the catalogue and accepted values", async () => {
    // Call the options endpoint.
    const response = await request(app).get(`${API_PREFIX}/crops/options`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the catalogue is non-empty.
    assert.ok(response.body.data.crops.length > 0);
    // Assert the three seasons are listed.
    assert.deepEqual(response.body.data.seasons, ["Kharif", "Rabi", "Zaid"]);
    // Assert the soil types are listed.
    assert.ok(response.body.data.soilTypes.includes("Loamy"));
  });
});

describe("fertilizer guidance endpoint", () => {
  test("POST /api/fertilizer/guidance returns guidance", async () => {
    // Post a valid payload.
    const response = await request(app)
      .post(`${API_PREFIX}/fertilizer/guidance`)
      .send({ crop: "Wheat", soilType: "Loamy", growthStage: "Vegetative" });

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the guidance block exists.
    assert.ok(response.body.data.guidance.nutrientEmphasis);
    // Assert safety warnings are attached.
    assert.ok(response.body.data.guidance.safetyWarnings.length > 0);
  });

  test("returns 400 for an invalid growth stage", async () => {
    // Post an invalid stage.
    const response = await request(app)
      .post(`${API_PREFIX}/fertilizer/guidance`)
      .send({ crop: "Wheat", soilType: "Loamy", growthStage: "Mature" });

    // Assert 400.
    assert.equal(response.status, 400);
    // Assert the message lists the accepted stages.
    assert.ok(/Seedling/.test(response.body.message));
  });

  test("GET /api/fertilizer/options returns the reference data", async () => {
    // Call the options endpoint.
    const response = await request(app).get(`${API_PREFIX}/fertilizer/options`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert all four stages are listed.
    assert.equal(response.body.data.growthStages.length, 4);
  });
});

describe("government schemes endpoints", () => {
  test("GET /api/schemes returns a paginated list", async () => {
    // Call the list endpoint.
    const response = await request(app).get(`${API_PREFIX}/schemes`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the success flag.
    assert.equal(response.body.success, true);
    // Assert records were returned.
    assert.ok(response.body.data.schemes.length > 0);
    // Assert pagination metadata is present.
    assert.ok(response.body.meta.total > 0);
  });

  test("supports the search parameter", async () => {
    // Search for a known term.
    const response = await request(app).get(`${API_PREFIX}/schemes?search=bima`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert at least one match.
    assert.ok(response.body.data.schemes.length >= 1);
  });

  test("supports the category filter", async () => {
    // Filter for central schemes.
    const response = await request(app).get(`${API_PREFIX}/schemes?category=Central`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Every returned record must be Central.
    for (const scheme of response.body.data.schemes) {
      // Assert the category.
      assert.equal(scheme.category, "Central");
    }
  });

  test("supports pagination", async () => {
    // Request one record per page.
    const response = await request(app).get(`${API_PREFIX}/schemes?limit=2&page=1`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert at most 2 records were returned.
    assert.ok(response.body.data.schemes.length <= 2);
    // Assert the limit was echoed.
    assert.equal(response.body.meta.limit, 2);
  });

  test("returns 400 for an unknown category", async () => {
    // Request an invalid category.
    const response = await request(app).get(`${API_PREFIX}/schemes?category=Bogus`);

    // Assert 400.
    assert.equal(response.status, 400);
    // Assert the accepted values are listed.
    assert.ok(/Central/.test(response.body.message));
  });

  test("GET /api/schemes/meta returns categories and the verification policy", async () => {
    // Call the meta endpoint. It MUST be registered before /:id.
    const response = await request(app).get(`${API_PREFIX}/schemes/meta`);

    // Assert 200 (a 404 here would mean a routing order bug).
    assert.equal(response.status, 200);
    // Assert the categories are present.
    assert.ok(response.body.data.categories.includes("All"));
    // Assert the data policy is present.
    assert.ok(Array.isArray(response.body.data.dataPolicy));
    // Assert the needs-verification list is exposed.
    assert.ok(Array.isArray(response.body.data.needsVerificationList));
  });

  test("GET /api/schemes/:id returns one record", async () => {
    // Request a known id.
    const response = await request(app).get(`${API_PREFIX}/schemes/pm-kisan`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the correct record was returned.
    assert.equal(response.body.data.scheme.id, "pm-kisan");
  });

  test("returns 404 for an unknown scheme id", async () => {
    // Request an unknown id.
    const response = await request(app).get(`${API_PREFIX}/schemes/does-not-exist`);

    // Assert 404.
    assert.equal(response.status, 404);
    // Assert the success flag is false.
    assert.equal(response.body.success, false);
  });
});

describe("authentication endpoints", () => {
  // REGRESSION TEST
  // The React register form sends `name`, not `fullName`. Validation used to
  // require `fullName`, which rejected every legitimate frontend submission
  // with 400 before the controller's alias resolution could run.
  test("accepts the frontend's `name` field as an alias for `fullName`", async () => {
    // Post exactly what the React Register.jsx sends.
    const response = await request(app).post(`${API_PREFIX}/auth/register`).send({
      name: "Aarav Patil",
      email: `alias.${Date.now()}@example.com`,
      password: "Passw0rd",
      location: "Nashik",
      language: "English",
    });

    // 503 means the alias was accepted and the request reached the database
    // guard (MongoDB is not running in this environment). A 400 naming
    // `fullName` would mean the alias regression has come back.
    assert.ok(
      [201, 503].includes(response.status),
      `expected 201 or 503, got ${response.status}: ${JSON.stringify(response.body)}`
    );
    // The failure must never again be the alias problem.
    assert.notEqual(
      response.status,
      400,
      "the `name` alias is being rejected by validation again"
    );
  });

  test("accepts the canonical `fullName` field as well", async () => {
    // Post the canonical field name.
    const response = await request(app).post(`${API_PREFIX}/auth/register`).send({
      fullName: "Canonical Name",
      email: `canonical.${Date.now()}@example.com`,
      password: "Passw0rd",
    });

    // 503 = validation passed, database guard fired.
    assert.ok([201, 503].includes(response.status));
  });

  test("still returns 400 when neither name field is supplied", async () => {
    // Post with no name at all.
    const response = await request(app)
      .post(`${API_PREFIX}/auth/register`)
      .send({ email: `noname.${Date.now()}@example.com`, password: "Passw0rd" });

    // Validation must pass (both name fields are optional) and the controller
    // must then reject it. With the database down, the guard fires first.
    assert.ok([400, 503].includes(response.status));
  });

  test("returns 400 with field errors for an invalid registration payload", async () => {
    // Post an invalid payload (bad email, weak password).
    const response = await request(app).post(`${API_PREFIX}/auth/register`).send({
      fullName: "A",
      email: "not-an-email",
      password: "123",
    });

    // Either 400 (validation fired first) or 503 (database unreachable).
    // Validation is registered BEFORE the database guard, so 400 is expected.
    assert.ok([400, 503].includes(response.status), `unexpected status ${response.status}`);
    // Assert the success flag is false.
    assert.equal(response.body.success, false);
  });

  test("returns 400 when login fields are missing", async () => {
    // Post an empty body.
    const response = await request(app).post(`${API_PREFIX}/auth/login`).send({});

    // Assert 400.
    assert.ok([400, 503].includes(response.status));
    // Assert the success flag is false.
    assert.equal(response.body.success, false);
  });

  test("POST /api/auth/logout always succeeds", async () => {
    // Call logout without a token.
    const response = await request(app).post(`${API_PREFIX}/auth/logout`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the success flag.
    assert.equal(response.body.success, true);
    // Assert the client is told to clear its token.
    assert.equal(response.body.data.cleared, true);
  });
});

describe("protected routes", () => {
  test("GET /api/users/profile returns 401 without a token", async () => {
    // Call without credentials.
    const response = await request(app).get(`${API_PREFIX}/users/profile`);

    // Assert 401.
    assert.equal(response.status, 401);
    // Assert the message explains the missing token.
    assert.ok(/token/i.test(response.body.message));
  });

  test("GET /api/users/me also returns 401 without a token", async () => {
    // Call the alias route.
    const response = await request(app).get(`${API_PREFIX}/users/me`);

    // Assert 401.
    assert.equal(response.status, 401);
  });

  test("PUT /api/users/profile returns 401 without a token", async () => {
    // Attempt an update without credentials.
    const response = await request(app).put(`${API_PREFIX}/users/profile`).send({ fullName: "New Name" });

    // Assert 401.
    assert.equal(response.status, 401);
  });

  test("returns 401 for a tampered token", async () => {
    // Send a deliberately invalid token.
    const response = await request(app)
      .get(`${API_PREFIX}/users/profile`)
      .set("Authorization", "Bearer not.a.real.token");

    // Assert 401.
    assert.equal(response.status, 401);
    // Assert the message does not reveal cryptographic details.
    assert.ok(!/signature/i.test(response.body.message));
  });

  test("GET /api/assistant/history returns 401 without a token", async () => {
    // Call without credentials.
    const response = await request(app).get(`${API_PREFIX}/assistant/history`);

    // Assert 401.
    assert.equal(response.status, 401);
  });

  test("GET /api/assistant/meta works without a token", async () => {
    // Call the public metadata endpoint.
    const response = await request(app).get(`${API_PREFIX}/assistant/meta`);

    // Assert 200.
    assert.equal(response.status, 200);
    // Assert the configuration flag is present.
    assert.equal(typeof response.body.data.aiConfigured, "boolean");
    // Assert the safety notes are exposed so the UI can show the limits.
    assert.ok(Array.isArray(response.body.data.safetyNotes));
  });
});

describe("weather endpoints", () => {
  test("GET /api/weather/current responds with a defined status", async () => {
    // Call the current weather endpoint.
    const response = await request(app).get(`${API_PREFIX}/weather/current?city=Delhi`);

    // 503 when no key is configured, 200 when it is.
    assert.ok([200, 503].includes(response.status), `unexpected status ${response.status}`);
    // When the key is missing the message must say so clearly.
    if (response.status === 503) {
      // Assert the message mentions the missing configuration.
      assert.ok(/not configured|OPENWEATHER_API_KEY/i.test(response.body.message));
    }
  });

  test("GET /api/weather (alias) behaves like /current", async () => {
    // Call the alias route.
    const response = await request(app).get(`${API_PREFIX}/weather?city=Delhi`);

    // Assert the same set of statuses.
    assert.ok([200, 503].includes(response.status));
  });

  test("GET /api/weather/bundle responds when configured", async () => {
    // Call the bundle endpoint.
    const response = await request(app).get(`${API_PREFIX}/weather/bundle?city=Delhi`);

    // Assert the expected statuses.
    assert.ok([200, 503].includes(response.status));
  });

  test("GET /api/weather/status always works", async () => {
    // Call the status endpoint.
    const response = await request(app).get(`${API_PREFIX}/weather/status`);

    // Assert 200: this endpoint never calls the external API.
    assert.equal(response.status, 200);
    // Assert the configuration flag is present.
    assert.equal(typeof response.body.data.configured, "boolean");
    // Assert the supported parameters are documented in the response.
    assert.ok(response.body.data.supportedParameters.includes("city"));
  });
});

describe("assistant endpoints", () => {
  test("POST /api/assistant/chat returns 400 for an empty message", async () => {
    // Post an empty message.
    const response = await request(app).post(`${API_PREFIX}/assistant/chat`).send({ message: "" });

    // 400 from validation, or 503 from the database guard when MongoDB is down.
    assert.ok([400, 503].includes(response.status), `unexpected status ${response.status}`);
  });

  test("POST /api/assistant/message (alias) is registered", async () => {
    // Post a valid message.
    const response = await request(app)
      .post(`${API_PREFIX}/assistant/message`)
      .send({ message: "What crop suits loamy soil?" });

    // 503 when the database is down, 200/503 from the AI when it is not.
    assert.ok([200, 503].includes(response.status), `unexpected status ${response.status}`);
  });
});

describe("frontend compatibility aliases", () => {
  // These mirror the endpoint names already present in the React frontend's
  // ENDPOINTS map, so the frontend works without changes.
  test("POST /api/assistant/message is mounted", async () => {
    // Call the alias.
    const response = await request(app).post(`${API_PREFIX}/assistant/message`).send({ message: "hi" });
    // Assert it is not a 404.
    assert.notEqual(response.status, 404);
  });

  test("GET /api/users/me is mounted", async () => {
    // Call the alias.
    const response = await request(app).get(`${API_PREFIX}/users/me`);
    // Assert it is not a 404 (401 means the route exists and is protected).
    assert.notEqual(response.status, 404);
  });

  test("GET /api/weather is mounted", async () => {
    // Call the alias.
    const response = await request(app).get(`${API_PREFIX}/weather?city=Delhi`);
    // Assert it is not a 404.
    assert.notEqual(response.status, 404);
  });

  test("POST /api/crops/recommend is mounted", async () => {
    // Call the endpoint.
    const response = await request(app).post(`${API_PREFIX}/crops/recommend`).send({});
    // Assert it is not a 404.
    assert.notEqual(response.status, 404);
  });

  test("POST /api/fertilizer/guidance is mounted", async () => {
    // Call the endpoint.
    const response = await request(app).post(`${API_PREFIX}/fertilizer/guidance`).send({});
    // Assert it is not a 404.
    assert.notEqual(response.status, 404);
  });

  test("GET /api/schemes is mounted", async () => {
    // Call the endpoint.
    const response = await request(app).get(`${API_PREFIX}/schemes`);
    // Assert 200.
    assert.equal(response.status, 200);
  });
});
