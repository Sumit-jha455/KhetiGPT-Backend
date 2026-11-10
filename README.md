# KhetiGPT Backend

**AI-Powered Personal Farming Assistant — REST API**
_Tagline: Smarter Farming. Better Decisions._

Production-grade Node.js + Express backend for **KhetiGPT**, a B.Tech CSE academic mini project.
It connects to the existing React frontend and provides real authentication, a real Gemini-powered
farming assistant, real weather data, and transparent rule-based crop/fertilizer guidance.

---

## 1. Introduction

KhetiGPT brings agricultural information, weather insight and farming guidance into one place.
This backend owns all data, all secrets and all third-party integrations so that **no API key ever
reaches the browser**.

### Objectives

| # | Objective | Status |
| --- | --- | --- |
| 1 | Secure registration, login and JWT session handling | ✅ Implemented |
| 2 | Farmer profile and farm information persisted in MongoDB Atlas | ✅ Implemented |
| 3 | Gemini-powered AI farming assistant with persistent chat history | ✅ Implemented |
| 4 | Real weather data from OpenWeather | ✅ Implemented |
| 5 | Transparent, explainable crop recommendation engine | ✅ Implemented |
| 6 | Stage-wise fertilizer guidance with safety guardrails | ✅ Implemented |
| 7 | Government scheme reference with explicit verification labels | ✅ Implemented |
| 8 | Centralized validation, error handling, rate limiting and security headers | ✅ Implemented |
| 9 | Production-ready configuration and deployment documentation | ✅ Documented |
| 10 | Automated test suite | ✅ 172 tests |

---

## 2. Technology Stack

| Layer | Technology | Version |
| --- | --- | --- |
| Runtime | Node.js | ≥ 18.17 (tested on 20.20) |
| Framework | Express | 4.22 |
| Database | MongoDB Atlas + Mongoose | 8.24 |
| Authentication | jsonwebtoken (JWT), bcryptjs | 9.0 / 3.0 |
| AI | `@google/genai` (official Google GenAI SDK), `gemini-2.5-flash` | 2.32 |
| Weather | OpenWeather API via axios | 1.21 |
| Validation | express-validator | 7.3 |
| Security | helmet, cors, express-rate-limit, cookie-parser | 8.3 / 2.8 / 8.7 |
| Config | dotenv | 18.0 |
| Dev tooling | nodemon, supertest, Node's built-in test runner | — |

> `@google/generative-ai` was **deliberately not used** — Google deprecated it in favour of
> `@google/genai`.

---

## 3. Architecture

```
HTTP request
   │
   ▼
src/server.js ────── validates config → connects MongoDB → listens
   │
src/app.js ────────── helmet → CORS allowlist → body limits → cookies
   │                    → rate limiter → routes → 404 → centralized error handler
   ▼
src/routes/index.js  mounts every module under /api
   │
   ├─ authMiddleware     verify JWT → attach req.user
   ├─ validateMiddleware express-validator rules → 400 on bad input
   ├─ rateLimitMiddleware general / AI / auth limiters
   ▼
src/controllers/*.js  request → response orchestration
   │
   ▼
src/services/*.js     business logic + third-party integrations
   │                     ├─ geminiService.js      Google Gemini
   │                     ├─ weatherService.js     OpenWeather
   │                     ├─ cropService.js        rule engine
   │                     └─ fertilizerService.js  rule engine
   ▼
src/models/*.js       Mongoose schemas (User, ChatHistory)
   │
   ▼
MongoDB Atlas
```

**Design rules**

- **Fat service, thin controller.** Controllers only validate/translate HTTP. Logic lives in services.
- **Degraded mode.** If MongoDB is down the API still boots and serves `health`, `schemes`,
  `crops/*` and `fertilizer/*`; database-backed routes return an honest `503`.
- **Fail fast on config.** Missing `JWT_SECRET` or `MONGODB_URI` stops startup with a clear message.
- **No secrets in responses.** `User.toSafeObject()` is the only shape that can leave the server.

---

## 4. Folder Structure

```
KhetiGPT-Backend/
├── src/
│   ├── config/
│   │   ├── env.js                 # validated environment access
│   │   └── db.js                  # Mongoose connection (non-fatal on failure)
│   ├── controllers/
│   │   ├── authController.js      # register, login, logout, me
│   │   ├── userController.js      # get / update profile
│   │   ├── assistantController.js # chat, history, meta
│   │   ├── weatherController.js   # current, forecast, bundle, status
│   │   ├── cropController.js      # recommend, options
│   │   ├── fertilizerController.js# guidance, options
│   │   └── schemeController.js    # list, detail, meta
│   ├── data/
│   │   ├── assistantPrompt.js     # AI system instruction + context builder
│   │   ├── cropKnowledge.js       # crop catalogue + scoring rules
│   │   ├── fertilizerKnowledge.js # nutrient / stage / soil reference
│   │   └── schemes.js             # curated scheme dataset
│   ├── middleware/
│   │   ├── authMiddleware.js      # protect, optionalAuth, requireDatabase
│   │   ├── errorMiddleware.js     # 404 + centralized JSON errors
│   │   ├── validateMiddleware.js  # express-validator rule chains
│   │   └── rateLimitMiddleware.js # general, AI and auth limiters
│   ├── models/
│   │   ├── User.js                # farmer account + farm profile
│   │   └── ChatHistory.js         # persisted AI conversation
│   ├── routes/                    # one router per module + index.js
│   ├── services/                  # gemini, weather, crop, fertilizer
│   ├── utils/
│   │   ├── ApiError.js            # operational error with HTTP status
│   │   ├── asyncHandler.js        # async error forwarding
│   │   └── response.js            # success envelope helpers
│   ├── app.js                     # Express app factory
│   └── server.js                  # process entry point
├── tests/                         # 10 test files, 172 tests
├── docs/                          # API, Postman, integration, deployment docs
├── postman/                       # ready-to-import Postman collection
├── .env.example                   # placeholder values only — never real keys
├── .gitignore
├── package.json
└── README.md
```

---

## 5. Installation

### Prerequisites

- Node.js 18.17+
- A MongoDB Atlas cluster (free M0 tier is enough)
- A Gemini API key — https://aistudio.google.com/apikey
- An OpenWeather API key — https://home.openweathermap.org/api_keys

### Steps

```bash
# 1. enter the backend folder
cd KhetiGPT-Backend

# 2. install dependencies
npm install

# 3. create your local environment file
cp .env.example .env

# 4. edit .env and fill in every value (see section 6)

# 5. start in development mode (auto-reload)
npm run dev

# 6. verify it is alive
curl http://localhost:5000/api/health
```

### Generating a secure JWT secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### MongoDB Atlas checklist

1. Create a free cluster.
2. **Database Access** → add a database user (username + password).
3. **Network Access** → **Add IP Address**. Use `0.0.0.0/0` for a class demo, or your own IP for local dev.
4. **Connect → Drivers** → copy the connection string into `MONGODB_URI`.
5. Replace `<password>` with the real password and append `/khetigpt` before the `?`.

---

## 6. Environment Variables

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | – | `development` | `development` shows debug info, `production` hides it |
| `PORT` | – | `5000` | HTTP port (Render injects this) |
| `API_BASE_URL` | – | `http://localhost:5000` | Public URL, informational |
| `CORS_ORIGIN` | ✅ | Vite dev ports | Comma-separated allowlist of frontend origins |
| `MONGODB_URI` | ✅ | – | Atlas connection string |
| `MONGODB_DB_NAME` | – | `khetigpt` | Fallback database name |
| `JWT_SECRET` | ✅ | – | ≥ 32 chars. Server refuses to start without it |
| `JWT_EXPIRES_IN` | – | `1d` | Token lifetime |
| `BCRYPT_SALT_ROUNDS` | – | `10` | Password hashing cost |
| `GEMINI_API_KEY` | for AI | – | Enables `/api/assistant/chat` |
| `GEMINI_MODEL` | – | `gemini-2.5-flash` | Must be a supported model |
| `OPENWEATHER_API_KEY` | for weather | – | Enables `/api/weather/*` |
| `OPENWEATHER_BASE_URL` | – | `https://api.openweathermap.org` | API base |
| `RATE_LIMIT_WINDOW_MINUTES` | – | `15` | General limiter window |
| `RATE_LIMIT_MAX_REQUESTS` | – | `300` | Requests per window per IP |
| `AI_RATE_LIMIT_WINDOW_MINUTES` | – | `15` | AI limiter window |
| `AI_RATE_LIMIT_MAX_REQUESTS` | – | `30` | AI requests per window per IP |

> `.env` is git-ignored. Only `.env.example` (placeholders) is committed.

---

## 7. API Documentation

Full reference with request/response examples: **[docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md)**

### Quick summary

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | Dependency status |
| `POST` | `/api/auth/register` | – | Create an account |
| `POST` | `/api/auth/login` | – | Get a JWT |
| `POST` | `/api/auth/logout` | – | Clear the session cookie |
| `GET` | `/api/auth/me` | JWT | Current user |
| `GET` | `/api/users/profile` · `/api/users/me` | JWT | Read profile |
| `PUT` | `/api/users/profile` · `/api/users/me` | JWT | Update profile |
| `POST` | `/api/assistant/chat` · `/api/assistant/message` | optional | Ask the AI |
| `GET` | `/api/assistant/history` | JWT | Get conversation |
| `DELETE` | `/api/assistant/history` | JWT | Clear conversation |
| `GET` | `/api/assistant/meta` | optional | AI configuration + safety notes |
| `GET` | `/api/weather/current?city=` · `/api/weather` | optional | Current conditions |
| `GET` | `/api/weather/forecast?city=` | optional | 5-day forecast |
| `GET` | `/api/weather/bundle?city=` | optional | Current + forecast |
| `GET` | `/api/weather/status` | optional | Module configuration |
| `POST` | `/api/crops/recommend` | optional | Crop recommendation |
| `GET` | `/api/crops/options` | – | Crop catalogue + accepted values |
| `POST` | `/api/fertilizer/guidance` | optional | Fertilizer guidance |
| `GET` | `/api/fertilizer/options` | – | Nutrient reference |
| `GET` | `/api/schemes` | – | Search + filter + pagination |
| `GET` | `/api/schemes/meta` | – | Categories + verification policy |
| `GET` | `/api/schemes/:id` | – | Single scheme |

**Response envelope** — every endpoint returns the same shape:

```json
{ "success": true, "message": "…", "data": { }, "meta": { } }
```

```json
{ "success": false, "message": "…", "errors": [{ "field": "email", "message": "…" }] }
```

---

## 8. Database Setup

### `users` collection

| Field | Type | Notes |
| --- | --- | --- |
| `fullName` | String | required, 2–80 chars, aliased as `name` |
| `email` | String | required, unique, lowercased |
| `password` | String | bcrypt hash, `select: false`, never returned |
| `phone` | String | optional |
| `location` | String | used for weather |
| `state` / `district` | String | optional |
| `preferredLanguage` | Enum | English, Hindi, Marathi, Punjabi, Telugu, Other |
| `farmSize` | Number | ≥ 0 |
| `farmSizeUnit` | Enum | acre, hectare, bigha, guntha |
| `soilType` | Enum | Loamy, Clay, Sandy, Black, Alluvial, Red, Laterite, Other |
| `irrigationType` | Enum | Rainfed, Low, Medium, High, Drip, Sprinkler, Canal |
| `currentCrop` | String | optional |
| `season` | Enum | Kharif, Rabi, Zaid |
| `isActive` | Boolean | soft-disable support |
| `createdAt` / `updatedAt` | Date | automatic |

Indexes: `{ email: 1 } unique`, `{ state: 1, district: 1 }`.

### `chathistories` collection

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | ObjectId | unique — one conversation per farmer |
| `messages[].role` | Enum | `user`, `model`, `system` |
| `messages[].content` | String | ≤ 6000 chars |
| `messages[].timestamp` | Date | automatic |
| `messages[].model` | String | stored with AI replies |
| `messages[].tokens` | Number | provider-reported usage |
| `totalMessages` | Number | lifetime counter |
| `createdAt` / `updatedAt` | Date | automatic |

Indexes: `{ userId: 1 } unique`, `{ updatedAt: -1 }`.
The message array is capped at **100 turns** (`$slice: -100`) so the document can never approach
MongoDB's 16 MB limit.

---

## 9. Testing

```bash
npm test          # runs the whole suite
```

Current result in this repository:

```text
# tests   172
# pass    162
# fail      0
# skipped  10   <- tests that need MongoDB and/or a Gemini key
```

The 10 skips are **not** failures — they are the tests that cannot run without your own
credentials, and they print a `SKIP` line explaining why. See
[tests/README.md](tests/README.md) for the full breakdown.

Three guarantees are enforced by the suite:

1. **No dosage figures** — every text field across 5 crops × 5 soils × 4 stages is scanned
2. **A broken weather integration never blocks a crop recommendation**
3. **The `name` / `fullName` alias keeps working** for the existing React register form

| Test file | Covers |
| --- | --- |
| `config.test.js` | env validation, CORS allowlist, rate-limit config |
| `utils.test.js` | ApiError factories, asyncHandler, response envelope |
| `cropService.test.js` | scoring, ranking, explanations, validation |
| `cropWeather.test.js` | weather enrichment and the fail-soft guarantee |
| `fertilizerService.test.js` | stages, soils, **and a safety test asserting no dosage figures** |
| `schemes.test.js` | search, filter, pagination, verification labels |
| `geminiService.test.js` | system instruction safety rules, context builder, error mapping |
| `weatherService.test.js` | configuration reporting, error mapping |
| `api.test.js` | full HTTP surface via supertest |
| `auth.test.js` | bcrypt hashing, JWT sign/verify, tamper rejection (needs DB) |

Postman collection: **`postman/KhetiGPT.postman_collection.json`**
Manual test script: **[docs/POSTMAN_TESTING.md](docs/POSTMAN_TESTING.md)**

### Verification status (read this before a demo)

| Module | Verified in this repo | What still needs your keys |
| --- | --- | --- |
| Config, validation, error handling | ✅ Fully tested | – |
| Crop recommendation | ✅ Fully tested | – |
| Fertilizer guidance | ✅ Fully tested | – |
| Schemes search/filter | ✅ Fully tested | – |
| Password hashing, JWT sign/verify | ✅ Unit tested | Live Atlas round-trip |
| Register / login HTTP flow | ⚠️ Guarded, not run live | Needs a reachable MongoDB |
| AI assistant | ⚠️ Prompt + error handling tested | Needs `GEMINI_API_KEY` for a real answer |
| Weather | ⚠️ Config + error handling tested | Needs `OPENWEATHER_API_KEY` for real data |

---

## 10. Security

- **Passwords** — bcryptjs with a configurable cost factor, `select: false` so hashes never load by default.
- **JWT** — signed with a ≥ 32-char secret from the environment; tampered and expired tokens return 401.
- **Cookie** — `httpOnly`, `sameSite`, `secure` in production, so JavaScript cannot read the token.
- **Login** — one generic message for wrong email *and* wrong password, preventing user enumeration.
- **Field whitelist** — `pickProfileFields()` blocks mass assignment of `isActive`, `createdAt`, `password`.
- **Validation** — express-validator on every mutating endpoint, plus Mongoose schema validation.
- **Rate limiting** — 300 req/15 min globally, 20 req/15 min on auth, 30 req/15 min on the AI endpoint.
- **Headers** — helmet; `x-powered-by` disabled.
- **Body limits** — 1 MB JSON/urlencoded; malformed JSON returns a clean 400.
- **CORS** — explicit origin allowlist with credentials; wildcard is never used.
- **No secrets in errors** — stack traces, Mongo errors and third-party API messages are logged, never returned.
- **No secrets in the repo** — `.env` is git-ignored; `.env.example` contains placeholders only.

---

## 11. Connecting the Frontend

Complete step-by-step guide with copy-paste files:
**[docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md)**

Short version:

1. Create `.env` in the frontend project: `VITE_API_BASE_URL=http://localhost:5000/api`
2. Replace `src/services/api.js` with the axios instance shown in the guide (adds the Bearer token).
3. Replace the five files in `src/services/` with the versions provided in `docs/frontend-integration/`.
4. Update `AppContext.jsx` to call `authService.login()` / `register()` instead of the demo helpers.
5. Restart `npm run dev`.

---

## 12. Deployment

Guide: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**

```
Frontend  → Vercel / Netlify   (VITE_API_BASE_URL=https://your-api.onrender.com/api)
Backend   → Render             (Root Directory: KhetiGPT-Backend, Start: npm start)
Database  → MongoDB Atlas M0
AI        → Google AI Studio   (GEMINI_API_KEY)
Weather   → OpenWeather        (OPENWEATHER_API_KEY)
```

Critical production settings: `NODE_ENV=production`, `CORS_ORIGIN=https://your-frontend.vercel.app`
(**no trailing slash**), `JWT_SECRET` a fresh 64-char random value, and Render's Health Check Path
set to `/api/health`.

---

## 13. Important Honesty Notes

This is an academic project and the documentation is deliberately precise about limits:

1. The AI assistant is **not** a certified agricultural expert and says so in its own system instruction.
2. It **never** recommends a pesticide or chemical dosage. A dedicated test asserts this stays true.
3. It **never** gives fertilizer quantities in kg/acre — a soil test report is required for that.
4. It **never** fabricates government schemes. Each record in `data/schemes.js` carries a
   `verification` field, and `/api/schemes/meta` reports which records still need verification.
5. Crop recommendations are **indicative guidance** from an explainable rule engine. No yield or
   income is ever guaranteed. `POST /api/crops/recommend` returns a disclaimer with every response.
6. The `state-agri-subsidy` scheme record is an **illustrative placeholder** and says so explicitly.
   Replace it with your own state's real scheme before any real deployment.

---

## 14. Future Enhancements

- Token refresh + a server-side revocation blocklist for real logout invalidation
- Email verification and password reset flows
- Role-based admin panel for scheme curation
- Multilingual AI responses driven by `preferredLanguage`
- ML-based crop recommendation trained on a real dataset, replacing `scoreCrop()`
- Image upload for pest/disease identification
- Voice input for low-literacy users
- Redis-backed rate limiting for multi-instance deployments

---

## 15. Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start in production mode |
| `npm test` | Run the automated test suite |
| `npm run test:watch` | Re-run tests on file change |

---

© KhetiGPT · Academic Mini Project · B.Tech CSE
