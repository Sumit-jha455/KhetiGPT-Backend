/**
 * services/geminiService.js
 * -----------------------------------------------------------------------------
 * Google Gemini integration for the AI farming assistant.
 *
 * SDK: @google/genai (the official Google Gen AI SDK).
 * Verified call pattern (see the official quickstart):
 *
 *   import { GoogleGenAI } from "@google/genai";
 *   const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
 *   const response = await ai.models.generateContent({
 *     model: "gemini-2.5-flash",
 *     contents: "...",
 *     config: { systemInstruction: "...", temperature: 0.4 },
 *   });
 *   const text = response.text;   // string
 *
 * SECURITY: the API key is read ONLY from process.env on the server. It is never
 * returned in a response, never logged and never sent to the frontend.
 */

// Official Google Gen AI SDK client.
import { GoogleGenAI } from "@google/genai";
// Validated configuration values.
import { GEMINI_API_KEY, GEMINI_MODEL, isProduction } from "../config/env.js";
// Operational error type with correct HTTP status codes.
import ApiError from "../utils/ApiError.js";
// The assistant persona and safety rules.
import { SYSTEM_INSTRUCTION, buildContextBlock } from "../data/assistantPrompt.js";

/**
 * Lazily created SDK client.
 * Creating it at module load would throw when the key is missing, which would
 * break every other endpoint. Instead we check inside the generate function.
 */
let client = null;

/**
 * getClient - returns the Gemini client, or null when the key is not configured.
 * @returns {GoogleGenAI|null}
 */
const getClient = () => {
  // No key configured -> the feature is unavailable.
  if (!GEMINI_API_KEY) return null;
  // Create the client once and reuse it for every request.
  if (!client) client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  // Return the shared client.
  return client;
};

/** True when the Gemini feature is usable. Used by /api/health and the controllers. */
export const isGeminiConfigured = () => Boolean(GEMINI_API_KEY);

/**
 * SYSTEM_INSTRUCTION / buildContextBlock re-exports.
 * Kept here so controllers import only from the service layer.
 */
export { SYSTEM_INSTRUCTION, buildContextBlock };

/**
 * buildContents - converts stored conversation turns into the SDK's format.
 * The SDK accepts either a plain string or an array of { role, parts } objects.
 *
 * @param {Array<{role:string,content:string}>} history - oldest -> newest
 * @param {string} message - the new user question
 */
const buildContents = (history, message) => {
  // Start with the stored history, mapping our roles onto Gemini's roles.
  const turns = history
    // Keep only turns that actually have text.
    .filter((turn) => typeof turn.content === "string" && turn.content.trim().length > 0)
    // Map to the SDK shape.
    .map((turn) => ({
      // Gemini expects "user" or "model".
      role: turn.role === "model" ? "model" : "user",
      // Content is always provided as a parts array.
      parts: [{ text: turn.content }],
    }));

  // Append the new question as the final user turn.
  turns.push({ role: "user", parts: [{ text: message }] });

  // Return the full contents array.
  return turns;
};

/**
 * classifyGeminiError - converts an SDK/provider error into an ApiError.
 * Kept separate so the mapping can be unit tested.
 *
 * @param {Error} error - error thrown by the SDK
 */
export const classifyGeminiError = (error) => {
  // Read the HTTP-ish status the SDK exposes, when present.
  const status = error?.status ?? "";

  // --- 429: quota or rate limit -------------------------------------------
  if (status === 429 || /quota|rate limit|resource_exhausted/i.test(error?.message ?? "")) {
    // Tell the farmer to retry later instead of exposing quota internals.
    return ApiError.tooManyRequests(
      "The AI assistant is busy right now. Please try again in a minute."
    );
  }

  // --- 400 with a model name problem --------------------------------------
  if (status === 400 && /model|not found|unsupported/i.test(error?.message ?? "")) {
    // The configured model is unavailable; surface a clear config-level message.
    return ApiError.serviceUnavailable(
      "The AI model is currently unavailable. Please try again later or contact the project maintainer."
    );
  }

  // --- 400: invalid request (usually our prompt) --------------------------
  if (status === 400) {
    // Log the provider message server-side for debugging.
    console.error("[gemini] 400 from provider:", error?.message);
    // Return a generic, safe message.
    return ApiError.badRequest("The assistant could not process that question. Please rephrase it.");
  }

  // --- 401 / 403: key problems -------------------------------------------
  if (status === 401 || status === 403 || /api key|permission|unauthenticated/i.test(error?.message ?? "")) {
    // A bad or revoked key is a configuration problem.
    return ApiError.serviceUnavailable("The AI service is not configured correctly. Please contact the project maintainer.");
  }

  // --- 5xx: provider outage ----------------------------------------------
  if (String(status).startsWith("5") || /internal|unavailable|deadline/i.test(error?.message ?? "")) {
    // Provider is temporarily down.
    return ApiError.serviceUnavailable("The AI service is temporarily unavailable. Please try again shortly.");
  }

  // --- Timeouts / network failures ---------------------------------------
  if (error?.code === "ECONNABORTED" || /timeout|network/i.test(error?.message ?? "")) {
    // Network problem reaching Google.
    return ApiError.serviceUnavailable("The AI service did not respond in time. Please try again.");
  }

  // --- Anything unexpected ------------------------------------------------
  // Log the full error server-side (never exposed to the client).
  console.error("[gemini] unexpected error:", error);
  // Return a generic 503 so the frontend shows a friendly retry message.
  return ApiError.serviceUnavailable("The AI assistant is unavailable right now. Please try again later.");
};

/**
 * generateAssistantReply - the main entry point used by the controller.
 *
 * @param {Object} params
 * @param {string} params.message  - the farmer's question
 * @param {Array}  [params.history] - previous turns, oldest -> newest
 * @param {Object|null} [params.farmerContext] - profile based context block
 * @returns {Promise<{text:string, model:string, tokens:number|null, grounded:boolean}>}
 */
export const generateAssistantReply = async ({ message, history = [], farmerContext = null }) => {
  // --- Feature availability check -----------------------------------------
  const ai = getClient();
  // When no API key exists, return a clear 503 rather than a silent failure.
  if (!ai) {
    // This is a configuration problem, not a user error.
    throw ApiError.serviceUnavailable(
      "The AI assistant is not configured on this server. Add GEMINI_API_KEY to the environment to enable it."
    );
  }

  // --- Prompt assembly -----------------------------------------------------
  // Build the combined prompt: system instruction + farmer context + conversation.
  const contents = buildContents(history, message);
  // Build the context block describing the farmer's farm profile (if any).
  const contextBlock = farmerContext ? buildContextBlock(farmerContext) : "";

  // If a context block exists, prepend it to the FIRST user turn so the model
  // reads it as background information rather than as a user message.
  if (contextBlock) {
    // Prepend the context to the first turn, or add a synthetic turn when the
    // history is empty.
    if (contents.length > 0) {
      // Prepend the context text to the first turn's text.
      contents[0].parts[0].text = `${contextBlock}\n\n${contents[0].parts[0].text}`;
    } else {
      // No history yet: create a context turn followed by the question.
      contents.unshift({ role: "user", parts: [{ text: contextBlock }] });
    }
  }

  try {
    // --- Call the model ----------------------------------------------------
    const response = await ai.models.generateContent({
      // Model id from the environment (default gemini-2.5-flash).
      model: GEMINI_MODEL,
      // The conversation contents.
      contents,
      // Generation configuration.
      config: {
        // The farming assistant persona and safety rules.
        systemInstruction: SYSTEM_INSTRUCTION,
        // Low-ish temperature keeps agricultural answers factual and consistent.
        temperature: 0.4,
        // Cap the answer length so responses stay readable on a phone.
        maxOutputTokens: 1024,
        // Prevent the model from returning an empty/truncated answer silently.
        stopSequences: [],
      },
    });

    // The SDK exposes the flattened text on `response.text`.
    const text = typeof response?.text === "string" ? response.text.trim() : "";

    // An empty reply means the model refused or was blocked.
    if (!text) {
      // Return a transparent message instead of an empty string.
      return {
        // Explain that no answer was produced.
        text: "I could not generate an answer for that question. Please rephrase it or add a little more detail.",
        // Model used.
        model: GEMINI_MODEL,
        // No token count available.
        tokens: null,
        // Not grounded in an answer.
        grounded: false,
      };
    }

    // Return the successful result.
    return {
      // The answer text.
      text,
      // Model that produced it (stored with the message for traceability).
      model: GEMINI_MODEL,
      // Token usage when the provider reports it.
      tokens: response?.usageMetadata?.totalTokenCount ?? null,
      // A real answer was produced.
      grounded: true,
    };
  } catch (error) {
    // Log the provider error server-side with context (message only, no secrets).
    if (!isProduction) console.error("[gemini] request failed:", error?.message);
    // Convert the provider error into a safe ApiError and rethrow.
    throw classifyGeminiError(error);
  }
};
