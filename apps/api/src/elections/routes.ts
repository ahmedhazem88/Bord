import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withTenantContext } from "../db.js";
import { requireCapability, requireEntityAccess } from "../auth/rbac.js";
import { createElection, castCumulativeVote, closeElection, ElectionError } from "./engine.js";

/**
 * Cumulative voting for board elections (spec section 6, 2018 amendment) —
 * a genuinely different voting mechanism from the FOR/AGAINST/ABSTAIN/
 * RECUSED Resolution model in resolutions/: each GA member's power for the
 * whole election is shares x seats open, freely allocated across
 * candidates rather than a per-candidate up/down vote, so a minority
 * shareholder can concentrate enough votes to guarantee a seat.
 */

const createElectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  seatsOpen: z.number().int().min(1),
  candidates: z
    .array(
      z.object({
        userId: z.string(),
        proposedRole: z.enum([
          "CHAIRMAN",
          "VICE_CHAIRMAN",
          "MANAGING_DIRECTOR",
          "EXECUTIVE_BOARD_MEMBER",
          "NON_EXECUTIVE_BOARD_MEMBER",
          "INDEPENDENT_BOARD_MEMBER",
        ]),
      }),
    )
    .min(1),
});

const allocateSchema = z.object({
  candidateId: z.string(),
  votes: z.number().min(0),
});

export async function registerElectionRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/meetings/:meetingId/board-elections",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, meetingId } = request.params as { entityId: string; meetingId: string };
      const body = createElectionSchema.parse(request.body);
      try {
        const election = await withTenantContext(entityId, (tx) =>
          createElection(tx, { entityId, meetingId, ...body, actorUserId: request.user.sub }),
        );
        return reply.code(201).send(election);
      } catch (error) {
        if (error instanceof ElectionError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );

  app.get(
    "/entities/:entityId/board-elections/:electionId",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, electionId } = request.params as { entityId: string; electionId: string };
      const election = await withTenantContext(entityId, (tx) =>
        tx.boardElection.findUniqueOrThrow({ where: { id: electionId }, include: { candidates: { include: { user: { select: { fullName: true } } } } } }),
      );
      return reply.send(election);
    },
  );

  app.post(
    "/entities/:entityId/board-elections/:electionId/allocate",
    { preHandler: [app.authenticate, requireEntityAccess()] },
    async (request, reply) => {
      const { entityId, electionId } = request.params as { entityId: string; electionId: string };
      const body = allocateSchema.parse(request.body);
      try {
        const allocation = await withTenantContext(entityId, (tx) =>
          castCumulativeVote(tx, { entityId, electionId, voterUserId: request.user.sub, ...body, actorUserId: request.user.sub }),
        );
        return reply.code(201).send(allocation);
      } catch (error) {
        if (error instanceof ElectionError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );

  app.post(
    "/entities/:entityId/board-elections/:electionId/close",
    { preHandler: [app.authenticate, requireCapability("agenda:set")] },
    async (request, reply) => {
      const { entityId, electionId } = request.params as { entityId: string; electionId: string };
      try {
        const result = await withTenantContext(entityId, (tx) => closeElection(tx, entityId, electionId, request.user.sub));
        return reply.send(result);
      } catch (error) {
        if (error instanceof ElectionError) return reply.code(error.statusCode).send({ error: error.message });
        throw error;
      }
    },
  );
}
