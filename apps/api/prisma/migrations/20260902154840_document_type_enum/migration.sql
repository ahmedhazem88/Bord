/*
  Warnings:

  - Changed the type of `type` on the `Document` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('NATIONAL_ID_OR_PASSPORT', 'CRIMINAL_RECORD_CERTIFICATE', 'EXPERIENCE_CERTIFICATE', 'PROFESSIONAL_LICENSE', 'MINISTERIAL_APPROVAL_LETTER', 'PRIOR_BOARD_APPROVAL_RECORD', 'COMMERCIAL_REGISTRATION', 'TAX_REGISTRATION_CERTIFICATE', 'SIGNATORY_APPOINTING_RESOLUTION', 'MINUTES', 'RESOLUTION_RECORD', 'MEETING_RECORDING', 'OTHER');

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "type",
ADD COLUMN     "type" "DocumentType" NOT NULL;
