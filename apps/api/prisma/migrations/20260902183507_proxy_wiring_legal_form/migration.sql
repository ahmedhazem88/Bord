-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('JSC', 'LLC');

-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "legalForm" "LegalForm" NOT NULL DEFAULT 'JSC';

-- AddForeignKey
ALTER TABLE "Proxy" ADD CONSTRAINT "Proxy_grantorCapacityId_fkey" FOREIGN KEY ("grantorCapacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proxy" ADD CONSTRAINT "Proxy_granteeCapacityId_fkey" FOREIGN KEY ("granteeCapacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
