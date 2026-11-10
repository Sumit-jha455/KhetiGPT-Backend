# KhetiGPT Backend - Automated Tests

The backend uses **Node.js's built-in test runner** (`node --test`), so no extra test
framework needs to be learned or installed.

## Running the tests

```bash
cd KhetiGPT-Backend
npm test
```

The runner executes every file matching `tests/*.test.js`.

## What is covered

| File | What it tests | Needs a database? | Needs an API key? |
| --- | --- | --- | --- |
| `config.test.js` | Environment validation, CORS allowlist building, fail-fast rules | No | No |
| `utils.test.js` | `ApiError` factories, `asyncHandler`, response envelope | No | No |
| `cropService.test.js` | Crop scoring, ranking, explanations, input normalisation, validation | No | No |
| `cropWeather.test.js` | **Weather enrichment + fail-soft guarantee** | No | No |
| `fertilizerService.test.js` | Growth stage guidance, soil adjustments, safety warnings, validation | No | No |
| `schemes.test.js` | Search, category filter, pagination, id lookup, verification labels | No | No |
| `geminiService.test.js` | Provider error classification (429 / 400 / 401 / 5xx / timeout), system instruction safety rules, context builder | No | No |
| `weatherService.test.js` | Configuration reporting, error mapping | No | No |
| `api.test.js` | Full HTTP surface via supertest: health, routes, 404, malformed JSON, validation, 401, CORS, **`name`/`fullName` alias regression** | No | No |
| `auth.test.js` | Password hashing/verification, JWT signing and verification, token tampering | MongoDB | No |
| `assistantFlow.test.js` | End-to-end chat + history persistence + dosage refusal | MongoDB | Gemini key |

## The three guarantees these tests enforce

### 1. No dosage figures ever

`fertilizerService.test.js` collects **every** text field across
5 crops × 5 soils × 4 growth stages and asserts that none contains a
`kg/acre`-style dosage figure. If someone later adds a number, the suite fails.

### 2. A broken weather integration never blocks a crop recommendation

`cropWeather.test.js` asserts that `POST /api/crops/recommend` returns **200 with a
valid crop** even when OpenWeather is unconfigured, unreachable, or the city is
unrecognised. The response must still report honestly that weather was not used.

### 3. The `name` / `fullName` alias keeps working

`api.test.js` posts **exactly what the React `Register.jsx` sends** (`name`, not
`fullName`) and asserts it is not rejected with 400. This guards a real regression:
the validation middleware runs *before* the controller resolves the alias, so a
naive `fullName.notEmpty()` rule silently broke every frontend registration.

## Database- and AI-backed tests

`auth.test.js` and `assistantFlow.test.js` **skip themselves automatically** when the
required credentials are unavailable. They print a clear `SKIP` line instead of failing,
so the suite is always green while remaining honest about what was not verified.

```text
▶ auth
  ✔ skips when no database is available (0.4ms)
```

To run them for real:

```bash
MONGODB_URI="mongodb+srv://…" npm test                          # enables auth tests
MONGODB_URI="…" GEMINI_API_KEY="…" npm test                      # enables all tests
```

## Current status

```text
# tests 172
# pass  162
# fail  0
# skipped 10   <- tests that need MongoDB and/or a Gemini key
```

The 10 skips are **not** failures. They are the tests that cannot run without your own
credentials. See `docs/POSTMAN_TESTING.md` → "Verification status" for the exact
breakdown of what was verified and what still needs your keys.

## Adding a test

Create `tests/myModule.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("describes the behaviour", () => {
  assert.equal(1 + 1, 2);
});
```

For tests that need a database or an API key, follow the pattern in `auth.test.js`:
check availability in a `before()` hook and call `t.skip()` with a reason when it is absent.
