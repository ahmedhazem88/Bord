-- AlterEnum
ALTER TYPE "GovernanceRole" ADD VALUE 'AUDITOR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResolutionType" ADD VALUE 'DISSOLUTION';
ALTER TYPE "ResolutionType" ADD VALUE 'MERGER';
ALTER TYPE "ResolutionType" ADD VALUE 'MERGER_INCREASING_LIABILITY';
ALTER TYPE "ResolutionType" ADD VALUE 'PURPOSE_CHANGE';

-- AlterTable
ALTER TABLE "AgendaItem" ADD COLUMN     "unanimousConfirmedByCapacityIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "agendaLockedAt" TIMESTAMP(3);
