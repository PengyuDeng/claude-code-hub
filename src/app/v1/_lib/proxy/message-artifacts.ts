import { getEnvConfig } from "@/lib/config/env.schema";
import { upsertRawMessageArtifact } from "@/repository/message-artifact";
import type { ProxySession } from "./session";

type RawMessageArtifactClientSnapshot = {
  body: string;
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

function stringifyFallbackBody(body: unknown): string {
  if (typeof body === "string") {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function readOriginalRequestBodyText(session: ProxySession): string {
  const buffer = session.request.buffer;
  if (buffer) {
    return new TextDecoder().decode(buffer);
  }

  return stringifyFallbackBody(session.request.message);
}

export function captureRawClientMessageArtifact(session: ProxySession): void {
  if (!getEnvConfig().STORE_RAW_MESSAGE_ARTIFACTS_TO_DB) {
    return;
  }

  (session as ProxySessionWithRawArtifacts).rawMessageArtifactClientSnapshot = {
    body: readOriginalRequestBodyText(session),
  };
}

export async function persistRawClientMessageArtifact(session: ProxySession): Promise<void> {
  const messageContext = getRawArtifactContext(session);
  if (!messageContext) {
    return;
  }

  const snapshot = (session as ProxySessionWithRawArtifacts).rawMessageArtifactClientSnapshot ?? {
    body: readOriginalRequestBodyText(session),
  };

  await upsertRawMessageArtifact({
    messageRequestId: messageContext.id,
    createdAt: messageContext.createdAt,
    key: messageContext.apiKey,
    requestBody: snapshot.body,
  });
}
