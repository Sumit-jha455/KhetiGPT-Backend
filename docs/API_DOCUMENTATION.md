# API Documentation

Base URL (local): `http://localhost:5000/api`

Every response uses the same envelope:

```json
{ "success": true, "message": "…", "data": { } }
```

```json
{ "success": false, "message": "…", "errors": [{ "field": "email", "message": "…" }] }
```

Authentication: send `Authorization: Bearer <token>` **or** rely on the `khetigpt_token` httpOnly
cookie set by login/register.

---

## 1. Health

### `GET /api/health`

Public. Never fails — it reports the real state of each dependency.

```json
{
  "success": true,
  "message": "KhetiGPT API is degraded.",
  "data": {
    "status": "degraded",
    "service": "KhetiGPT Backend",
    "version": "1.0.0",
    "uptimeSeconds": 13,
    "timestamp": "2026-11-10T06:02:26.597Z",
    "nodeVersion": "v20.20.2",
    "environment": "development",
    "dependencies": {
      "database":   { "status": "disconnected",  "required": true },
      "gemini":     { "status": "not-configured", "model": null, "required": false },
      "openweather":{ "status": "not-configured", "required": false }
    }
  }
}
```

`status` is `ok` only when MongoDB is connected.

---

## 2. Authentication

### `POST /api/auth/register`

Public. Rate limited to 20 requests / 15 min / IP.

**Request**

```json
{
  "name": "Aarav Patil",
  "email": "aarav@example.com",
  "password": "Passw0rd",
  "confirmPassword": "Passw0rd",
  "location": "Nashik, Maharashtra",
  "language": "English",
  "farmSize": 2.5,
  "farmSizeUnit": "acre",
  "soilType": "Loamy",
  "waterAvailability": "Medium",
  "season": "Rabi"
}
```

| Field | Required | Rules |
| --- | --- | --- |
| `name` / `fullName` | ✅ | 2–80 chars, letters/spaces/apostrophes/hyphens |
| `email` | ✅ | valid email, stored lowercase |
| `password` | ✅ | 8–72 chars, ≥ 1 letter and ≥ 1 number |
| `confirmPassword` | – | must equal `password` when supplied |
| `location` | – | ≤ 120 chars |
| `phone` | – | 6–20 chars, digits/`+`/`-`/spaces |
| `state` / `district` | – | ≤ 80 chars |
| `language` / `preferredLanguage` | – | English, Hindi, Marathi, Punjabi, Telugu, Other |
| `farmSize` | – | number ≥ 0 |
| `farmSizeUnit` | – | acre, hectare, bigha, guntha |
| `soilType` | – | Loamy, Clay, Sandy, Black, Alluvial, Red, Laterite, Other |
| `waterAvailability` / `irrigationType` | – | Rainfed, Low, Medium, High, Drip, Sprinkler, Canal |
| `currentCrop` | – | ≤ 80 chars |
| `season` | – | Kharif, Rabi, Zaid |

**201 Created**

```json
{
  "success": true,
  "message": "Account created successfully. Welcome to KhetiGPT.",
  "data": {
    "user": {
      "id": "6789abc…", "fullName": "Aarav Patil", "name": "Aarav Patil",
      "email": "aarav@example.com", "phone": "", "location": "Nashik, Maharashtra",
      "state": "", "district": "", "preferredLanguage": "English", "language": "English",
      "farmSize": 2.5, "farmSizeUnit": "acre", "soilType": "Loamy",
      "irrigationType": "Medium", "waterAvailability": "Medium",
      "currentCrop": "", "season": "Rabi", "isActive": true,
      "createdAt": "…", "updatedAt": "…"
    },
    "token": "eyJhbGciOiJIUzI1NiIs…",
    "tokenType": "Bearer",
    "expiresIn": "1d"
  }
}
```

**Errors**

| Status | When |
| --- | --- |
| 400 | Missing/invalid field |
| 409 | Email already registered → `An account with this email already exists.` |
| 429 | Rate limit exceeded |
| 503 | MongoDB unreachable |

> The password hash is never present in any response.

### `POST /api/auth/login`

Public. Rate limited to 20 requests / 15 min / IP.

```json
{ "email": "aarav@example.com", "password": "Passw0rd" }
```

**200** — same body shape as register.

**401** — `Invalid email or password.`
This is the **same message** for a wrong email and a wrong password, so the endpoint cannot be used
to discover which emails are registered.

### `POST /api/auth/logout`

Public. Always returns 200. Clears the httpOnly cookie.

```json
{ "success": true, "message": "Logged out successfully.",
  "data": { "cleared": true, "userId": "6789abc…", "environment": "development" } }
```

> Stateless JWTs cannot be invalidated server-side without a blocklist. The client must delete its
> stored token (the provided `authService.logout()` does this).

### `GET /api/auth/me` 🔒

Returns the authenticated farmer.

```json
{ "success": true, "message": "Profile loaded.", "data": { "user": { } } }
```

**401** when no/invalid/expired token.

---

## 3. User Profile

### `GET /api/users/profile` 🔒  (alias `GET /api/users/me`)

Returns the profile and farm information. Same `user` object as `/auth/me`.

### `PUT /api/users/profile` 🔒  (alias `PUT /api/users/me`)

Partial update — send only the fields you want to change.

```json
{
  "fullName": "Aarav Patil",
  "phone": "+91 98765 43210",
  "location": "Nashik, Maharashtra",
  "soilType": "Black",
  "irrigationType": "Drip",
  "currentCrop": "Tomato",
  "season": "Kharif",
  "farmSize": 3
}
```

**200**

```json
{ "success": true, "message": "Profile updated successfully.", "data": { "user": { } } }
```

**Rules**

- Unknown fields are silently ignored (mass-assignment protection).
- `email` cannot be changed → **400**.
- Enum fields are validated → **400** with the accepted values listed.
- Empty string on `soilType`/`irrigationType`/`season` clears the field (stored as `null`).

---

## 4. AI Farming Assistant

### `POST /api/assistant/chat`  (alias `POST /api/assistant/message`)

Auth optional. Rate limited to 30 requests / 15 min / IP.

With a token the request is personalised with the farmer's crop, soil, season and location, and the
conversation is persisted. Without a token the question is still answered, but not stored.

**Request**

```json
{ "message": "My tomato leaves are curling downwards. What should I check first?" }
```

| Field | Required | Rules |
| --- | --- | --- |
| `message` | ✅ | 2–2000 chars |

**200**

```json
{
  "success": true,
  "message": "Reply generated.",
  "data": {
    "reply": "Downward leaf curl in tomato usually points to water stress rather than a disease…",
    "model": "gemini-2.5-flash",
    "tokens": 412,
    "grounded": true,
    "repliedAt": "2026-11-10T06:05:11.220Z",
    "conversation": { "id": "…", "userId": "…", "messages": [], "totalMessages": 6, "updatedAt": "…" },
    "context": { "historyTurns": 4, "profileUsed": true, "systemInstructionApplied": true }
  }
}
```

**Errors**

| Status | When |
| --- | --- |
| 400 | Empty or oversized message |
| 429 | AI rate limit, or Gemini quota exhausted |
| 503 | `GEMINI_API_KEY` missing, model unavailable, or MongoDB unreachable |

### `GET /api/assistant/history` 🔒

```json
{
  "success": true,
  "message": "Chat history loaded.",
  "data": {
    "conversation": {
      "id": "…", "userId": "…",
      "messages": [
        { "id": "…", "role": "user",  "content": "What crop suits loamy soil?", "timestamp": "…", "model": null },
        { "id": "…", "role": "model", "content": "For loamy soil…",             "timestamp": "…", "model": "gemini-2.5-flash" }
      ],
      "totalMessages": 2, "updatedAt": "…"
    },
    "aiConfigured": true,
    "model": "gemini-2.5-flash"
  }
}
```

### `DELETE /api/assistant/history` 🔒

```json
{ "success": true, "message": "Chat history cleared.", "data": { "cleared": true, "deletedCount": 1 } }
```

### `GET /api/assistant/meta`

Public, personalised when a token is present.

```json
{
  "success": true,
  "data": {
    "aiConfigured": false,
    "model": null,
    "topics": ["Crop cultivation", "Soil management", "…"],
    "safetyNotes": [
      "The assistant is not a certified agricultural expert.",
      "It does not recommend specific pesticide or chemical dosages.",
      "It does not provide exact fertilizer quantities; use a soil test report.",
      "It does not fabricate government scheme details; verify on official portals.",
      "Consult a local agriculture officer or Krishi Vigyan Kendra for high-risk decisions."
    ],
    "personalised": false,
    "database": "disconnected"
  }
}
```

### Assistant scope and safety

The system instruction (`src/data/assistantPrompt.js`) explicitly forbids the assistant from:

1. Claiming to be a certified expert
2. Recommending a specific pesticide, dose, concentration or spray volume
3. Giving fertilizer quantities in kg/acre or kg/hectare
4. Fabricating schemes, benefit amounts, deadlines or URLs
5. Guaranteeing yield or income
6. Answering high-risk questions without referring to a qualified expert

---

## 5. Weather

All weather endpoints accept `city`, **or** `lat` + `lon`. With a token and no parameter, the
farmer's saved `location` is used.

### `GET /api/weather/current?city=Delhi`  (alias `GET /api/weather?city=Delhi`)

```json
{
  "success": true,
  "message": "Current weather loaded.",
  "data": {
    "weather": {
      "location": "Delhi, IN",
      "coordinates": { "lat": 28.6667, "lon": 77.2167 },
      "temperature": 28,
      "feelsLike": 30.2,
      "tempMin": 25.4, "tempMax": 31.1,
      "condition": "Clouds",
      "description": "few clouds",
      "icon": "cloud-sun",
      "humidity": 62,
      "windSpeed": 12,
      "pressure": 1012,
      "cloudiness": 20,
      "rainProbability": 12,
      "rainLastHour": 0,
      "visibilityKm": 10,
      "sunrise": "06:24 AM",
      "sunset": "06:52 PM",
      "units": { "temperature": "°C", "wind": "km/h", "rain": "mm" },
      "provider": "OpenWeather",
      "updatedAt": "2026-11-10T06:02:26.000Z"
    },
    "locationSource": "query",
    "configured": true
  }
}
```

`icon` uses one of: `sun`, `cloud-sun`, `cloud`, `cloud-rain`, `cloud-lightning`.

### `GET /api/weather/forecast?city=Delhi`

OpenWeather's 3-hourly steps aggregated into daily rows.

```json
{
  "success": true,
  "data": {
    "location": "Delhi, IN",
    "forecast": [
      { "date": "2026-11-10", "condition": "Haze", "icon": "cloud-sun",
        "high": 31, "low": 19, "humidity": 58, "wind": 11, "rain": 0, "rainVolumeMm": 0 }
    ],
    "locationSource": "query",
    "provider": "OpenWeather"
  }
}
```

### `GET /api/weather/bundle?city=Delhi`

Returns `{ weather, forecast, location, locationSource, provider }` in one call.

### `GET /api/weather/status`

```json
{ "success": true, "data": { "configured": false, "profileLocation": "Nashik, Maharashtra",
  "supportedParameters": ["city", "lat", "lon", "units"],
  "units": { "temperature": "°C", "wind": "km/h", "rain": "mm" } } }
```

**Weather errors**

| Status | When |
| --- | --- |
| 400 | No location supplied, or an invalid city name |
| 404 | City not recognised |
| 429 | OpenWeather rate limit |
| 503 | `OPENWEATHER_API_KEY` missing/invalid (new keys take up to 2 h to activate) |

---

## 6. Crop Recommendation

### `POST /api/crops/recommend`  (alias `POST /api/crops/recommendation`)

Auth optional — with a token, missing fields fall back to the saved profile.

```json
{ "soilType": "Loamy", "season": "Rabi", "water": "Medium", "farmSize": 2.5 }
```

| Field | Required | Values |
| --- | --- | --- |
| `soilType` | ✅ | Loamy, Clay, Sandy, Black, Alluvial, Red, Laterite, Other |
| `season` | ✅ | Kharif, Rabi, Zaid |
| `water` / `waterAvailability` | – | Low, Medium, High (or an irrigation type) |
| `location` | – | string |
| `farmSize` | – | number ≥ 0 |
| `temperature` | – | °C, −20…60 |
| `rainfall` | – | mm, 0…12000 |

**200**

```json
{
  "success": true,
  "data": {
    "recommendation": {
      "crop": "Wheat",
      "suitabilityScore": 80,
      "scoreLabel": "Strong match",
      "season": "Rabi",
      "category": "Cereal",
      "duration": "110-130 days",
      "waterNeed": "Medium",
      "reason": "Wheat scored highest against the conditions you provided. Why: Commonly cultivated in the Rabi season; Loamy soil is generally suitable; medium water availability matches its medium water requirement. …",
      "matchedFactors": [
        "Commonly cultivated in the Rabi season",
        "Loamy soil is generally suitable",
        "medium water availability matches its medium water requirement"
      ],
      "unmatchedFactors": [],
      "considerations": [
        "This is indicative guidance from a rule based system, not a professional agronomic recommendation.",
        "Carry out a soil test (Soil Health Card) before finalising the crop and inputs.",
        "Discuss the final decision with your local agriculture officer or Krishi Vigyan Kendra…",
        "Wheat is the main Rabi cereal in north and central India…"
      ],
      "cultivation": {
        "duration": "110-130 days",
        "waterRequirementMm": "450-650 mm",
        "temperatureRangeC": "10-25 °C",
        "category": "Cereal",
        "waterNeed": "Medium",
        "seasons": ["Rabi"]
      },
      "alternatives": [
        { "name": "Chickpea (Gram)", "suitabilityScore": 80, "category": "Pulse",
          "waterNeed": "Low", "duration": "95-110 days", "reason": "…", "note": "…" }
      ],
      "inputs": { "soilType": "Loamy", "season": "Rabi", "waterAvailability": "Medium",
                  "waterLabel": "Medium", "location": "", "farmSize": 2.5,
                  "temperature": null, "rainfall": null },
      "evaluatedCrops": 15,
      "method": "Rule based scoring (season 35 points, soil 25, water 20, temperature 15, rainfall 5)…",
      "disclaimer": "This recommendation is generated from general reference data and is for academic demonstration. It does not guarantee any yield or outcome…"
    },
    "profileUsed": false,
    "acceptedSoilTypes": ["Loamy", "Clay", "Sandy", "Black", "Alluvial", "Red", "Laterite", "Other"]
  }
}
```

**Scoring** (0–100): season 35 · soil 25 · water 20 · temperature 15 · rainfall 5.
`matchedFactors` and `unmatchedFactors` expose exactly why the score is what it is.

### `GET /api/crops/options`

```json
{ "success": true, "data": {
    "crops": [ { "name": "Rice (Paddy)", "category": "Cereal", "seasons": ["Kharif"],
                 "soils": ["Clay","Alluvial"], "waterNeed": "High", "duration": "120-150 days" } ],
    "seasons": ["Kharif", "Rabi", "Zaid"],
    "soilTypes": ["Loamy", "…"],
    "waterLevels": ["Low", "Medium", "High"],
    "seasonWindows": { "Kharif": "June to October (monsoon season)", "…": "…" },
    "method": "Rule based scoring over a curated crop catalogue."
} }
```

---

## 7. Fertilizer Guidance

### `POST /api/fertilizer/guidance`

Auth optional — `soilType` falls back to the saved profile.

```json
{ "crop": "Rice (Paddy)", "soilType": "Clay", "growthStage": "Flowering" }
```

| Field | Required | Values |
| --- | --- | --- |
| `crop` | ✅ | free text |
| `soilType` | ✅ | Loamy, Clay, Sandy, Black, Alluvial, Red, Laterite, Other |
| `growthStage` | ✅ | Seedling, Vegetative, Flowering, Harvest (case-insensitive) |

**200**

```json
{ "success": true, "data": { "guidance": {
    "inputs": { "crop": "Rice (Paddy)", "soilType": "Clay", "growthStage": "Flowering" },
    "nutrientEmphasis": "Balanced phosphorus and potassium for flowering and fruit set",
    "nutrientPriority": "Phosphorus and potassium, with reduced nitrogen",
    "stageSummary": "Flowering, grain and fruit formation depend heavily on phosphorus and potassium…",
    "cropSpecificNote": "Rice responds strongly to nitrogen, but split applications are needed…",
    "application": {
      "practice": "Apply a phosphorus- and potassium-oriented nutrient mix at flowering…",
      "soilAdjustment": "Holds nutrients and water well but drains slowly. Avoid waterlogging…",
      "cautions": ["Avoid a heavy nitrogen dose now, as it can delay maturity…", "…"]
    },
    "nutrients": [
      { "symbol": "N", "name": "Nitrogen", "role": "…", "sources": ["Urea", "…"],
        "deficiencySigns": "…", "excessRisk": "…", "isStagePriority": false }
    ],
    "organicOptions": [ { "name": "Farmyard manure (FYM)", "benefit": "…", "guidance": "…" } ],
    "soil": { "type": "Clay", "behaviour": "…", "adjustment": "…" },
    "safetyWarnings": ["Fertilizer decisions should be based on a soil health card report…", "…"],
    "method": "Structured reference data with rule based stage, soil and crop lookups. No dosage calculation is performed.",
    "disclaimer": "This is general educational guidance for an academic project, not a fertilizer recommendation…"
} } }
```

> **Deliberate omission:** no dosage figures. A correct dose requires a soil health card report and
> local recommendations. A dedicated test (`fertilizerService.test.js`) asserts this stays true.

### `GET /api/fertilizer/options`

Returns `growthStages`, `soilTypes`, `nutrients`, `organicOptions`, `safetyWarnings` and `scope`.

---

## 8. Government Schemes

### `GET /api/schemes`

| Query | Default | Description |
| --- | --- | --- |
| `search` | – | Matches title, summary, authority, category, id |
| `category` | `All` | All, Central, State, Agriculture, Farmer Support |
| `page` | `1` | 1-based |
| `limit` | `20` | 1–100 |

```json
{
  "success": true, "message": "Schemes loaded.",
  "data": {
    "schemes": [ { "id": "pm-fasal-bima-yojana", "title": "…", "category": "Central", "…": "…" } ],
    "categories": ["All", "Central", "State", "Agriculture", "Farmer Support"]
  },
  "meta": { "total": 8, "page": 1, "limit": 20, "totalPages": 1 }
}
```

### `GET /api/schemes/meta`

```json
{ "success": true, "data": {
    "categories": ["All","Central","State","Agriculture","Farmer Support"],
    "total": 8, "verified": 5, "needsVerification": 3,
    "dataPolicy": ["Scheme records are a small curated reference list, not a live government feed.", "…"],
    "needsVerificationList": [ { "id": "kisan-credit-card", "title": "…", "note": "…" } ]
} }
```

### `GET /api/schemes/:id`

`200` with the full record, or `404` `No scheme was found with that id.`

**Scheme record fields:** `id`, `title`, `category`, `authority`, `summary`, `benefits[]`,
`eligibility[]`, `documents[]`, `applicationMode`, `officialWebsite`,
`verification { status, note, lastReviewed }`.

---

## 9. Status Codes

| Code | Meaning |
| --- | --- |
| 200 | Success |
| 201 | Resource created |
| 400 | Validation failed / malformed request |
| 401 | Missing, invalid or expired token |
| 403 | Authenticated but not permitted |
| 404 | Resource or route not found |
| 409 | Conflict (e.g. duplicate email) |
| 413 | Request body too large |
| 422 | Valid syntax, business rule failed |
| 429 | Rate limited |
| 500 | Unexpected server error (details hidden) |
| 503 | MongoDB unreachable, or an API key missing/invalid |

---

## 10. Rate Limits

| Scope | Window | Limit |
| --- | --- | --- |
| All `/api/*` | 15 min | 300 requests / IP |
| `POST /api/auth/register`, `POST /api/auth/login` | 15 min | 20 requests / IP |
| `POST /api/assistant/chat`, `/message` | 15 min | 30 requests / IP |

Responses include the modern `RateLimit-*` headers so clients can self-throttle.
