/**
 * assistantService.js — READY TO PASTE into the React frontend at src/services/assistantService.js
 * -----------------------------------------------------------------------------
 * Replaces the local keyword rule engine with the real Gemini-backed endpoint.
 * The function signature matches your existing code, so Assistant.jsx needs no changes.
 */

// Shared axios instance.
import api from "./api";

/**
 * Sends a farming question and returns an assistant message object with the
 * SAME shape your chat UI already renders:
 *   { sender: "ai", text: "…", time: "10:32 AM" }
 *
 * @param {string} message - the farmer's question
 */
export async function sendAssistantMessage(message) {
  // POST /api/assistant/chat — the backend also accepts /assistant/message.
  const { data } = await api.post("/assistant/chat", { message });

  // Build the message object in your existing shape.
  return {
    // Mark it as an AI message so the bubble aligns left.
    sender: "ai",
    // The generated answer text.
    text: data.data.reply,
    // Timestamp formatted the same way your mock used.
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}

/**
 * Returns the stored conversation so the chat can be restored on page load.
 * Maps the backend's { role, content, timestamp } onto your UI's shape.
 */
export async function getHistory() {
  try {
    // GET /api/assistant/history
    const { data } = await api.get("/assistant/history");

    // Map each stored turn into the UI shape.
    return data.data.conversation.messages.map((message) => ({
      // "user" stays "user"; "model" becomes "ai".
      sender: message.role === "user" ? "user" : "ai",
      // The message text.
      text: message.content,
      // Format the stored ISO timestamp.
      time: new Date(message.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
  } catch {
    // Without a session there is no history to restore.
    return [];
  }
}

/** Deletes the stored conversation. */
export async function clearHistory() {
  // DELETE /api/assistant/history
  await api.delete("/assistant/history");
}

/** Reports whether the AI is configured, so the "Demo AI Mode" badge can be driven by the API. */
export async function getAssistantMeta() {
  try {
    // GET /api/assistant/meta
    const { data } = await api.get("/assistant/meta");
    // Return the metadata block.
    return data.data;
  } catch {
    // Fall back to "not configured" so the UI degrades gracefully.
    return { aiConfigured: false, model: null, topics: [], safetyNotes: [] };
  }
}

// Default export.
export default { sendAssistantMessage, getHistory, clearHistory, getAssistantMeta };
