/**
 * routes/assistantRoutes.js
 * -----------------------------------------------------------------------------
 * AI assistant route definitions.
 *
 *   POST   /api/assistant/chat     -> chatAssistant  (alias: POST /api/assistant/message)
 *   GET    /api/assistant/history  -> getHistory
 *   DELETE /api/assistant/history  -> clearHistory
 *   GET    /api/assistant/meta     -> getAssistantMeta
 *
 * The chat endpoint is wrapped in the strict `aiLimiter` because every call
 * consumes Gemini API credits.
 */

import { Router } from "express";
// Controller functions.
import {
  chatAssistant,
  getHistory,
  clearHistory,
  getAssistantMeta,
} from "../controllers/assistantController.js";
// Validation helper and the chat rules.
import { validate, chatRules } from "../middleware/validateMiddleware.js";
// JWT middlewares.
import { protect, optionalAuth, requireDatabase } from "../middleware/authMiddleware.js";
// Strict limiter for the AI endpoint.
import { aiLimiter } from "../middleware/rateLimitMiddleware.js";
// asyncHandler forwards controller rejections to the error middleware.
import asyncHandler from "../utils/asyncHandler.js";

// Create the assistant router.
const router = Router();

/**
 * GET /api/assistant/meta
 * Public (but personalised when a token is supplied). Reports whether the AI is
 * configured, the topics covered and the assistant's safety rules.
 */
router.get("/meta", optionalAuth, asyncHandler(getAssistantMeta));

/**
 * POST /api/assistant/chat
 * Optional auth: an anonymous question still gets an answer, but a logged-in
 * farmer gets answers personalised with their crop, soil, season and location,
 * and the conversation is stored.
 */
router.post(
  "/chat",
  // Strict limit: every call consumes Gemini API credits.
  aiLimiter,
  // Personalisation and history need a user; anonymous calls are still allowed.
  optionalAuth,
  // Persisting the conversation needs MongoDB.
  requireDatabase,
  // Validate the message body.
  validate(chatRules),
  // Generate the reply.
  asyncHandler(chatAssistant)
);

/**
 * POST /api/assistant/message
 * Alias of /chat. The existing React frontend's ENDPOINTS map already contains
 * "/assistant/message", so this alias keeps it working unchanged.
 */
router.post(
  "/message",
  aiLimiter,
  optionalAuth,
  requireDatabase,
  validate(chatRules),
  asyncHandler(chatAssistant)
);

/**
 * GET /api/assistant/history
 * Protected. Returns the authenticated farmer's stored conversation.
 */
router.get("/history", protect, requireDatabase, asyncHandler(getHistory));

/**
 * DELETE /api/assistant/history
 * Protected. Deletes the authenticated farmer's conversation.
 */
router.delete("/history", protect, requireDatabase, asyncHandler(clearHistory));

// Export the configured router.
export default router;
