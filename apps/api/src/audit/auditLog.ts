import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

const GENESIS_HASH = "0".repeat(64);

export interface AuditEntryInput {
  entityId: string | null;
  actorUserId: string | null;
  action: string;
  tableName: string;
  recordId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}

function computeHash(prevHash: string, payload: Omit<AuditEntryInput, "entityId"> & { entityId: string | null; timestamp: string }): string {
  const canonical = JSON.stringify({
    prevHash,
    entityId: payload.entityId,
    actorUserId: payload.actorUserId,
    action: payload.action,
    tableName: payload.tableName,
    recordId: payload.recordId ?? null,
    beforeData: payload.beforeData ?? null,
    afterData: payload.afterData ?? null,
    timestamp: payload.timestamp,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Appends one tamper-evident AuditLog entry, hash-chained per tenant
 * (spec section 5.5 / 9.5). MUST be called within the same transaction as
 * the write it records, so a failed audit write rolls back the governance
 * action too — this is not a best-effort side effect (PRD section 7).
 *
 * Chain-per-entity: the head row is locked with SELECT ... FOR UPDATE so
 * concurrent appends to the same chain can't compute the same prevHash.
 */
export async function appendAuditLog(tx: Prisma.TransactionClient, input: AuditEntryInput): Promise<void> {
  const chainKey = input.entityId ?? "PLATFORM";

  const [head] = await tx.$queryRaw<{ lastHash: string }[]>`
    SELECT "lastHash" FROM "AuditChainHead" WHERE "chainKey" = ${chainKey} FOR UPDATE
  `;

  const prevHash = head?.lastHash ?? GENESIS_HASH;
  const timestamp = new Date().toISOString();
  const hash = computeHash(prevHash, { ...input, timestamp });

  await tx.auditLog.create({
    data: {
      entityId: input.entityId,
      actorUserId: input.actorUserId,
      action: input.action,
      tableName: input.tableName,
      recordId: input.recordId ?? null,
      beforeData: (input.beforeData ?? undefined) as Prisma.InputJsonValue | undefined,
      afterData: (input.afterData ?? undefined) as Prisma.InputJsonValue | undefined,
      prevHash,
      hash,
      // Pinned to the exact instant hashed above (rather than relying on the
      // column's DB-side default) so verifyAuditChain recomputes the same hash.
      createdAt: new Date(timestamp),
    },
  });

  if (head) {
    await tx.$executeRaw`UPDATE "AuditChainHead" SET "lastHash" = ${hash}, "updatedAt" = now() WHERE "chainKey" = ${chainKey}`;
  } else {
    await tx.$executeRaw`INSERT INTO "AuditChainHead" ("chainKey", "lastHash", "updatedAt") VALUES (${chainKey}, ${hash}, now())`;
  }
}

/**
 * Verifies the entire chain for one tenant (or "PLATFORM") is intact —
 * every stored hash matches its recomputation from prevHash + payload, in
 * insertion order. Used by integrity checks / incident response (section 9.6).
 */
export async function verifyAuditChain(tx: Prisma.TransactionClient, chainKey: string): Promise<{ valid: boolean; brokenAtId?: string }> {
  const entityId = chainKey === "PLATFORM" ? null : chainKey;
  const entries = await tx.auditLog.findMany({
    where: { entityId },
    orderBy: { createdAt: "asc" },
  });

  let expectedPrev = GENESIS_HASH;
  for (const entry of entries) {
    const recomputed = computeHash(expectedPrev, {
      entityId: entry.entityId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      tableName: entry.tableName,
      recordId: entry.recordId,
      beforeData: entry.beforeData,
      afterData: entry.afterData,
      timestamp: entry.createdAt.toISOString(),
    });
    if (entry.prevHash !== expectedPrev || entry.hash !== recomputed) {
      return { valid: false, brokenAtId: entry.id };
    }
    expectedPrev = entry.hash;
  }
  return { valid: true };
}
