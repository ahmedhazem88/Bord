-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "gaSecretaryCapacityId" TEXT,
ADD COLUMN     "gaVoteCounterCapacityIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_gaSecretaryCapacityId_fkey" FOREIGN KEY ("gaSecretaryCapacityId") REFERENCES "Capacity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
