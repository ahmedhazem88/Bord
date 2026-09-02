ALTER TABLE "Minutes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Minutes" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Minutes"
  USING ("entityId" = current_setting('app.current_entity_id', true));
CREATE POLICY entity_isolation_insert ON "Minutes" FOR INSERT
  WITH CHECK ("entityId" = current_setting('app.current_entity_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "Minutes" TO bord_app;
  END IF;
END $$;
