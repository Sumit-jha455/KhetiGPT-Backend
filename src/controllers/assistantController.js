/**
 * controllers/assistantController.js
 * -----------------------------------------------------------------------------
 * AI farming assistant endpoints.
 *
 *   chatAssistant  -> POST   /api/assistant/chat    (alias: POST /api/assistant/message)
 *   getHistory     -> GET    /api/assistant/history
 *   clearHistory   -> DELETE /api/assistant/history
 *
 * FLOW FOR chatAssistant
 *   1. Verify the database is reachable (history must be persisted).
 *   2. Load the farmer's profile to build the AI context block.
 *   3. Load the last N conversation turns as context.
 *   4. Ask Gemini for a reply.
 *   5. Persist BOTH the user turn and the model turn.
 *   6. Return the reply plus the refreshed conversation.
 *
 * IMPORTANT: if Gemini fails AFTER the user turn was saved, we still persist the
 * user turn so the conversation is not lost, then surface the error.
 */

import ChatHistory, { CONTEXT_WINDOW } from "../models/ChatHistory.js";
// Database connection status helper.
import { getConnectionState } from "../config/db.js";
// Operational error helpers.
import ApiError from "../utils/ApiError.js";
// Success envelope.
import { ok } from "../utils/response.js";
// Gemini integration.
import {
  generateAssistantReply,
  isGroqConfigured,
  SYSTEM_INSTRUCTION,
} from "../services/groqService.js";

/**
 * isDatabaseReady - guard used by every endpoint that touches MongoDB.
 * Keeps the API usable (and demonstrable) before Atlas is configured.
 */
const isDatabaseReady = () => getConnectionState() === "connected";

/**
 * chatAssistant - sends a question to Gemini and returns the reply.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const chatAssistant = async (req, res) => {
  // --- Configuration guards ----------------------------------------------
  // The AI key is required for this endpoint.
  if (!isGroqConfigured()) {
    // 503 tells the frontend this is a temporary/server-side condition.
    throw ApiError.serviceUnavailable(
      "The AI assistant is not configured on this server. Add GROQ_API_KEY to the environment to enable it."
    );
  }
  // Chat history must be persisted, so the database is also required.
  if (!isDatabaseReady()) {
    // 503 with a clear, non-technical explanation.
    throw ApiError.serviceUnavailable(
      "The assistant needs the database connection to store your conversation. Please check the MongoDB configuration."
    );
  }

  // --- Read the request ----------------------------------------------------
  // The farmer's question, already trimmed by the validation middleware.
  const message = String(req.body?.message ?? "").trim();
  // Guard against an empty question reaching the AI.
  if (!message) {
    // 400 because the request was incomplete.
    throw ApiError.badRequest("Please enter a question.");
  }

  // --- Build the farmer context -------------------------------------------
  // `protect`/`optionalAuth` attaches the user document when a token was supplied.
  // Passing the safe object gives the model the crop, soil, season and location.
  const farmerContext = req.user ? req.user.toSafeObject() : null;

  // --- Load the conversation context --------------------------------------
  // Chat history is per user. Anonymous calls get no stored context.
  const history = req.userId ? await ChatHistory.getContextWindow(req.userId, CONTEXT_WINDOW) : [];

  // --- Ask Gemini ---------------------------------------------------------
  // The service throws an ApiError on any provider failure.
  const reply = await generateAssistantReply({ message, history, farmerContext });

  // --- Persist the conversation ------------------------------------------
  // We save both turns so the next request has full context.
  let conversation = null;
  // Only attempt persistence when the request was authenticated.
  if (req.userId) {
    // Append the user turn and the model turn atomically.
    conversation = await ChatHistory.appendMessages(req.userId, [
      // The farmer's question.
      { role: "user", content: message, timestamp: new Date() },
      // The assistant's answer, with the model recorded for traceability.
      { role: "model", content: reply.text, timestamp: new Date(), model: reply.model, tokens: reply.tokens },
    ]);
  }

  // --- Respond ------------------------------------------------------------
  return ok(res, "Reply generated.", {
    // The answer text, ready to render in the chat bubble.
    reply: reply.text,
    // Model that produced the answer.
    model: reply.model,
    // Token usage when the provider reported it.
    tokens: reply.tokens,
    // False when the model returned no usable answer.
    grounded: reply.grounded,
    // Timestamp of the reply, so the UI can show "answered at".
    repliedAt: new Date().toISOString(),
    // The refreshed conversation, when the request was authenticated.
    conversation: conversation ? conversation.toClientObject() : null,
    // Transparency about what context was sent to the model.
    context: {
      // Number of previous turns included.
      historyTurns: history.length,
      // Whether the farmer's profile was included.
      profileUsed: Boolean(farmerContext),
      // The persona is always applied.
      systemInstructionApplied: true,
    },
  });
};

/**
 * getHistory - returns the authenticated farmer's stored conversation.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getHistory = async (req, res) => {
  // --- Configuration guard ------------------------------------------------
  if (!isDatabaseReady()) {
    // 503 because history lives in MongoDB.
    throw ApiError.serviceUnavailable("Chat history is unavailable because the database is not connected.");
  }

  // --- Load or create the conversation ------------------------------------
  // Creating it on read keeps the frontend simple (it can always expect a document).
  const conversation = await ChatHistory.findOrCreateByUser(req.userId);

  // Return the conversation in the client shape.
  return ok(res, "Chat history loaded.", {
    // Normalised conversation object.
    conversation: conversation.toClientObject(),
    // Whether an AI model is currently configured (lets the UI disable the input).
    aiConfigured: isGroqConfigured(),
    // Model id reported to the UI, when configured.
    model: isGroqConfigured()
  ? process.env.GROQ_MODEL || "openai/gpt-oss-20b"
  : null,
  });
};

/**
 * clearHistory - deletes the authenticated farmer's conversation.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const clearHistory = async (req, res) => {
  // --- Configuration guard ------------------------------------------------
  if (!isDatabaseReady()) {
    // 503 because history lives in MongoDB.
    throw ApiError.serviceUnavailable("Chat history is unavailable because the database is not connected.");
  }

  // --- Delete the conversation -------------------------------------------
  // deleteMany returns a count, which is safe even when nothing exists yet.
  const result = await ChatHistory.deleteMany({ userId: req.userId });

  // Return a confirmation with the number of removed documents.
  return ok(res, "Chat history cleared.", {
    // Whether anything was actually deleted.
    cleared: true,
    // Number of conversation documents removed (0 or 1).
    deletedCount: result.deletedCount ?? 0,
  });
};

/**
 * getAssistantMeta - returns information about the assistant configuration.
 * The frontend uses this to show the "Demo AI Mode" vs "Live AI" badge and to
 * build its suggested-question list without hardcoding anything.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 */
export const getAssistantMeta = async (req, res) => {
  // Return the assistant configuration and the safety position.
  return ok(res, "Assistant information loaded.", {
    // Whether the Groq key is present on the server.
    aiConfigured: isGroqConfigured(),
    // Model id, or null when not configured.
    model: isGroqConfigured()
      ? process.env.GROQ_MODEL || "openai/gpt-oss-20b"
      : null,
    // The scope the assistant covers, so the UI can set expectations.
    topics: [
      "Crop cultivation",
      "Soil management",
      "Irrigation",
      "Fertilizer concepts",
      "Pest and disease management (general)",
      "Weather-related farming decisions",
      "Seasonal practices",
      "General agricultural information",
    ],
    // Safety rules surfaced to the user, so the limits are visible in the UI.
    safetyNotes: [
      "The assistant is not a certified agricultural expert.",
      "It does not recommend specific pesticide or chemical dosages.",
      "It does not provide exact fertilizer quantities; use a soil test report.",
      "It does not fabricate government scheme details; verify on official portals.",
      "Consult a local agriculture officer or Krishi Vigyan Kendra for high-risk decisions.",
    ],
    // Whether the request was authenticated (context personalisation available).
    personalised: Boolean(req.user),
    // Database status, reported so the UI can explain a degraded state.
    database: getConnectionState(),
  });
};

/**
 * Expose the system instruction for documentation/tests only.
 * It is NOT sent to the client by any route.
 */
export const ASSISTANT_SYSTEM_INSTRUCTION = SYSTEM_INSTRUCTION;
