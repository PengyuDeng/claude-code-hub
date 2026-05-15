"use server";

import { db } from "@/drizzle/db";
import { messageRequestArtifacts } from "@/drizzle/schema";
import { getEnvConfig } from "@/lib/config/env.schema";
import { logger } from "@/lib/logger";

export type RawMessageArtifactPatch = {
  messageRequestId: number;
  createdAt: Date;
  key: string;
  userText: string;
};

function buildArtifactRows(patch: RawMessageArtifactPatch) {
  type ArtifactInsert = typeof messageRequestArtifacts.$inferInsert;
  type ArtifactUpdate = Partial<ArtifactInsert>;

  const values: Record<string, unknown> = {
    messageRequestId: patch.messageRequestId,
    createdAt: patch.createdAt,
    key: patch.key,
  };
  const update: Record<string, unknown> = {
    key: patch.key,
    userText: patch.userText,
    updatedAt: new Date(),
  };
  values.userText = patch.userText;

  return {
    values: values as ArtifactInsert,
    update: update as ArtifactUpdate,
  };
}

export async function upsertRawMessageArtifact(patch: RawMessageArtifactPatch): Promise<void> {
  if (!getEnvConfig().STORE_RAW_MESSAGE_ARTIFACTS_TO_DB) {
    return;
  }

  try {
    const { values, update } = buildArtifactRows(patch);
    await db.insert(messageRequestArtifacts).values(values).onConflictDoUpdate({
      target: messageRequestArtifacts.messageRequestId,
      set: update,
    });
  } catch (error) {
    logger.error("[MessageArtifact] Failed to persist raw message artifact", {
      error,
      messageRequestId: patch.messageRequestId,
    });
  }
}
