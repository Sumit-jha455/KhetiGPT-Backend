/**
 * config/env.js
 * -----------------------------------------------------------------------------
 * Centralised, validated access to environment variables.
 *
 * WHY THIS FILE EXISTS:
 *   - It fails fast at startup if a required value is missing, instead of
 *     crashing later on the first request.
 *   - It gives every module one typed import instead of scattering
 *     process.env reads across the codebase.
 *   - It never logs or returns secret values.
 */

// Load the .env file from the project root into process.env (no-op in production hosts).
import "dotenv/config";

/**
 * Small helper that reads a string environment variable with an optional default.
 * @param {string} key        - name of the variable, e.g. "PORT"
 * @param {string} [fallback] - value used when the variable is missing or empty
 * @returns {string}
 */
const readString = (key, fallback = "") => {
  // Trim the raw value so accidental whitespace/newlines do not break comparisons.
  const value = (process.env[key] ?? "").trim();
  // Return the fallback when nothing meaningful was configured.
  return value.length > 0 ? value : fallback;
};

/**
 * Small helper that reads an integer environment variable with a default.
 * Used for PORT, rate-limit windows and bcrypt cost.
 */
const readInt = (key, fallback) => {
  // Parse base-10 and discard anything invalid.
  const parsed = Number.parseInt(process.env[key] ?? "", 10);
  // NaN means the variable was missing or not numeric -> use the default.
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Reads a comma separated list (used for the CORS allowlist) into an array.
 * Empty entries are removed so "a,,b" becomes ["a","b"].
 */
const readList = (key, fallback = []) => {
  // Read the raw string first.
  const raw = readString(key);
  // When nothing is configured, fall back to the provided default list.
  if (!raw) return fallback;
  // Split on commas, trim whitespace and drop empty values.
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

/**
 * Builds the CORS origin allowlist.
 * In development we always allow the common Vite ports so the project works
 * out of the box for a student running `npm run dev` on both sides.
 */
const buildCorsOrigins = () => {
  // Origins explicitly configured through the environment.
  const configured = readList("CORS_ORIGIN");
  // Development convenience origins.
  const devDefaults = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
  ];
  // Merge, de-duplicate and remove trailing slashes for safe comparison.
  return Array.from(new Set([...configured, ...(isProduction ? [] : devDefaults)])).map((origin) =>
    origin.replace(/\/$/, "")
  );
};

/** True when the server runs in production mode. */
export const isProduction = readString("NODE_ENV", "development") === "production";

/** Port used by the HTTP server. Cloud hosts inject PORT, so it must not be hardcoded. */
export const PORT = readInt("PORT", 5000);

/** Public base URL of this API (informational only). */
export const API_BASE_URL = readString("API_BASE_URL", `http://localhost:${PORT}`);

/** Allowed CORS origins as an array of exact strings. */
export const CORS_ORIGINS = buildCorsOrigins();

/** MongoDB connection string (required for every database backed feature). */
export const MONGODB_URI = readString("MONGODB_URI");

/** Default database name used when the URI has no database segment. */
export const MONGODB_DB_NAME = readString("MONGODB_DB_NAME", "khetigpt");

/** Secret used to sign and verify JWTs. REQUIRED - the app refuses to start without it. */
export const JWT_SECRET = readString("JWT_SECRET");

/** JWT lifetime, e.g. "1d". */
export const JWT_EXPIRES_IN = readString("JWT_EXPIRES_IN", "1d");

/** Cookie lifetime in milliseconds, kept in sync with JWT_EXPIRES_IN (default 1 day). */
export const JWT_COOKIE_MAX_AGE = readInt("JWT_COOKIE_MAX_AGE_MS", 24 * 60 * 60 * 1000);

/** Bcrypt hashing cost factor. */
export const BCRYPT_SALT_ROUNDS = readInt("BCRYPT_SALT_ROUNDS", 10);

/** Google Gemini API key. Optional: the assistant degrades to a clear "not configured" error. */
export const GEMINI_API_KEY = readString("GEMINI_API_KEY");

/** Gemini model identifier. Must be a currently supported model. */
export const GEMINI_MODEL = readString("GEMINI_MODEL", "gemini-3.8-flash");

// Groq API configuration.
export const GROQ_API_KEY = readString("GROQ_API_KEY");
export const GROQ_MODEL = readString("GROQ_MODEL", "openai/gpt-oss-20b");

/** OpenWeather API key. Optional: the weather module returns 503 when missing. */
export const OPENWEATHER_API_KEY = readString("OPENWEATHER_API_KEY");

/** OpenWeather API base URL (kept configurable so a plan change does not need a code edit). */
export const OPENWEATHER_BASE_URL = readString("OPENWEATHER_BASE_URL", "https://api.openweathermap.org");

/** General API rate limit window in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = readInt("RATE_LIMIT_WINDOW_MINUTES", 15) * 60 * 1000;

/** Maximum requests per IP inside the general rate limit window. */
export const RATE_LIMIT_MAX = readInt("RATE_LIMIT_MAX_REQUESTS", 300);

/** AI rate limit window in milliseconds (AI calls cost credits, so they are stricter). */
export const AI_RATE_LIMIT_WINDOW_MS = readInt("AI_RATE_LIMIT_WINDOW_MINUTES", 15) * 60 * 1000;

/** Maximum AI requests per IP inside the AI window. */
export const AI_RATE_LIMIT_MAX = readInt("AI_RATE_LIMIT_MAX_REQUESTS", 30);

/**
 * Collected configuration object passed to db.connect().
 * Keeping it in one object makes the startup log readable without leaking secrets.
 */
export const config = {
  isProduction,
  PORT,
  API_BASE_URL,
  CORS_ORIGINS,
  MONGODB_URI,
  MONGODB_DB_NAME,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_COOKIE_MAX_AGE,
  BCRYPT_SALT_ROUNDS,
  GEMINI_API_KEY,
  GEMINI_MODEL,
  OPENWEATHER_API_KEY,
  OPENWEATHER_BASE_URL,
  GROQ_API_KEY,
  GROQ_MODEL,
};

/**
 * Validates the configuration at startup and returns a list of human readable problems.
 * Soft requirements (Gemini, OpenWeather) are reported separately because the API
 * is still useful - and still demonstrable - without them.
 *
 * @returns {{ fatal: string[], warnings: string[] }}
 */
export const validateConfig = () => {
  // Problems that stop the server from starting.
  const fatal = [];
  // Problems that only disable a single feature.
  const warnings = [];

  // A JWT secret is mandatory: without it no token can be signed securely.
  if (!JWT_SECRET) fatal.push("JWT_SECRET is missing. Add it to your .env file.");
  // A short secret is brute-forceable, so reject obviously weak values.
  else if (JWT_SECRET.length < 32)
    fatal.push("JWT_SECRET must be at least 32 characters long for basic security.");

  // NOTE: a missing MONGODB_URI is a WARNING, not a fatal error. This is
  // deliberate and matches the degraded-mode design: the API boots, serves
  // /api/health, /api/schemes, /api/crops/* and /api/fertilizer/*, and the
  // database-backed routes return an honest 503. Only the JWT secret is fatal,
  // because nothing can be secured without it.
  if (!MONGODB_URI)
    warnings.push(
      "MONGODB_URI is missing. The server will start in DEGRADED mode: auth, profile and chat history return 503."
    );

    
  // Warn instead of failing when the AI key is absent.
  if (!GROQ_API_KEY) {
  warnings.push("GROQ_API_KEY is missing - AI assistant will be unavailable.");
}
  // Warn instead of failing when the weather key is absent.
  if (!OPENWEATHER_API_KEY)
    warnings.push("OPENWEATHER_API_KEY is missing - /api/weather/* will return 503.");

  // Give the student a strong hint if a placeholder survived a copy-paste.
  if (/replace_with|<db_username>|<password>/.test(MONGODB_URI))
    warnings.push("MONGODB_URI still contains a placeholder from .env.example.");

  // Return both lists so server.js can print them clearly.
  return { fatal, warnings };
};
