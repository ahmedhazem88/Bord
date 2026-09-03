import type { FastifyReply, FastifyRequest } from "fastify";
import { can, type Action, type GovernanceRole } from "@bord/shared";
import { withTenantContext } from "../db.js";

/**
 * Platform Admin never holds standing access to any entity's governance
 * data (PRD section 2 / 9.10) — this guard only certifies the *platform*
 * identity for platform-scoped operations (entity onboarding, the
 * regulatory rule set), never as a bypass for entity-scoped RLS-protected
 * reads elsewhere.
 */
export async function requirePlatformAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user.isPlatformAdmin) {
    await reply.code(403).send({ error: "platform admin only" });
  }
}

/**
 * Resolves the caller's active, verified Capacity at the entity named by
 * :entityId in the route params, then checks it against the shared
 * privileges matrix (spec section 12 / PRD 9.3) — the single source of
 * truth an endpoint is checked against, not a bespoke per-route rule.
 */
export function requireCapability(action: Action) {
  return async function rbacGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const entityId = (request.params as Record<string, string | undefined>).entityId;
    if (!entityId) {
      await reply.code(400).send({ error: "entityId route parameter is required for this action" });
      return;
    }

    const userId = request.user.sub;
    // A person can hold more than one capacity at the same entity (e.g. a
    // board member who is also a shareholder) — check the grant across ALL
    // of them, not just whichever capacity happens to come back first.
    const capacities = await withTenantContext(entityId, (tx) =>
      tx.capacity.findMany({
        where: { userId, entityId, active: true, verificationStatus: "APPROVED" },
        select: { role: true },
      }),
    );

    if (!capacities.some((c) => can(c.role as GovernanceRole, action))) {
      await reply.code(403).send({ error: `role does not grant '${action}' at this entity`, requiredAction: action });
      return;
    }
  };
}

/**
 * Baseline gate for every entity-scoped read (or write that isn't already
 * covered by requireCapability/requireRole): app.authenticate alone only
 * proves *a* valid session exists, not that this entity's data is any of
 * the caller's business — without this, any authenticated platform user
 * could list an unrelated entity's board roster, resolutions, or payouts
 * just by knowing its id. Passes for Platform Admin (onboarding/bootstrap
 * visibility, per spec section 2) or anyone holding an active, verified
 * capacity at the entity, of any role — read access to the roster/board
 * status itself isn't role-differentiated the way specific actions are.
 */
export function requireEntityAccess() {
  return async function entityAccessGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (request.user.isPlatformAdmin) return;

    const entityId = (request.params as Record<string, string | undefined>).entityId;
    if (!entityId) {
      await reply.code(400).send({ error: "entityId route parameter is required for this action" });
      return;
    }

    const userId = request.user.sub;
    const capacity = await withTenantContext(entityId, (tx) =>
      tx.capacity.findFirst({
        where: { userId, entityId, active: true, verificationStatus: "APPROVED" },
        select: { id: true },
      }),
    );

    if (!capacity) {
      await reply.code(403).send({ error: "you do not hold an active capacity at this entity" });
      return;
    }
  };
}

/**
 * Guard for administrative actions (verification review, GAFI/FRA submission
 * tracking) that sit outside the governance privileges matrix entirely —
 * spec section 12 only tables board/GA governance actions; Compliance
 * Officer's review-and-submission authority is a distinct, entity-scoped
 * administrative capacity, checked directly by role rather than forced into
 * that matrix.
 */
export function requireRole(...allowed: GovernanceRole[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const entityId = (request.params as Record<string, string | undefined>).entityId;
    if (!entityId) {
      await reply.code(400).send({ error: "entityId route parameter is required for this action" });
      return;
    }

    const userId = request.user.sub;
    const capacity = await withTenantContext(entityId, (tx) =>
      tx.capacity.findFirst({
        where: { userId, entityId, active: true, verificationStatus: "APPROVED", role: { in: allowed } },
        select: { role: true },
      }),
    );

    if (!capacity) {
      await reply.code(403).send({ error: `requires one of roles [${allowed.join(", ")}] at this entity` });
      return;
    }
  };
}
