-- CreateTable
CREATE TABLE "FinancialStatement" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "netDistributableProfit" DECIMAL(18,2) NOT NULL,
    "approvingResolutionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialStatement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_approvingResolutionId_key" ON "FinancialStatement"("approvingResolutionId");

-- CreateIndex
CREATE INDEX "FinancialStatement_entityId_idx" ON "FinancialStatement"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialStatement_entityId_fiscalYear_key" ON "FinancialStatement"("entityId", "fiscalYear");

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialStatement" ADD CONSTRAINT "FinancialStatement_approvingResolutionId_fkey" FOREIGN KEY ("approvingResolutionId") REFERENCES "Resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level tenant isolation, matching every other entity-scoped table.
ALTER TABLE "FinancialStatement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialStatement" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "FinancialStatement"
  USING ("entityId" = current_setting('app.current_entity_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "FinancialStatement" TO bord_app;
  END IF;
END $$;
