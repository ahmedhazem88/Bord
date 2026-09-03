import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { withTenantContext, withoutTenantContext } from "../db.js";
import { requireRole } from "../auth/rbac.js";
import { appendAuditLog } from "../audit/auditLog.js";
import { reviewAgendaItem } from "../agenda/review.js";

/**
 * The professional network's other half: a company finds someone through
 * their public profile (public/routes.ts) and "hires" them — which means
 * starting their real, formal appointment process into this entity's
 * governance structure, not a contact/lead-gen action outside the platform.
 *
 * "Hire" here creates a PROPOSED agenda item carrying the intended
 * appointment as a suggestedResolutionEffect. It lands in the Secretary's
 * existing agenda-preparation review queue (meetings/routes.ts) exactly
 * like any other proposed item — no separate approval path to maintain —
 * and confirming it there auto-creates the DRAFT resolution the board
 * actually votes on.
 */

const BOARD_ROLE_ENUM = z.enum([
  "CHAIRMAN",
  "VICE_CHAIRMAN",
  "MANAGING_DIRECTOR",
  "CORPORATE_SECRETARY",
  "EXECUTIVE_BOARD_MEMBER",
  "NON_EXECUTIVE_BOARD_MEMBER",
  "INDEPENDENT_BOARD_MEMBER",
  "COMMITTEE_MEMBER",
  "COMMITTEE_CHAIR",
  "ADVISOR",
  "COMPLIANCE_OFFICER",
]);

const hireSchema = z.object({
  professionalSlug: z.string().min(1),
  role: BOARD_ROLE_ENUM,
  // Which meeting's agenda this appointment proposal should land on — an
  // AgendaItem always belongs to a real Meeting, so hiring needs one to
  // attach to, same as any other proposal.
  meetingId: z.string().min(1),
});

export async function registerHiringRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/entities/:entityId/hiring/hire",
    { preHandler: [app.authenticate, requireRole("CHAIRMAN", "VICE_CHAIRMAN", "CORPORATE_SECRETARY", "COMPLIANCE_OFFICER")] },
    async (request, reply) => {
      const { entityId } = request.params as { entityId: string };
      const body = hireSchema.parse(request.body);

      const professional = await withoutTenantContext((tx) =>
        tx.user.findFirst({
          where: { publicSlug: body.professionalSlug, publicProfileVisible: true },
          select: { id: true, fullName: true },
        }),
      );
      if (!professional) return reply.code(404).send({ error: "professional not found or not publicly listed" });

      const item = await withTenantContext(entityId, async (tx) => {
        await tx.meeting.findUniqueOrThrow({ where: { id: body.meetingId } });
        const maxOrder = await tx.agendaItem.aggregate({ where: { meetingId: body.meetingId }, _max: { order: true } });

        const title = `Appoint ${professional.fullName} as ${body.role.replace(/_/g, " ")}`;
        const description = `Proposed appointment sourced from Bord's professional network (/professionals/${body.professionalSlug}).`;
        const complianceFlags = await reviewAgendaItem(tx, entityId, title, description);

        const created = await tx.agendaItem.create({
          data: {
            meetingId: body.meetingId,
            order: (maxOrder._max.order ?? -1) + 1,
            title,
            description,
            status: "PROPOSED",
            suggestedResolutionEffect: { type: "BOARD_APPOINTMENT", userId: professional.id, role: body.role } as Prisma.InputJsonValue,
            complianceFlags: complianceFlags as unknown as Prisma.InputJsonValue,
            complianceReviewedAt: new Date(),
          },
        });

        await appendAuditLog(tx, {
          entityId,
          actorUserId: request.user.sub,
          action: "HIRING_PROPOSED",
          tableName: "AgendaItem",
          recordId: created.id,
          afterData: { professionalUserId: professional.id, role: body.role },
        });

        return created;
      });

      return reply.code(201).send(item);
    },
  );
}
