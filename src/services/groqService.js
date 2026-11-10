import Groq from "groq-sdk";

import {
  GROQ_API_KEY,
  GROQ_MODEL,
  isProduction,
} from "../config/env.js";

import ApiError from "../utils/ApiError.js";

import {
  SYSTEM_INSTRUCTION,
  buildContextBlock,
} from "../data/assistantPrompt.js";

let client = null;

const getClient = () => {
  if (!GROQ_API_KEY) return null;

  if (!client) {
    client = new Groq({
      apiKey: GROQ_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    });
  }

  return client;
};

export const isGroqConfigured = () => Boolean(GROQ_API_KEY);

export { SYSTEM_INSTRUCTION, buildContextBlock };

export const classifyGroqError = (error) => {
  const status = error?.status ?? "";

  if (status === 429) {
    return ApiError.tooManyRequests(
      "The AI assistant is busy right now. Please try again shortly."
    );
  }

  if (status === 400) {
    console.error("[groq] Invalid request:", error?.message);

    return ApiError.badRequest(
      "The assistant could not process that question. Please rephrase it."
    );
  }

  if (status === 401 || status === 403) {
    return ApiError.serviceUnavailable(
      "The AI service is not configured correctly. Please contact the project maintainer."
    );
  }

  if (
    String(status).startsWith("5") ||
    /timeout|network|fetch failed|ECONNRESET/i.test(
      `${error?.message ?? ""} ${error?.code ?? ""}`
    )
  ) {
    return ApiError.serviceUnavailable(
      "The AI service is temporarily unavailable. Please try again shortly."
    );
  }

  console.error("[groq] Unexpected error:", error);

  return ApiError.serviceUnavailable(
    "The AI assistant is unavailable right now. Please try again later."
  );
};

export const generateAssistantReply = async ({
  message,
  history = [],
  farmerContext = null,
}) => {
  const groq = getClient();

  if (!groq) {
    throw ApiError.serviceUnavailable(
      "The AI assistant is not configured. Add GROQ_API_KEY to the server environment."
    );
  }

  const contextBlock = farmerContext
    ? buildContextBlock(farmerContext)
    : "";

  const messages = [
    {
      role: "system",
      content: SYSTEM_INSTRUCTION,
    },
  ];

  if (contextBlock) {
    messages.push({
      role: "system",
      content: `Farmer profile context:\n${contextBlock}`,
    });
  }

  for (const turn of history) {
    if (
      typeof turn.content !== "string" ||
      !turn.content.trim()
    ) {
      continue;
    }

    messages.push({
      role: turn.role === "model" || turn.role === "assistant"
        ? "assistant"
        : "user",
      content: turn.content,
    });
  }

  messages.push({
    role: "user",
    content: message,
  });

  try {
    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.4,
      max_completion_tokens: 1024,
    });

    const text = response.choices?.[0]?.message?.content?.trim() ?? "";

    if (!text) {
      return {
        text: "I could not generate an answer. Please rephrase your question.",
        model: GROQ_MODEL,
        tokens: response.usage?.total_tokens ?? null,
        grounded: false,
      };
    }

    return {
      text,
      model: GROQ_MODEL,
      tokens: response.usage?.total_tokens ?? null,
      grounded: true,
    };
  } catch (error) {
    if (!isProduction) {
      console.error("[groq] Request failed:", error?.message);
    }

    throw classifyGroqError(error);
  }
};