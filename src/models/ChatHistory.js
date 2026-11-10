/**
 * models/ChatHistory.js
 * -----------------------------------------------------------------------------
 * Persisted AI conversation, one document per farmer.
 *
 * WHY ONE DOCUMENT PER USER (instead of one per message):
 *   - The assistant needs the recent turns as context for every reply, so the
 *     reads are always "latest N messages for this user". A single document
 *     makes that a single indexed read instead of a sort over many documents.
 *   - The message array is capped at MAX_MESSAGES_PER_CHAT, so the document can
 *     never grow without limit (which would break the 16MB MongoDB limit).
 */

import mongoose from "mongoose";

/** Hard cap on stored turns. Oldest messages are trimmed automatically. */
export const MAX_MESSAGES_PER_CHAT = 100;

/** How many previous turns are sent to Gemini as context. */
export const CONTEXT_WINDOW = 12;

/** Allowed message roles - mirrors the Gemini API content roles. */
export const MESSAGE_ROLES = ["user", "model", "system"];

/** Sub-document describing a single chat turn. */
const messageSchema = new mongoose.Schema(
  {
    // "user" or "model" ("system" is reserved for future use).
    role: {
      type: String,
      required: true,
      enum: { values: MESSAGE_ROLES, message: "{VALUE} is not a valid message role" },
    },
    // The text content of the turn.
    content: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      // Refuse absurdly large inputs before they reach the AI provider.
      maxlength: [6000, "Message is too long (6000 characters maximum)"],
    },
    // When the turn was created.
    timestamp: { type: Date, default: Date.now },
    // Optional model metadata saved with AI replies.
    model: { type: String, default: null },
    // Number of tokens reported by the provider, when available.
    tokens: { type: Number, default: null },
  },
  { _id: true, timestamps: false, versionKey: false }
);

/** Main chat history schema. */
const chatHistorySchema = new mongoose.Schema(
  {
    // Owning farmer. One document per user, enforced by the unique index
    // declared below the schema definition.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      unique: true,
    },

    // Conversation turns, newest last.
    messages: {
      type: [messageSchema],
      default: [],
      // Never allow the array to exceed the cap.
      validate: {
        validator: (value) => value.length <= MAX_MESSAGES_PER_CHAT,
        message: `A conversation cannot exceed ${MAX_MESSAGES_PER_CHAT} messages`,
      },
    },

    // Total turns exchanged over the lifetime of the account (audit/usage metric).
    totalMessages: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    versionKey: false,
    // Do not create an empty document when saving a deleted conversation.
    minimize: true,
  }
);

/* --------------------------------------------------------------------------
 * Indexes
 * ------------------------------------------------------------------------ */

// Uniqueness of `userId` is declared on the field above with `unique: true`,
// which guarantees exactly one conversation document per farmer. It is not
// repeated here because Mongoose would report a duplicate index.

// Supports "recently active conversations" queries once multi-session support
// is added.
chatHistorySchema.index({ updatedAt: -1 });

/* --------------------------------------------------------------------------
 * Static helpers (query logic lives with the model, not in controllers)
 * ------------------------------------------------------------------------ */

/**
 * findOrCreateByUser - returns the farmer's conversation document, creating it
 * on first use. Avoids a race by using upsert semantics.
 * @param {string} userId
 */
chatHistorySchema.statics.findOrCreateByUser = async function findOrCreateByUser(userId) {
  // findOneAndUpdate with upsert=true is atomic on the server.
  return this.findOneAndUpdate(
    { userId }, // filter
    { $setOnInsert: { userId, messages: [], totalMessages: 0 } }, // insert defaults
    { new: true, upsert: true, setDefaultsOnInsert: true } // return the fresh document
  );
};

/**
 * appendMessages - pushes turns, keeps the newest MAX_MESSAGES_PER_CHAT and
 * updates the counters in a single atomic update.
 */
chatHistorySchema.statics.appendMessages = async function appendMessages(userId, newMessages) {
  // Normalise the input into an array.
  const turns = Array.isArray(newMessages) ? newMessages : [newMessages];
  // Nothing to do when called with an empty list.
  if (turns.length === 0) return null;

  // First make sure the document exists.
  await this.findOrCreateByUser(userId);

  // Atomically push the turns and increment the lifetime counter.
  await this.updateOne(
    { userId },
    {
      $push: {
        messages: {
          // Append the new turns at the END of the array (chronological order).
          $each: turns,
          // Keep only the LAST N entries, so the array can never grow unbounded.
          $slice: -MAX_MESSAGES_PER_CHAT,
        },
      },
      $inc: { totalMessages: turns.length },
    }
  );

  // Return the updated document for the response payload.
  return this.findOne({ userId });
};

/**
 * getContextWindow - returns the last N turns in chronological order, suitable
 * for passing straight to the Gemini API as conversation history.
 */
chatHistorySchema.statics.getContextWindow = async function getContextWindow(userId, limit = CONTEXT_WINDOW) {
  // Load only the conversation document for this user.
  const chat = await this.findOne({ userId }).select("messages").lean();
  // No history yet -> empty context.
  if (!chat) return [];
  // Mongoose sub-documents need explicit conversion before .slice on a lean doc.
  const messages = chat.messages ?? [];
  // Return the newest `limit` turns in oldest -> newest order.
  return messages.slice(-limit);
};

/**
 * toClientObject - the shape returned to the React frontend.
 * Timestamps are ISO strings and only role/content/timestamp are exposed.
 */
chatHistorySchema.methods.toClientObject = function toClientObject() {
  return {
    // Public conversation id.
    id: String(this._id),
    // Owning user, as a string.
    userId: String(this.userId),
    // Normalised message list for the chat UI.
    messages: (this.messages ?? []).map((message) => ({
      // Message id (useful as a React key).
      id: String(message._id),
      // "user" | "model"
      role: message.role,
      // Message text.
      content: message.content,
      // ISO timestamp string.
      timestamp: message.timestamp,
      // Model name, present on AI replies only.
      model: message.model ?? null,
    })),
    // Lifetime turn counter.
    totalMessages: this.totalMessages ?? 0,
    // Last activity, used to show "last updated" in the UI.
    updatedAt: this.updatedAt,
  };
};

/**
 * ChatHistory model factory (guarded for test re-registration).
 */
const ChatHistory = mongoose.models.ChatHistory ?? mongoose.model("ChatHistory", chatHistorySchema);

// Default export used by the assistant controller.
export default ChatHistory;
