import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireRole } from "../auth/rbac.js";
import { createResolution, passResolution, ratifyResolution, rejectOrLapseResolution, type ResolutionEffectPayload } from "./engine.js";

const createSchema = z.object({
  agendaItemId: z.string(),
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
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  requiredMajority: z.string().min(1),
});

const passSchema = z.object({
  effectPayload: z.custom<ResolutionEffectPayload>(),
});

const rejectSchema = z.object({
  outcome: z.enum(["REJECTED", "LAPSED"]),
  reason: z.string().min(1),
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

  // "Pending changes" view — PRD 5.4: what's queued and its authorization deadline.
  app.get("/entities/:entityId/resolutions/pending", { preHandler: app.authenticate }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const pending = await withTenantContext(entityId, (tx) =>
      tx.resolution.findMany({ where: { entityId, status: "PENDING_AUTHORIZATION" }, orderBy: { resolutionDate: "asc" } }),
    );
    return reply.send(pending);
  });

  // Live/ratified resolution history — always reflects the current, binding state.
  app.get("/entities/:entityId/resolutions", { preHandler: app.authenticate }, async (request, reply) => {
    const { entityId } = request.params as { entityId: string };
    const resolutions = await withTenantContext(entityId, (tx) =>
      tx.resolution.findMany({ where: { entityId }, orderBy: { createdAt: "desc" } }),
    );
    return reply.send(resolutions);
  });
}
