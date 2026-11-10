# Frontend Integration Guide

This guide connects the **existing** KhetiGPT React frontend to this backend.

> I have **not** modified your frontend. Everything below is what you need to change, and
> ready-to-paste replacement files already exist in `docs/frontend-integration/`.

---

## 1. What I found in your frontend

| File | Current state | What the backend expects |
| --- | --- | --- |
| `src/services/api.js` | Axios instance ready, `baseURL = VITE_API_BASE_URL \|\| http://localhost:5000/api` | ✅ Works as-is, but needs a request interceptor to attach the JWT |
| `src/context/AppContext.jsx` | Demo only — `loginDemo()` sets a boolean in `localStorage`, no HTTP call | Needs `login()` / `register()` that call the API and store the token |
| `src/pages/Login.jsx` | Validates then calls `loginDemo({ email })` | Needs to call `POST /api/auth/login` |
| `src/pages/Register.jsx` | Sends `name, email, password, location, language` | ✅ Backend accepts these exact names (`name` and `language` are supported aliases) |
| `src/services/assistantService.js` | `sendAssistantMessage()` → local keyword rules | Needs `POST /api/assistant/chat` |
| `src/services/weatherService.js` | Static `CURRENT_WEATHER` / `WEATHER_FORECAST` | Needs `GET /api/weather/bundle` |
| `src/services/cropService.js` | Local `recommendCrop()` scoring | Needs `POST /api/crops/recommend` |
| `src/services/schemesService.js` | Static `SCHEMES` array | Needs `GET /api/schemes` |
| `src/data/mockWeather.js` | Field names `temperature, feelsLike, condition, humidity, windSpeed, rainProbability` | ✅ Backend returns **identical field names** — the page needs no JSX change |
| `src/data/mockCrops.js` | Field names `crop, category, duration, waterNeed, reason, considerations, alternatives` | ✅ Backend returns the same names plus `suitabilityScore`, `matchedFactors`, `cultivation` |
| `src/data/mockSchemes.js` | Field names `id, title, category, authority, summary, benefits, eligibility, applyMode` | ✅ Backend returns the same names plus `documents`, `officialWebsite`, `verification` |

### Two things you must know before writing any code

**A. The response is wrapped in an envelope.**
Every endpoint returns `{ success, message, data }`, so read `response.data.data`, not `response.data`.

```js
const res  = await api.post("/crops/recommend", payload);
const crop = res.data.data.recommendation;   // ✅
// res.data.data.crop  ❌ undefined
```

**B. Your `ENDPOINTS` map has three names the canonical spec uses differently.**
Rather than force you to change the frontend, the backend **mounts aliases** for all of them:

| Your `ENDPOINTS` value | Canonical endpoint | Alias mounted |
| --- | --- | --- |
| `/users/me` | `/api/users/profile` | ✅ `GET/PUT /api/users/me` |
| `/assistant/message` | `/api/assistant/chat` | ✅ `POST /api/assistant/message` |
| `/weather` | `/api/weather/current` | ✅ `GET /api/weather` |

---

## 2. Step-by-step integration

### Step 1 — Frontend environment file

Create `.env` in the **frontend** project root:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

For production:

```env
VITE_API_BASE_URL=https://khetigpt-backend.onrender.com/api
```

> Vite only exposes variables prefixed with `VITE_`. Restart `npm run dev` after changing `.env`.

### Step 2 — `src/services/api.js` (adds the auth token)

```js
import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const TOKEN_KEY = "khetigpt.token";

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};

export const setToken = (token) => {
  try {
    token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
};

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,                       // the AI call can take several seconds
  headers: { "Content-Type": "application/json" },
  withCredentials: true,                // sends the httpOnly session cookie
});

// Attach the JWT to every request automatically.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Turn Axios errors into one predictable shape for the UI.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const payload = error.response?.data;

    const apiError = {
      status: status ?? 0,
      message:
        payload?.message ||
        (status === 0 ? "Cannot reach the server. Is the backend running?" : "Something went wrong."),
      errors: payload?.errors ?? [],
      success: false,
    };

    // A 401 means the session is no longer valid — clear it.
    if (status === 401 && getToken()) {
      setToken(null);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("khetigpt:unauthorised"));
    }

    return Promise.reject(apiError);
  }
);

export const ENDPOINTS = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",
  PROFILE: "/users/profile",
  PROFILE_ALIAS: "/users/me",
  ASSISTANT_CHAT: "/assistant/chat",
  ASSISTANT_HISTORY: "/assistant/history",
  ASSISTANT_META: "/assistant/meta",
  WEATHER_BUNDLE: "/weather/bundle",
  WEATHER_STATUS: "/weather/status",
  CROP_RECOMMENDATION: "/crops/recommend",
  CROP_OPTIONS: "/crops/options",
  FERTILIZER: "/fertilizer/guidance",
  FERTILIZER_OPTIONS: "/fertilizer/options",
  SCHEMES: "/schemes",
};

export default api;
```

### Step 3 — Replace the five service files

Full ready-to-paste versions are in **`docs/frontend-integration/`**:

| Copy to | File provided |
| --- | --- |
| `src/services/authService.js` | `authService.js` |
| `src/services/assistantService.js` | `assistantService.js` |
| `src/services/weatherService.js` | `weatherService.js` |
| `src/services/cropService.js` | `cropService.js` |
| `src/services/schemesService.js` | `schemesService.js` |

### Step 4 — Wire authentication into `AppContext.jsx`

The key change is that `login`/`register` become async and call the API:

```js
const login = async (email, password) => {
  const { data } = await authService.login(email, password);
  setToken(data.token);                       // store the JWT
  setUser(data.user);                         // { name, email, location, language, ... }
  setFarm({
    farmSize: data.user.farmSize ?? "",
    farmUnit: data.user.farmSizeUnit ?? "acres",
    soilType: data.user.soilType ?? "Loamy",
    currentCrop: data.user.currentCrop ?? "",
    waterAvailability: data.user.waterAvailability ?? "Medium",
    season: data.user.season ?? "Rabi",
  });
  setIsAuthenticated(true);
  return data.user;
};

const logout = async () => {
  try { await authService.logout(); } catch { /* ignore */ }
  setToken(null);
  setIsAuthenticated(false);
  setUser(DEMO_USER);
  setFarm(DEMO_FARM);
};
```

`Register.jsx` then becomes:

```js
await register({
  name: form.name,
  email: form.email,
  password: form.password,
  location: form.location,
  language: form.language,
});
navigate("/dashboard");
```

> Keep your client-side validation. It gives instant feedback and saves a network round trip.

### Step 5 — Restart and verify

```bash
# terminal 1
cd KhetiGPT-Backend && npm run dev

# terminal 2
cd KhetiGPT_MINI_PROJECT/Project_Development/client && npm run dev
```

Open `http://localhost:5173`, register, and you should land on the dashboard with your real profile.

---

## 3. Field mapping reference

### Register payload

| Frontend sends | Backend accepts | Stored as |
| --- | --- | --- |
| `name` | ✅ | `fullName` |
| `fullName` | ✅ | `fullName` |
| `email` | ✅ | `email` |
| `password` | ✅ | bcrypt hash |
| `location` | ✅ | `location` |
| `language` | ✅ | `preferredLanguage` |
| `preferredLanguage` | ✅ | `preferredLanguage` |
| `farmSize` | ✅ | `farmSize` |
| `soilType` | ✅ | `soilType` |
| `waterAvailability` | ✅ | `irrigationType` |
| `season` | ✅ | `season` |

### Profile response (`GET /api/users/profile`)

The backend returns **both** naming conventions, so your existing JSX keeps working:

```json
{
  "id": "6789…",
  "fullName": "Aarav Patil",  "name": "Aarav Patil",
  "email": "aarav@example.com",
  "location": "Nashik, Maharashtra",
  "preferredLanguage": "English", "language": "English",
  "farmSize": 2.5, "farmSizeUnit": "acre",
  "soilType": "Loamy",
  "irrigationType": "Medium", "waterAvailability": "Medium",
  "currentCrop": "Tomato", "season": "Rabi",
  "createdAt": "…", "updatedAt": "…"
}
```

### Weather — **no page changes needed**

| Your page reads | Backend returns |
| --- | --- |
| `temperature` | `weather.temperature` (28) |
| `condition` | `weather.condition` ("Clouds") |
| `description` | `weather.description` ("few clouds") |
| `feelsLike` | `weather.feelsLike` |
| `humidity` | `weather.humidity` |
| `windSpeed` | `weather.windSpeed` (**already km/h**) |
| `rainProbability` | `weather.rainProbability` |
| `sunrise` / `sunset` | `weather.sunrise` / `weather.sunset` |
| `icon` | `weather.icon` — same keys as your `ICON_MAP`: `sun`, `cloud-sun`, `cloud`, `cloud-rain`, `cloud-lightning` |
| forecast `date, condition, icon, high, low, rain, humidity, wind` | ✅ identical |

Call `GET /api/weather/bundle?city=Nashik` once — it returns both blocks in a single request.

---

## 4. Error handling in the UI

```js
import { getErrorMessage, getFieldErrors } from "../services/authService";

try {
  await register(payload);
} catch (error) {
  setFormError(getErrorMessage(error));        // one sentence for a toast
  setErrors(getFieldErrors(error));            // { email: "…", password: "…" }
}
```

| Status | Meaning | UI suggestion |
| --- | --- | --- |
| 400 | Validation failed | Show `errors[field]` under each input |
| 401 | Wrong email/password, or expired session | "Invalid email or password." |
| 403 | Account deactivated | Show the message as-is |
| 404 | Unknown route / location | Show the message |
| 409 | Email already registered | Highlight the email field |
| 429 | Rate limited | "Please wait a few minutes and try again." |
| 503 | Mongo down, or Gemini/Weather key missing | Show the message — it explains exactly which env var is needed |
| 0 | Backend not running | "Cannot reach the server." |

---

## 5. Removing the "Demo AI Mode" badge

`GET /api/assistant/meta` returns `aiConfigured`. Use it to drive the badge:

```js
const { data } = await api.get("/assistant/meta");
const live = data.data.aiConfigured;           // true when GEMINI_API_KEY is set
```

The endpoint also returns `topics` and `safetyNotes`, so your "How this demo works" card can render
the assistant's real limits from the API instead of hardcoded text.

---

## 6. What I deliberately did NOT change

- ❌ No frontend file was modified.
- ❌ No route, component or design was altered.
- ❌ No mock data file was deleted — you can keep them as an offline fallback.
- ❌ No `.gitignore` or Git configuration was touched.

The backend is a **separate repository** and is fully backwards-compatible with your existing
endpoint names, request field names and response field names.
