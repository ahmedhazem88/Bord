import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess, requireRole } from "../auth/rbac.js";
import { createResolution, passResolution, ratifyResolution, rejectOrLapseResolution, type ResolutionEffectPayload } from "./engine.js";
import { castVote, closeVotingAndTally, getResolutionTally, VotingError } from "./voting.js";
import { MAJORITY_RULES } from "./majority.js";

const createSchema = z.object({
  agendaItemId: z.string(),
  // INITIAL_STRUCTURE is deliberately excluded — that type is only ever
  // created through the onboarding bootstrap path in governance/routes.ts,
  // never through this general-purpose endpoint.
  type: z.enum([
    "COMMITTEE_ASSIGNMENT",
    "MD_REMUNERATION",
    "EXECUTIVE_REMUNERATION",
    "PROCEDURAL",
    "BOARD_APPOINTMENT",
    "BOARD_REMOVAL",
    "GA_SET_BOARD_REMUNERATION",
    "AOA_AMENDMENT",
    "CAPITAL_CHANGE",
    "BUDGET_APPROVAL",
    "FINANCIAL_STATEMENTS_APPROVAL",
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  requiredMajority: z.enum(MAJORITY_RULES as [string, ...string[]]),
  // What this resolution does if it passes — applied automatically when
  // voting closes and the majority is met (see close-voting below). Omit
  // for a resolution with no structural effect (e.g. a procedural note).
  proposedEffect: z.custom<ResolutionEffectPayload>().optional(),
});

const passSchema = z.object({
  effectPayload: z.custom<ResolutionEffectPayload>(),
});

const rejectSchema = z.object({
  outcome: z.enum(["REJECTED", "LAPSED"]),
  reason: z.string().min(1),
});

const castVoteSchema = z.object({
  value: z.enum(["FOR", "AGAINST", "ABSTAIN", "RECUSED"]),
  recusalReason: z.string().optional(),
});

export async function registerResolutionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/resolutions",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = createSchema.parse(request.body);
      const resolution = await withTenantContext(entityId, (tx) =>
        createResolution(tx, { entityId, actorUserId: request.user.sub, ...body }),
      );
      return reply.code(201).send(resolution);
    },
  );

  app.post(
    "/entities/:entityId/resolutions/:resolutionId/pass",
    { preHandler: [app.authenticate, requireCapability("vote:board_resolution")] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      const { effectPayload } = passSchema.parse(request.body);
      const updated = await withTenantContext(entityId, (tx) => passResolution(tx, resolutionId, request.user.sub, effectPayload));
      return reply.send(updated);
    },
  );

  app.post(
    "/entities/:entityId/resolutions/:resolutionId/ratify",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      const updated = await withTenantContext(entityId, (tx) => ratifyResolution(tx, resolutionId, request.user.sub));
      return reply.send(updated);
    },
  );

  app.post(
    "/entities/:entityId/resolutions/:resolutionId/reject-or-lapse",
    { preHandler: [app.authenticate, requireRole("COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      const { outcome, reason } = rejectSchema.parse(request.body);
      const updated = await withTenantContext(entityId, (tx) => rejectOrLapseResolution(tx, resolutionId, outcome, reason, request.user.sub));
      return reply.send(updated);
    },
  );

  // A prior chain stage passed (e.g. the Audit Committee approved the
  // financial statements) and the engine auto-created the next stage —
  // it has no agendaItemId yet since no meeting of the next body existed
  // at that moment. This is the Secretary's queue for finding those and
  // putting them on the next body's agenda.
  app.get(
    "/entities/:entityId/resolutions/awaiting-agenda",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const resolutions = await withTenantContext(entityId, (tx) =>
        tx.resolution.findMany({ where: { entityId, agendaItemId: null, status: "DRAFT" }, orderBy: { createdAt: "asc" } }),
      );
      return reply.send(resolutions);
    },
  );

  app.post(
    "/entities/:entityId/resolutions/:resolutionId/attach-agenda-item",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      const { agendaItemId } = z.object({ agendaItemId: z.string() }).parse(request.body);

      const updated = await withTenantContext(entityId, async (tx) => {
        const resolution = await tx.resolution.findUniqueOrThrow({ where: { id: resolutionId } });
        if (resolution.status !== "DRAFT") {
          throw Object.assign(new Error(`resolution is ${resolution.status}, not DRAFT`), { statusCode: 409 });
        }
        const agendaItem = await tx.agendaItem.findUniqueOrThrow({ where: { id: agendaItemId } });
        if (agendaItem.status !== "CONFIRMED") {
          throw Object.assign(new Error("agenda item must be CONFIRMED before a resolution can attach to it"), { statusCode: 409 });
        }
        return tx.resolution.update({ where: { id: resolutionId }, data: { agendaItemId } });
      });

      return reply.send(updated);
    },
  );

  // "Pending changes" view — PRD 5.4: what's queued and its authorization deadline.
  app.get("/entities/:entityId/resolutions/pending", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const pending = await withTenantContext(entityId, (tx) =>
      tx.resolution.findMany({ where: { entityId, status: "PENDING_AUTHORIZATION" }, orderBy: { resolutionDate: "asc" } }),
    );
    return reply.send(pending);
  });

  // Live/ratified resolution history — always reflects the current, binding state.
  app.get("/entities/:entityId/resolutions", { preHandler: [app.authenticate, requireEntityAccess()] }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const resolutions = await withTenantContext(entityId, (tx) =>
      tx.resolution.findMany({ where: { entityId }, orderBy: { createdAt: "desc" } }),
    );
    return reply.send(resolutions);
  });

  // Cast (or change) a vote — For/Against/Abstain/Recused. Eligibility (board
  // vs GA vs committee capacity), quorum, and the Art. 74 hard exclusion are
  // all enforced inside castVote, not here.
  app.post(
    "/entities/:entityId/resolutions/:resolutionId/votes",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      const body = castVoteSchema.parse(request.body);
      try {
        const vote = await withTenantContext(entityId, (tx) => castVote(tx, { resolutionId, voterUserId: request.user.sub, ...body }));
        return reply.code(201).send(vote);
      } catch (error) {
        if (error instanceof VotingError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );

  // Live tally — For/Against/Abstain/Recused weights, whether it would pass
  // right now, and current quorum. Lets the UI show vote status mid-meeting.
  app.get(
    "/entities/:entityId/resolutions/:resolutionId/tally",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      try {
        const result = await withTenantContext(entityId, (tx) => getResolutionTally(tx, resolutionId));
        return reply.send(result);
      } catch (error) {
        if (error instanceof VotingError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );

  // Closes voting: tallies, checks the required majority, and either
  // applies the resolution's proposedEffect (via the same Resolution
  // Engine every other path uses) or marks it REJECTED. Gated the same as
  // agenda control (Chairman/Vice Chairman/MD/Secretary run the meeting).
  app.post(
    "/entities/:entityId/resolutions/:resolutionId/close-voting",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, resolutionId } = request.params as { entityId: string; resolutionId: string };
      try {
        const result = await withTenantContext(entityId, (tx) => closeVotingAndTally(tx, resolutionId, request.user.sub));
        return reply.send(result);
      } catch (error) {
        if (error instanceof VotingError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );
}
