ALTER TABLE "AuditChainHead" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditChainHead" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "AuditChainHead"
  USING ("chainKey" = 'PLATFORM' OR "chainKey" = current_setting('app.current_entity_id', true));

-- Append-only in spirit (updated only via the audit service's locked
-- read-modify-write, never by application ad hoc UPDATE elsewhere) but the
-- head pointer itself must be updatable to advance the chain, so UPDATE
-- stays granted here, unlike AuditLog/DocumentAccessLog.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "AuditChainHead" TO bord_app;
  END IF;
END $$;
