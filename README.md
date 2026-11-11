# KhetiGPT Backend

Node.js/Express REST API for KhetiGPT. The backend owns authentication,
profile data, provider credentials, business rules, and safe response shaping.

## Tech stack

- Node.js 18.17+
- Express
- MongoDB Atlas with Mongoose
- JWT, bcryptjs, HTTP-only cookies
- Groq SDK for the assistant
- Axios/OpenWeather integration
- express-validator, Helmet, CORS, rate limiting
- Node built-in test runner and Supertest

## Installation and execution

```bash
npm install
npm run dev
npm start
npm test
```

Create a local `.env` from `.env.example` and provide values locally. Never
commit or expose those values.

## Environment variable names

- `NODE_ENV`
- `PORT`
- `API_BASE_URL`
- `CORS_ORIGIN`
- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `BCRYPT_SALT_ROUNDS`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `OPENWEATHER_API_KEY`
- `OPENWEATHER_BASE_URL`
- `RATE_LIMIT_WINDOW_MINUTES`
- `RATE_LIMIT_MAX_REQUESTS`
- `AI_RATE_LIMIT_WINDOW_MINUTES`
- `AI_RATE_LIMIT_MAX_REQUESTS`

The browser never receives provider credentials.

## API routes

All routes are mounted under `/api` and successful responses use:

```json
{ "success": true, "message": "...", "data": {}, "meta": {} }
```

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | None | Dependency status |
| POST | `/auth/register` | Public | Register and receive a session |
| POST | `/auth/login` | Public | Log in |
| POST | `/auth/logout` | Public | Clear session cookie |
| GET | `/auth/me` | JWT | Current authenticated user |
| GET/PUT | `/users/profile`, `/users/me` | JWT | Read/update profile |
| POST | `/assistant/chat`, `/assistant/message` | Optional | Groq assistant message |
| GET | `/assistant/history` | JWT | Persisted chat history |
| DELETE | `/assistant/history` | JWT | Clear chat history |
| GET | `/assistant/meta` | Optional | Assistant metadata |
| GET | `/weather/current`, `/weather` | Optional | Current weather |
| GET | `/weather/forecast` | Optional | Forecast |
| GET | `/weather/bundle` | Optional | Current weather plus forecast |
| GET | `/weather/status` | Optional | Weather configuration status |
| POST | `/crops/recommend` | Optional | Crop recommendation |
| GET | `/crops/options`, `/crops/crops` | Public | Crop options |
| POST | `/fertilizer/guidance` | Optional | Fertilizer guidance |
| GET | `/fertilizer/options` | Public | Fertilizer options/reference |
| GET | `/schemes` | Public | Search/filter/paginated schemes |
| GET | `/schemes/meta` | Public | Categories and verification policy |
| GET | `/schemes/:id` | Public | Scheme details |

Query parameters for `/schemes` are `search`, `category`, `page`, and `limit`.
`category` is validated against the metadata categories; `page` is 1–1000 and
`limit` is 1–100.

## Authentication

Registration and login return a JWT and set the HTTP-only session cookie.
Clients may send `Authorization: Bearer <token>`; the frontend also sends
credentials for cookie authentication. Protected routes reject invalid or
expired sessions with the standard error envelope. Profile updates are
whitelisted and never accept password hashes or protected account fields.

## Database

MongoDB stores users and chat histories. Database-backed routes require an
available connection; public rule/reference modules can operate without one.
The `User` model stores identity, location, farm size, soil, irrigation,
current crop, season, and preferred language. `ChatHistory` stores the
authenticated user's conversation.

## Testing

```bash
npm test
```

Tests cover validation, response envelopes, authentication helpers, crop and
fertilizer rules, weather error handling, scheme filtering, and the HTTP API.
Tests requiring external MongoDB or provider credentials may be skipped when
those services are unavailable; skipped tests are not failures.
