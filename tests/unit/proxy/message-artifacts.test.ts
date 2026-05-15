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
      message: {
        model: "gpt-5.5",
        messages: [
          { role: "user", content: "old context" },
          { role: "assistant", content: "ok" },
          { role: "user", content: "current user text" },
        ],
      },
    },
    getMessages: () => [{ role: "user", content: "current user text" }],
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

  test("persists latest user text with platform key", async () => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = true;
    const session = buildSession();

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).toHaveBeenCalledWith({
      messageRequestId: 42,
      createdAt: session.messageContext?.createdAt,
      key: "sk-company",
      userText: "current user text",
    });
  });

  test("extracts user text from responses input blocks", async () => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = true;
    const session = buildSession();
    session.request.message = {
      model: "gpt-5.5",
      input: [
        { role: "user", content: [{ type: "input_text", text: "first input" }] },
        { role: "assistant", content: [{ type: "output_text", text: "ok" }] },
        { role: "user", content: [{ type: "input_text", text: "latest input" }] },
      ],
    };

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: "latest input",
      })
    );
  });

  test("extracts user text from gemini contents", async () => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = true;
    const session = buildSession();
    session.request.message = {
      contents: [{ parts: [{ text: "gemini text" }] }],
    };

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userText: "gemini text",
      })
    );
  });

  test("skips persistence when user text cannot be extracted", async () => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = true;
    const session = buildSession();
    session.request.message = {
      model: "gpt-5.5",
      messages: [{ role: "assistant", content: "ok" }],
    };

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).not.toHaveBeenCalled();
  });

  test("does not fall back to previous user text when latest user entry has no text", async () => {
    envConfig.STORE_RAW_MESSAGE_ARTIFACTS_TO_DB = true;
    const session = buildSession();
    session.request.message = {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "previous prompt" },
        { role: "assistant", content: "tool use" },
        {
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "tool output" }],
        },
      ],
    };

    captureRawClientMessageArtifact(session);
    await persistRawClientMessageArtifact(session);

    expect(upsertRawMessageArtifactMock).not.toHaveBeenCalled();
  });
});
