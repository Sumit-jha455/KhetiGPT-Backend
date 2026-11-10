# Deployment Guide

Target architecture:

```
  Browser
    │
    ▼
Frontend  ───  Vercel / Netlify          (static React build)
    │            VITE_API_BASE_URL
    ▼
Backend   ───  Render                    (Node.js web service)
    │            /api/*
    ├──────────▶ MongoDB Atlas          (M0 free tier)
    ├──────────▶ Google Gemini API      (GEMINI_API_KEY)
    └──────────▶ OpenWeather API        (OPENWEATHER_API_KEY)
```

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access** → *Add New Database User*
   - Authentication: **Password**
   - Username: `khetigpt_app`
   - Password: generate one and store it safely
   - Role: **Read and write to any database**
3. **Network Access** → *Add IP Address*
   - For a class demo: `0.0.0.0/0` (allow anywhere — simplest, acceptable for an academic project)
   - For better security: add Render's outbound IPs (available on Render's paid plans)
4. **Connect → Drivers → Node.js** → copy the connection string.

```
mongodb+srv://khetigpt_app:<password>@cluster0.xxxxx.mongodb.net/khetigpt?retryWrites=true&w=majority
```

Replace `<password>` and keep `khetigpt` before the `?`.

> Atlas connection strings contain special characters badly. If your password has `@`, `:`, `/`,
> URL-encode it, or reset it to a long alphanumeric password.

---

## 2. Deploy the backend to Render

### Prepare the repository

The backend must be at the **root** of the repo it is deployed from (Render's Root Directory setting
also works if it stays in a subfolder).

Confirm `package.json` has:

```json
{
  "scripts": {
    "start": "node src/server.js",
    "build": "echo 'no build step required'"
  },
  "engines": { "node": ">=18.17.0" }
}
```

### Create the service

1. Render dashboard → **New** → **Web Service**
2. Connect your `KhetiGPT-Backend` GitHub repository
3. Configure:

| Setting | Value |
| --- | --- |
| **Name** | `khetigpt-backend` |
| **Root Directory** | *(blank if the repo root is the backend, otherwise `KhetiGPT-Backend`)* |
| **Runtime** | Node |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Instance Type** | Free |
| **Health Check Path** | `/api/health` ← **important** |

### Environment variables

Add these in Render → **Environment**:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | *(Render sets this automatically — do not override)* |
| `MONGODB_URI` | `mongodb+srv://…` (from step 1) |
| `MONGODB_DB_NAME` | `khetigpt` |
| `JWT_SECRET` | a fresh 64-char random string |
| `JWT_EXPIRES_IN` | `1d` |
| `BCRYPT_SALT_ROUNDS` | `12` |
| `CORS_ORIGIN` | `https://your-frontend.vercel.app` |
| `GEMINI_API_KEY` | your Gemini key |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `OPENWEATHER_API_KEY` | your OpenWeather key |

Generate a production JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### CORS — the most common deployment failure

`CORS_ORIGIN` must match your frontend origin **exactly**:

- ✅ `https://khetigpt-frontend.vercel.app`
- ❌ `https://khetigpt-frontend.vercel.app/` ← trailing slash breaks the comparison
- ❌ `http://localhost:5173` ← this will not work in production

Multiple origins are allowed, comma-separated with no spaces:

```
CORS_ORIGIN=https://khetigpt-frontend.vercel.app,https://khetigpt.netlify.app
```

### Verify

```bash
curl https://khetigpt-backend.onrender.com/api/health
```

Expect `"status": "ok"` and `"database": { "status": "connected" }`.

> **Render free tier note:** the service sleeps after ~15 minutes idle, so the first request after a
> pause can take 30–60 seconds. This is normal and worth mentioning in your demo.

---

## 3. Deploy the frontend to Vercel

1. Vercel → **Add New** → **Project** → import the frontend repository
2. **Framework Preset:** Vite
3. **Root Directory:** the folder containing the frontend `package.json`
4. **Build Command:** `npm run build` · **Output Directory:** `dist`
5. **Environment Variables:**

| Key | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://khetigpt-backend.onrender.com/api` |

6. **Deploy**, then copy the resulting URL (e.g. `https://khetigpt-frontend.vercel.app`)
7. Go back to Render and set `CORS_ORIGIN` to that exact URL
8. Redeploy the backend so the new CORS value takes effect

### Vercel SPA routing

Vercel handles SPA rewrites automatically for Vite projects. If a deep link such as `/dashboard`
returns 404 after a refresh, add `vercel.json` to the **frontend**:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }
```

> Your frontend currently uses `HashRouter`, so this is not required — hash routes always resolve to
> `/index.html`.

### Netlify alternative

**Build command:** `npm run build` · **Publish directory:** `dist`
Environment: `VITE_API_BASE_URL=https://khetigpt-backend.onrender.com/api`
Create `netlify.toml` in the frontend root:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 4. API keys

### Google Gemini

1. Go to https://aistudio.google.com/apikey
2. **Create API key**
3. Copy it into `GEMINI_API_KEY`

This is an **AI Studio** key, not a Google Cloud service-account key — `@google/genai` in API-key
mode expects exactly this kind of key.

**Free tier limits** are per minute and per day. With `AI_RATE_LIMIT_MAX_REQUESTS=30` per 15 minutes
per IP, a single demonstrator is well inside the limit.

### OpenWeather

1. Sign up at https://home.openweathermap.org/api_keys
2. Copy the **default** key into `OPENWEATHER_API_KEY`
3. **New keys take up to 2 hours to activate.** Until then `/api/weather/*` returns 401 → the backend
   surfaces this as a 503 with an explanatory message.
4. This project uses `/data/2.5/weather` and `/data/2.5/forecast`, both available on the **free** plan.
   The One Call 3.0 endpoints are **not** used because they require a subscription.

---

## 5. Production checklist

### Security

- [ ] `NODE_ENV=production` — hides stack traces and debug fields
- [ ] `JWT_SECRET` is a **new** 64-char random value (never reuse your dev secret)
- [ ] `CORS_ORIGIN` lists only your real frontend origin, no trailing slash
- [ ] `.env` is **not** committed (verify with `git status`)
- [ ] No API key appears anywhere in the source code
- [ ] The auth cookie is `Secure` and `HttpOnly` (check DevTools → Application → Cookies)

### Functionality

- [ ] `GET /api/health` → `"status": "ok"`
- [ ] Register → login → `GET /api/users/profile` works over HTTPS
- [ ] Assistant returns a real answer (`data.model` is set)
- [ ] Assistant history survives a page refresh
- [ ] Weather returns real data (`provider: "OpenWeather"`)
- [ ] Crop recommendation and fertilizer guidance work
- [ ] Schemes search and filter work
- [ ] Logout clears the cookie

### CORS verification

```bash
curl -s -D - -o /dev/null \
  https://khetigpt-backend.onrender.com/api/schemes \
  -H "Origin: https://khetigpt-frontend.vercel.app" | grep -i access-control
```

Expect:
```
access-control-allow-origin: https://khetigpt-frontend.vercel.app
access-control-allow-credentials: true
```

If you see `null` or no header at all, `CORS_ORIGIN` does not match exactly.

### HTTPS

Render and Vercel both provision TLS automatically. Confirm the lock icon is present. The auth
cookie is sent with `secure: true` in production, so it **will not work over plain HTTP**.

---

## 6. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `FATAL: JWT_SECRET is missing` | Env var not set | Add it in Render → Environment, then redeploy |
| `503` on every auth route | MongoDB unreachable | Check `MONGODB_URI`, and add your IP in Atlas **Network Access** |
| `bad auth` in the Render log | Wrong DB password | Reset the password in Atlas and update `MONGODB_URI` |
| CORS error in the browser console | Origin mismatch | Match `CORS_ORIGIN` exactly, no trailing slash |
| `401` immediately after login | Token not stored, or clock skew | Verify `localStorage` has the token; check the system clock |
| Assistant returns `503` | `GEMINI_API_KEY` missing or invalid | Check Render → Environment |
| Assistant returns `429` | Free-tier quota or the AI rate limit | Wait, or raise `AI_RATE_LIMIT_MAX_REQUESTS` |
| Weather returns `503` | Key missing, or still activating | New OpenWeather keys take up to 2 hours |
| Weather returns `401` | Invalid key | Regenerate the key |
| First request is very slow | Render free tier cold start | Expected; warm the service with a health ping |
| Render restarts repeatedly | Health check failing | Set **Health Check Path** to `/api/health` |
| `MODULE_NOT_FOUND` on deploy | Wrong Root Directory | Set it to the folder containing `package.json` |

---

## 7. Cost

| Service | Tier | Cost |
| --- | --- | --- |
| Render Web Service | Free | ₹0 |
| MongoDB Atlas | M0 | ₹0 |
| Vercel / Netlify | Hobby | ₹0 |
| Google Gemini | Free tier | ₹0 |
| OpenWeather | Free plan | ₹0 |

**Total for an academic demo: ₹0.**

Limitations of the free tiers worth stating in your report: Render sleeps when idle, Atlas M0 has a
512 MB storage cap, and both the Gemini and OpenWeather free tiers are rate limited.
