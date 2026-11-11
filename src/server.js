/**
 * server.js
 * -----------------------------------------------------------------------------
 * Process entry point.
 *
 * Responsibilities only:
 *   1. Validate the environment configuration.
 *   2. Build the Express app.
 *   3. Connect to MongoDB (non-fatally).
 *   4. Start listening.
 *   5. Shut down cleanly on SIGTERM / SIGINT (important on Render).
 *
 * Run with:  npm run dev   (nodemon, development)
 *            npm start     (node, production)
 */

// Application factory.
import createApp from "./app.js";
// Validated configuration and the startup validator.
import { config, validateConfig, PORT, isProduction } from "./config/env.js";
// Database helpers.
import { connectDatabase, disconnectDatabase } from "./config/db.js";

/**
 * main - boots the server.
 */
const main = async () => {
  // --- 1. Validate the configuration ------------------------------------
  const { fatal, warnings } = validateConfig();

  // Print any configuration warnings first (missing optional API keys).
  for (const warning of warnings) {
    // Warnings never stop the server.
    console.warn(`[config] ${warning}`);
  }

  // Fatal problems mean the server cannot run securely.
  if (fatal.length > 0) {
    // Print each problem on its own line.
    for (const problem of fatal) console.error(`[config] FATAL: ${problem}`);
    // Explain how to fix it.
    console.error("[config] Copy .env.example to .env and fill in the values, then restart.");
    // Exit with a non-zero status so the hosting platform reports the failure.
    process.exit(1);
  }

  // --- 2. Build the app --------------------------------------------------
  const app = createApp();

  // --- 3. Connect to MongoDB (non-fatally) ------------------------------
  // A failed or missing connection does NOT stop the server: /api/health,
  // /api/schemes, /api/crops/* and /api/fertilizer/* still work, which makes
  // local development and classroom demos possible before Atlas is configured.
  // This matches the degraded-mode warning printed by validateConfig() above.
  const db = await connectDatabase();
  // Report the degraded state clearly.
  if (!db.connected) {
    console.warn("[server] Starting without a database. Auth, profile and chat history will return 503.");
  }

  // --- 4. Start listening -----------------------------------------------
  const server = app.listen(PORT, () => {
    // Startup banner.
    console.log("-------------------------------------------------------------");
    console.log("  KhetiGPT Backend - AI-Powered Personal Farming Assistant");
    console.log("-------------------------------------------------------------");
    // Local URL. Render injects PORT and binds 0.0.0.0 automatically.
    console.log(`  Local     http://localhost:${PORT}`);
    // API root.
    console.log(`  API base  http://localhost:${PORT}/api`);
    // Health check URL, handy for the browser.
    console.log(`  Health    http://localhost:${PORT}/api/health`);
    // Environment and mode.
    console.log(`  Env       ${isProduction ? "production" : "development"}`);
    // Database state.
    console.log(`  Database  ${db.connected ? "connected" : "NOT connected"}`);
    // CORS allowlist, so a connection refusal is easy to diagnose.
    console.log(`  CORS      ${config.CORS_ORIGINS.length > 0 ? config.CORS_ORIGINS.join(", ") : "(allowlist empty)"}`);
    console.log("-------------------------------------------------------------");
  });

  // Give the socket a generous timeout: the provider call can take a few seconds.
  server.timeout = 60000;
  // Keep the connection alive between requests.
  server.keepAliveTimeout = 65000;
  // Must be greater than keepAliveTimeout on platforms with a proxy.
  server.headersTimeout = 66000;

  /**
   * shutdown - closes the HTTP server and the database connection cleanly.
   * @param {string} signal - the signal that triggered the shutdown
   */
  const shutdown = async (signal) => {
    // Log the reason for the shutdown.
    console.log(`\n[server] ${signal} received. Shutting down...`);
    // Stop accepting new connections and wait for the current ones.
    server.close(async () => {
      // Close the MongoDB connection.
      await disconnectDatabase();
      // Confirm and exit successfully.
      console.log("[server] Goodbye.");
      process.exit(0);
    });
    // Force exit if graceful shutdown takes too long (e.g. a hung socket).
    setTimeout(() => {
      // Warn, then force the exit.
      console.error("[server] Forced shutdown after timeout.");
      process.exit(1);
      // 10 seconds is enough for any in-flight request.
    }, 10000).unref();
  };

  // Handle Ctrl+C.
  process.on("SIGINT", () => shutdown("SIGINT"));
  // Handle the terminate signal sent by Render/Heroku/Docker.
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  // Catch unhandled promise rejections instead of dying silently.
  process.on("unhandledRejection", (reason) => {
    // Log the reason for debugging.
    console.error("[server] Unhandled promise rejection:", reason);
  });
  // Catch uncaught exceptions so the process can log and exit cleanly.
  process.on("uncaughtException", (error) => {
    // Log the error with a stack trace.
    console.error("[server] Uncaught exception:", error);
    // Exit: an uncaught exception leaves the process in an undefined state.
    process.exit(1);
  });
};

// Run the boot sequence and surface any startup failure.
main().catch((error) => {
  // Log the failure.
  console.error("[server] Failed to start:", error);
  // Exit with a non-zero status.
  process.exit(1);
});
