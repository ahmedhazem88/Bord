-- CreateEnum
CREATE TYPE "AgendaItemStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GoverningDocumentType" AS ENUM ('ARTICLES_OF_ASSOCIATION', 'BYLAWS', 'SHAREHOLDERS_AGREEMENT', 'OTHER_AGREEMENT', 'COVENANT', 'WARRANT');

-- CreateEnum
CREATE TYPE "VerificationDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "AgendaItem" ADD COLUMN     "complianceFlags" JSONB,
ADD COLUMN     "complianceReviewedAt" TIMESTAMP(3),
ADD COLUMN     "meetingRequestId" TEXT,
ADD COLUMN     "proposedByCapacityId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "status" "AgendaItemStatus" NOT NULL DEFAULT 'CONFIRMED';

-- AlterTable
ALTER TABLE "MeetingRequest" ADD COLUMN     "proposedAgenda" JSONB;

-- AlterTable
ALTER TABLE "Minutes" ADD COLUMN     "circulatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MinutesVerification" (
    "id" TEXT NOT NULL,
    "minutesId" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "decision" "VerificationDecision" NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinutesVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoverningDocument" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "GoverningDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citation" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoverningDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MinutesVerification_minutesId_idx" ON "MinutesVerification"("minutesId");

-- CreateIndex
CREATE UNIQUE INDEX "MinutesVerification_minutesId_capacityId_key" ON "MinutesVerification"("minutesId", "capacityId");

-- CreateIndex
CREATE INDEX "GoverningDocument_entityId_type_idx" ON "GoverningDocument"("entityId", "type");

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_status_idx" ON "AgendaItem"("meetingId", "status");

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_proposedByCapacityId_fkey" FOREIGN KEY ("proposedByCapacityId") REFERENCES "Capacity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingRequestId_fkey" FOREIGN KEY ("meetingRequestId") REFERENCES "MeetingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutesVerification" ADD CONSTRAINT "MinutesVerification_minutesId_fkey" FOREIGN KEY ("minutesId") REFERENCES "Minutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinutesVerification" ADD CONSTRAINT "MinutesVerification_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoverningDocument" ADD CONSTRAINT "GoverningDocument_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security for the two new tables, following the same
-- entity_isolation pattern as every other table (spec section 9.4).
-- MinutesVerification has no entityId of its own, so it's scoped through
-- Minutes the same way Vote is scoped through Resolution.
ALTER TABLE "MinutesVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MinutesVerification" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "MinutesVerification"
  USING (EXISTS (SELECT 1 FROM "Minutes" m WHERE m.id = "MinutesVerification"."minutesId" AND m."entityId" = current_setting('app.current_entity_id', true)));
CREATE POLICY entity_isolation_insert ON "MinutesVerification" FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM "Minutes" m WHERE m.id = "MinutesVerification"."minutesId" AND m."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "GoverningDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GoverningDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "GoverningDocument"
  USING ("entityId" = current_setting('app.current_entity_id', true));
CREATE POLICY entity_isolation_insert ON "GoverningDocument" FOR INSERT
  WITH CHECK ("entityId" = current_setting('app.current_entity_id', true));

-- New tables aren't covered by the original migration's blanket GRANT
-- (which only applied to tables that existed at the time) — grant the
-- least-privilege application role access explicitly, same as the Minutes
-- table's own migration did.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "MinutesVerification" TO bord_app;
    GRANT SELECT, INSERT, UPDATE ON "GoverningDocument" TO bord_app;
  END IF;
END $$;
