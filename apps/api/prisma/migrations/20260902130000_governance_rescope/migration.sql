-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ResolutionType" ADD VALUE 'INITIAL_STRUCTURE';
ALTER TYPE "ResolutionType" ADD VALUE 'BUDGET_APPROVAL';
ALTER TYPE "ResolutionType" ADD VALUE 'FINANCIAL_STATEMENTS_APPROVAL';

-- AlterTable
ALTER TABLE "AgendaItem" ADD COLUMN     "suggestedResolutionEffect" JSONB;

-- AlterTable
ALTER TABLE "Resolution" ADD COLUMN     "chainStage" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "precedingResolutionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Resolution_precedingResolutionId_key" ON "Resolution"("precedingResolutionId");

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_precedingResolutionId_fkey" FOREIGN KEY ("precedingResolutionId") REFERENCES "Resolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

