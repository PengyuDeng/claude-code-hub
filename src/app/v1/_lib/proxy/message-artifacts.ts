import { getEnvConfig } from "@/lib/config/env.schema";
import { upsertRawMessageArtifact } from "@/repository/message-artifact";
import type { ProxySession } from "./session";

type RawMessageArtifactClientSnapshot = {
  userText: string | null;
};

type ProxySessionWithRawArtifacts = ProxySession & {
  rawMessageArtifactClientSnapshot?: RawMessageArtifactClientSnapshot;
};

function getRawArtifactContext(session: ProxySession) {
  if (!getEnvConfig().STORE_RAW_MESSAGE_ARTIFACTS_TO_DB) {
    return null;
  }

  const messageContext = session.messageContext;
  if (!messageContext?.id || !messageContext.apiKey) {
    return null;
  }

  return messageContext;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeExtractedText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.trim().length > 0 ? value : null;
}

function extractTextFromContent(content: unknown): string | null {
  if (typeof content === "string") {
    return normalizeExtractedText(content);
  }

  if (Array.isArray(content)) {
    const parts = content
      .map((entry) => extractTextFromContent(entry))
      .filter((entry): entry is string => entry !== null);
    return normalizeExtractedText(parts.join("\n"));
  }

  if (!isRecord(content)) {
    return null;
  }

  const type = typeof content.type === "string" ? content.type : null;
  if ((type === "text" || type === "input_text") && typeof content.text === "string") {
    return normalizeExtractedText(content.text);
  }

  if (!type && typeof content.text === "string") {
    return normalizeExtractedText(content.text);
  }

  if (Array.isArray(content.parts)) {
    return extractTextFromContent(content.parts);
  }

  return null;
}

function extractLastUserTextFromEntries(
  entries: unknown,
  options: { allowMissingRole?: boolean } = {}
): string | null {
  if (!Array.isArray(entries)) {
    return null;
  }

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      !isRecord(entry) ||
      (entry.role !== "user" && !(options.allowMissingRole && entry.role === undefined))
    ) {
      continue;
    }

    const text = extractTextFromContent(entry.content ?? entry.parts);
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function extractUserTextFromRequestBody(body: unknown): string | null {
  if (typeof body === "string") {
    return normalizeExtractedText(body);
  }

  if (!isRecord(body)) {
    return null;
  }

  const messagesText = extractLastUserTextFromEntries(body.messages);
  if (messagesText !== null) {
    return messagesText;
  }

  if (typeof body.input === "string") {
    return normalizeExtractedText(body.input);
  }

  const inputText = extractLastUserTextFromEntries(body.input);
  if (inputText !== null) {
    return inputText;
  }

  const contentsText = extractLastUserTextFromEntries(body.contents, { allowMissingRole: true });
  if (contentsText !== null) {
    return contentsText;
  }

  if (isRecord(body.request)) {
    const wrappedContentsText = extractLastUserTextFromEntries(body.request.contents, {
      allowMissingRole: true,
    });
    if (wrappedContentsText !== null) {
      return wrappedContentsText;
    }
  }

  if (typeof body.prompt === "string") {
    return normalizeExtractedText(body.prompt);
  }

  if (typeof body.raw === "string") {
    return normalizeExtractedText(body.raw);
  }

  return null;
}

export function captureRawClientMessageArtifact(session: ProxySession): void {
  if (!getEnvConfig().STORE_RAW_MESSAGE_ARTIFACTS_TO_DB) {
    return;
  }

  (session as ProxySessionWithRawArtifacts).rawMessageArtifactClientSnapshot = {
    userText: extractUserTextFromRequestBody(session.request.message),
  };
}

export async function persistRawClientMessageArtifact(session: ProxySession): Promise<void> {
  const messageContext = getRawArtifactContext(session);
  if (!messageContext) {
    return;
  }

  const snapshot = (session as ProxySessionWithRawArtifacts).rawMessageArtifactClientSnapshot ?? {
    userText: extractUserTextFromRequestBody(session.request.message),
  };
  if (snapshot.userText === null) {
    return;
  }

  await upsertRawMessageArtifact({
    messageRequestId: messageContext.id,
    createdAt: messageContext.createdAt,
    key: messageContext.apiKey,
    userText: snapshot.userText,
  });
}
