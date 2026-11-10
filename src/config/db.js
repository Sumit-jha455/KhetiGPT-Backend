/**
 * config/db.js
 * -----------------------------------------------------------------------------
 * MongoDB Atlas connection helper built on Mongoose.
 *
 * DESIGN NOTES:
 *   - connectDatabase() is idempotent: calling it twice does not create two pools.
 *   - Connection failures DO NOT crash the process. The API keeps serving the
 *     endpoints that do not need the database (health, schemes, crop rules,
 *     fertilizer rules) and reports 503 for database backed routes. This makes
 *     local development and classroom demos possible before Atlas is configured.
 *   - getConnectionState() is used by /api/health to report real status.
 */

// Mongoose is the ODM used to model users and chat history.
import mongoose from "mongoose";
// Validated environment values.
import { MONGODB_URI, MONGODB_DB_NAME, isProduction } from "./env.js";

import dns from "node:dns";

// Use Google DNS for MongoDB Atlas SRV record resolution.
dns.setServers(["8.8.8.8", "8.8.4.4"]);

/**
 * connectDatabase - opens the Mongoose connection to MongoDB Atlas.
 * @returns {Promise<{connected: boolean, error: string|null}>}
 */
export const connectDatabase = async () => {
  // Guard against double connection attempts (useful in tests and hot reloads).
  if (mongoose.connection.readyState === 1) {
    // Already connected - report success immediately.
    return { connected: true, error: null };
  }

  // Missing URI is a configuration problem, not a network problem.
  if (!MONGODB_URI) {
    // Log a clear, student-friendly instruction.
    console.warn("[db] MONGODB_URI is not configured. Database features are disabled.");
    // Report the configuration gap.
    return { connected: false, error: "MONGODB_URI is not configured" };
  }

  try {
    // Mongoose 8 no longer needs the old useNewUrlParser/useUnifiedTopology flags.
    // dbName acts as a fallback when the URI itself has no database segment.
    await mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB_NAME,
      // Give up after 10 seconds so `npm run dev` fails fast with a clear message.
      serverSelectionTimeoutMS: 10000,
    });

    // Success log includes the database name but never the credentials.
    console.log(`[db] Connected to MongoDB database "${MONGODB_DB_NAME}"`);
    // Report success.
    return { connected: true, error: null };
  } catch (error) {
    // Log the reason (bad credentials, IP not whitelisted, network blocked...).
    console.error("[db] MongoDB connection failed:", error.message);
    // Extra help for the two most common Atlas student mistakes.
    if (error.message.includes("bad auth") || error.message.includes("Authentication failed")) {
      console.error("[db] Hint: check the database username/password inside MONGODB_URI.");
    }
    if (error.message.includes("IP") || error.message.includes("whitelist")) {
      console.error("[db] Hint: add your current IP in Atlas -> Network Access.");
    }

    // Keep the server alive but mark the database as unavailable.
    return { connected: false, error: error.message };
  }
};

/**
 * getConnectionState - maps the numeric Mongoose state to a readable string.
 * 0 disconnected | 1 connected | 2 connecting | 3 disconnecting
 */
export const getConnectionState = () => {
  // Read the live state from the Mongoose singleton.
  const state = mongoose.connection.readyState;
  // Translate the number into a status label used by the health endpoint.
  const labels = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  // Return the label, or "unknown" for any unexpected value.
  return labels[state] ?? "unknown";
};

/**
 * disconnectDatabase - closes the connection cleanly.
 * Used by the automated tests so the Node process can exit.
 */
export const disconnectDatabase = async () => {
  // Only attempt to close when a connection exists.
  if (mongoose.connection.readyState !== 0) {
    // Gracefully close sockets and stop the internal heartbeat.
    await mongoose.connection.close();
    // Confirm shutdown in non-production runs.
    if (!isProduction) console.log("[db] Connection closed");
  }
};
