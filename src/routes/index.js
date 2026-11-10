/**
 * routes/index.js
 * -----------------------------------------------------------------------------
 * Route registry. Mounts every module router under its API prefix.
 * Keeping the mounting in one file makes the full URL surface readable at a glance.
 */

import { Router } from "express";
// Module routers.
import authRoutes from "./authRoutes.js";
import userRoutes from "./userRoutes.js";
import assistantRoutes from "./assistantRoutes.js";
import weatherRoutes from "./weatherRoutes.js";
import cropRoutes from "./cropRoutes.js";
import fertilizerRoutes from "./fertilizerRoutes.js";
import schemeRoutes from "./schemeRoutes.js";
// Health router (defined inline below because it has a single endpoint).
import { getConnectionState } from "../config/db.js";
import { isGroqConfigured } from "../services/groqService.js";
import { isWeatherConfigured } from "../services/weatherService.js";
import { ok } from "../utils/response.js";

/** API prefix shared by every route. */
export const API_PREFIX = "/api";

// Health router: reports real dependency status, not a hardcoded "ok".
const healthRouter = Router();

/**
 * GET /api/health
 * Public endpoint used by uptime monitors, Render health checks and the frontend.
 * It reports the REAL state of each dependency so a degraded system is obvious.
 */
healthRouter.get("/health", (_req, res) => {
  // Read the live database state.
  const database = getConnectionState();
  // A healthy API needs the database connected.
  const status = database === "connected" ? "ok" : "degraded";

  // Always answer 200 so the hosting platform does not restart-loop while
  // Atlas is unreachable; the body tells the real story.
  return ok(res, `KhetiGPT API is ${status}.`, {
    // Overall status label.
    status,
    // Project and version information.
    service: "KhetiGPT Backend",
    version: "1.0.0",
    // Uptime in seconds.
    uptimeSeconds: Math.round(process.uptime()),
    // Current server timestamp.
    timestamp: new Date().toISOString(),
    // Node runtime version, useful when debugging a deployment.
    nodeVersion: process.version,
    // Environment name.
    environment: process.env.NODE_ENV ?? "development",
    // Dependency status for each optional/required integration.
    dependencies: {
      // MongoDB is required for auth, profile and chat history.
      database: {
        // Connection state string from Mongoose.
        status: database,
        // Whether this dependency is required for a fully working system.
        required: true,
      },
      // Gemini powers the AI assistant.
     // Groq powers the AI assistant.
     groq: {
      status: isGroqConfigured() ? "configured" : "not-configured",
      model: isGroqConfigured()
        ? process.env.GROQ_MODEL || "openai/gpt-oss-20b"
        : null,
      required: false,
    },
      // OpenWeather powers the weather module.
      openweather: {
        status: isWeatherConfigured() ? "configured" : "not-configured",
        required: false,
      },
    },
  });
});

/** Create the API router and mount every module. */
const apiRouter = Router();

// Health first, so it is matched before any rate limiting or auth.
apiRouter.use(healthRouter);

// Authentication: register, login, logout, me.
apiRouter.use("/auth", authRoutes);
// Farmer profile: read and update.
apiRouter.use("/users", userRoutes);
// AI assistant: chat, history, meta.
apiRouter.use("/assistant", assistantRoutes);
// Weather: current, forecast, bundle, status.
apiRouter.use("/weather", weatherRoutes);
// Crop recommendation: recommend, options.
apiRouter.use("/crops", cropRoutes);
// Fertilizer guidance: guidance, options.
apiRouter.use("/fertilizer", fertilizerRoutes);
// Government schemes: list, detail, meta.
apiRouter.use("/schemes", schemeRoutes);

// Export the mounted router and the prefix.
export default apiRouter;
