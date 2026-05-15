import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProxySession } from "@/app/v1/_lib/proxy/session";

const envConfig = {
  STORE_RAW_MESSAGE_ARTIFACTS_TO_DB: false,
};

const upsertRawMessageArtifactMock = vi.fn();

vi.mock("@/lib/config/env.schema", () => ({
  getEnvConfig: () => envConfig,
}));

vi.mock("@/repository/message-artifact", () => ({
  upsertRawMessageArtifact: upsertRawMessageArtifactMock,
}));

const { captureRawClientMessageArtifact, persistRawClientMessageArtifact } = await import(
  "@/app/v1/_lib/proxy/message-artifacts"
);

function buildSession(): ProxySession {
  const headers = new Headers({
    authorization: "Bearer raw-token",
    "x-api-key": "raw-key",
  });
  const createdAt = new Date("2026-05-15T04:00:00.000Z");

  return {
    headers,
    messageContext: {
      id: 42,
      createdAt,
      apiKey: "sk-company",
    },
    request: {
      buffer: new TextEncoder().encode(
        '{ "model": "gpt-5.5", "messages": [{ "role": "user", "content": "original" }] }'
      ).buffer,
      message: { model: "gpt-5.5", messages: [{ role: "user", content: "current" }] },
    },
    getMessages: () => [{ role: "user", content: "current" }],
  } as unknown as ProxySession;
}

describe("raw message artifacts", () => {
  beforeEach(() => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = false;
    upsertRawMessageArtifactMock.mockReset();
  });

  test("does not persist when raw artifact storage is disabled", async () => {
    const session = buildSession();

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).not.toHaveBeenCalled();
  });

  test("persists captured original request body with platform key", async () => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = true;
    const session = buildSession();
    const body = '{ "model": "gpt-5.5", "messages": [{ "role": "user", "content": "original" }] }';

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).toHaveBeenCalledWith({
      messageRequestId: 42,
      createdAt: session.messageContext?.createdAt,
      key: "sk-company",
      requestBody: body,
    });
  });
});
