-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "chairMdSeparationExceptionApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "chairMdSeparationJustification" TEXT,
ADD COLUMN     "lastValidatedAt" TIMESTAMP(3),
ADD COLUMN     "lastValidationPassed" BOOLEAN;

-- AlterTable
ALTER TABLE "Committee" ADD COLUMN     "dissolvedAt" TIMESTAMP(3),
ADD COLUMN     "foundingResolutionId" TEXT;

-- AddForeignKey
ALTER TABLE "Committee" ADD CONSTRAINT "Committee_foundingResolutionId_fkey" FOREIGN KEY ("foundingResolutionId") REFERENCES "Resolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
