-- CreateEnum
CREATE TYPE "MinutesStatus" AS ENUM ('DRAFT', 'CIRCULATED', 'CHAIRMAN_SIGNED', 'SECRETARY_SIGNED', 'FINAL', 'SUBMITTED_FRA', 'SUBMITTED_GAFI');

-- AlterTable
ALTER TABLE "Capacity" ADD COLUMN     "sharePercentage" DECIMAL(6,3);

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "firstMeetingId" TEXT,
ADD COLUMN     "isSecondMeeting" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MeetingRequest" ADD COLUMN     "chairmanRespondedAt" TIMESTAMP(3),
ADD COLUMN     "resultingMeetingId" TEXT;

-- AlterTable
ALTER TABLE "Resolution" ADD COLUMN     "proposedEffect" JSONB;

-- CreateTable
CREATE TABLE "Minutes" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "discussionPoints" JSONB NOT NULL,
    "keywords" TEXT[],
    "status" "MinutesStatus" NOT NULL DEFAULT 'DRAFT',
    "chairmanSignedAt" TIMESTAMP(3),
    "chairmanSignedByUserId" TEXT,
    "secretarySignedAt" TIMESTAMP(3),
    "secretarySignedByUserId" TEXT,
    "submittedToFraAt" TIMESTAMP(3),
    "submittedToGafiAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Minutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Minutes_meetingId_key" ON "Minutes"("meetingId");

-- CreateIndex
CREATE INDEX "Minutes_entityId_createdAt_idx" ON "Minutes"("entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_firstMeetingId_fkey" FOREIGN KEY ("firstMeetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Minutes" ADD CONSTRAINT "Minutes_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
