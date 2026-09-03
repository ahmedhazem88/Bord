-- CreateTable
CREATE TABLE "RegulatoryChangeNotice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "legalCitation" TEXT NOT NULL,
    "sourceDocument" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "affectedRuleKeys" TEXT[],
    "publishedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryChangeNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryChangeAcknowledgment" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "acknowledgedByUserId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryChangeAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegulatoryChangeAcknowledgment_entityId_idx" ON "RegulatoryChangeAcknowledgment"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryChangeAcknowledgment_noticeId_entityId_key" ON "RegulatoryChangeAcknowledgment"("noticeId", "entityId");

-- AddForeignKey
ALTER TABLE "RegulatoryChangeAcknowledgment" ADD CONSTRAINT "RegulatoryChangeAcknowledgment_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "RegulatoryChangeNotice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryChangeAcknowledgment" ADD CONSTRAINT "RegulatoryChangeAcknowledgment_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level tenant isolation, matching every other entity-scoped table.
-- RegulatoryChangeNotice itself carries no entityId (platform-wide, like
-- RegulatoryRule) and so gets no RLS policy here, same as that table.
ALTER TABLE "RegulatoryChangeAcknowledgment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegulatoryChangeAcknowledgment" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "RegulatoryChangeAcknowledgment"
  USING ("entityId" = current_setting('app.current_entity_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT SELECT, INSERT ON "RegulatoryChangeNotice" TO bord_app;
    GRANT SELECT, INSERT ON "RegulatoryChangeAcknowledgment" TO bord_app;
  END IF;
END $$;
