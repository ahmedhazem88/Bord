-- Tenant isolation enforced at the database layer (spec section 9.4 / PRD 5.1).
-- The application connects as `bord_app`, which has no BYPASSRLS and no
-- CREATEDB/superuser rights in production. Every request runs inside a
-- transaction that sets the Postgres session variable app.current_entity_id;
-- rows belonging to a different entity are physically unreachable regardless
-- of any application-layer filtering bug.
--
-- Break-glass / cross-entity platform-admin access is a separate, logged,
-- time-boxed path (section 9.10) — not modeled by bypassing these policies
-- with the same role the app uses day to day.

ALTER TABLE "Entity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Entity" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Entity"
  USING (id = current_setting('app.current_entity_id', true));

ALTER TABLE "Capacity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Capacity" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Capacity"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "Board" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Board" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Board"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "Committee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Committee" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Committee"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Meeting"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "Resolution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resolution" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Resolution"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "RegulatoryObligation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegulatoryObligation" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "RegulatoryObligation"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "RegulatoryRuleOverride" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RegulatoryRuleOverride" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "RegulatoryRuleOverride"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "RemunerationPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RemunerationPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "RemunerationPolicy"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "MeetingRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "MeetingRequest"
  USING ("entityId" = current_setting('app.current_entity_id', true));

-- Nullable-entityId tables: NULL means "not entity-scoped" (a user's own
-- pre-entity document, or a platform-level audit entry) and is visible in
-- any tenant context; every non-null value is still hard-isolated.
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Document"
  USING ("entityId" IS NULL OR "entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "AuditLog"
  USING ("entityId" IS NULL OR "entityId" = current_setting('app.current_entity_id', true));

-- Child tables scoped indirectly through a parent FK.
ALTER TABLE "DisqualificationCheck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DisqualificationCheck" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "DisqualificationCheck"
  USING (EXISTS (SELECT 1 FROM "Capacity" c WHERE c.id = "DisqualificationCheck"."capacityId" AND c."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "CommitteeMembership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommitteeMembership" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "CommitteeMembership"
  USING (EXISTS (SELECT 1 FROM "Committee" c WHERE c.id = "CommitteeMembership"."committeeId" AND c."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "AgendaItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgendaItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "AgendaItem"
  USING (EXISTS (SELECT 1 FROM "Meeting" m WHERE m.id = "AgendaItem"."meetingId" AND m."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "MeetingAttendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingAttendance" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "MeetingAttendance"
  USING (EXISTS (SELECT 1 FROM "Meeting" m WHERE m.id = "MeetingAttendance"."meetingId" AND m."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "Proxy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proxy" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Proxy"
  USING (EXISTS (SELECT 1 FROM "Meeting" m WHERE m.id = "Proxy"."meetingId" AND m."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "Vote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Vote" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Vote"
  USING (EXISTS (SELECT 1 FROM "Resolution" r WHERE r.id = "Vote"."resolutionId" AND r."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "InterestDeclaration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InterestDeclaration" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "InterestDeclaration"
  USING (EXISTS (SELECT 1 FROM "Capacity" c WHERE c.id = "InterestDeclaration"."capacityId" AND c."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "RemunerationRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RemunerationRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "RemunerationRecord"
  USING (EXISTS (SELECT 1 FROM "Capacity" c WHERE c.id = "RemunerationRecord"."capacityId" AND c."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "Payout" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payout" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "Payout"
  USING (EXISTS (
    SELECT 1 FROM "RemunerationRecord" rr
    JOIN "Capacity" c ON c.id = rr."capacityId"
    WHERE rr.id = "Payout"."remunerationRecordId" AND c."entityId" = current_setting('app.current_entity_id', true)
  ));

ALTER TABLE "DocumentAccessLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentAccessLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "DocumentAccessLog"
  USING (EXISTS (
    SELECT 1 FROM "Document" d
    WHERE d.id = "DocumentAccessLog"."documentId" AND (d."entityId" IS NULL OR d."entityId" = current_setting('app.current_entity_id', true))
  ));

-- Grant table privileges to the least-privilege application role. This role
-- has no BYPASSRLS, no CREATEDB, no CREATEROLE — see section 9.10.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT USAGE ON SCHEMA public TO bord_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bord_app;
    -- Append-only enforcement at the DB layer for tamper-evident logs (section 9.5):
    -- no UPDATE or DELETE, even for the application role, on AuditLog or access logs.
    REVOKE UPDATE, DELETE ON "AuditLog" FROM bord_app;
    REVOKE UPDATE, DELETE ON "DocumentAccessLog" FROM bord_app;
    -- bord_app is created without BYPASSRLS/CREATEROLE/SUPERUSER by the DBA
    -- (see deploy notes); this migration does not attempt to alter its own
    -- role since altering a role requires a privilege bord_app itself lacks.
  END IF;
END $$;
