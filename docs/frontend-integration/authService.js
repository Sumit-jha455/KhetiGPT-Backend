/**
 * authService.js — READY TO PASTE into the React frontend at src/services/authService.js
 * -----------------------------------------------------------------------------
 * Replaces the demo (localStorage-only) authentication with real API calls.
 */

// Shared axios instance (see FRONTEND_INTEGRATION.md step 2).
import api, { setToken, getToken } from "./api";

/** Registers a new farmer account. Accepts the frontend's existing field names. */
export async function register(payload) {
  // POST /api/auth/register
  const { data } = await api.post("/auth/register", {
    // `name` is accepted by the backend as an alias for fullName.
    name: payload.name,
    // Email address.
    email: payload.email,
    // Plain password (sent over HTTPS only; never stored client-side).
    password: payload.password,
    // Optional confirmation, validated server-side.
    confirmPassword: payload.confirmPassword,
    // Free text location.
    location: payload.location,
    // `language` is accepted as an alias for preferredLanguage.
    language: payload.language,
    // Optional farm fields, if your register form collects them.
    ...(payload.farmSize !== undefined ? { farmSize: payload.farmSize } : {}),
    ...(payload.soilType ? { soilType: payload.soilType } : {}),
    ...(payload.waterAvailability ? { waterAvailability: payload.waterAvailability } : {}),
  });

  // Store the JWT so the interceptor attaches it to future requests.
  if (data.data?.token) setToken(data.data.token);

  // Return { user, token } to the caller.
  return data.data;
}

/** Logs an existing farmer in. */
export async function login(email, password) {
  // POST /api/auth/login
  const { data } = await api.post("/auth/login", { email, password });

  // Store the JWT.
  if (data.data?.token) setToken(data.data.token);

  // Return { user, token }.
  return data.data;
}

/** Returns the currently authenticated farmer, or null when not logged in. */
export async function getMe() {
  // No token means there is nothing to fetch.
  if (!getToken()) return null;

  try {
    // GET /api/auth/me
    const { data } = await api.get("/auth/me");
    // Return the safe user object.
    return data.data.user;
  } catch {
    // An expired token should not crash the app on load.
    setToken(null);
    // Report "not logged in".
    return null;
  }
}

/** Updates the farmer's profile. Send only the fields you want to change. */
export async function updateProfile(patch) {
  // PUT /api/users/profile
  const { data } = await api.put("/users/profile", patch);
  // Return the updated user object.
  return data.data.user;
}

/** Reads the farmer's profile and farm information. */
export async function getProfile() {
  // GET /api/users/profile
  const { data } = await api.get("/users/profile");
  // Return the user object.
  return data.data.user;
}

/** Logs out on the server (clears the httpOnly cookie) and locally. */
export async function logout() {
  try {
    // POST /api/auth/logout
    await api.post("/auth/logout");
  } finally {
    // Always clear the local token, even if the request failed.
    setToken(null);
  }
}

/** Extracts one readable sentence from an API error. */
export const getErrorMessage = (error) => error?.message || "Something went wrong. Please try again.";

/** Extracts a { field: message } map for inline form errors. */
export const getFieldErrors = (error) => {
  // Start with an empty map.
  const map = {};
  // Populate it from the API's errors array when present.
  for (const item of error?.errors ?? []) {
    // Only set the first message per field.
    if (item?.field && !map[item.field]) map[item.field] = item.message;
  }
  // Return the map.
  return map;
};

// Default export for convenient importing.
export default { register, login, getMe, getProfile, updateProfile, logout, getErrorMessage, getFieldErrors };
