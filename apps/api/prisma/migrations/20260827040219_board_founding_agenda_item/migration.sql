-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "foundingAgendaItemId" TEXT;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_foundingAgendaItemId_fkey" FOREIGN KEY ("foundingAgendaItemId") REFERENCES "AgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
