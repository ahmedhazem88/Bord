-- Entity rows are created once, by the platform-admin onboarding flow,
-- before any tenant session context exists for them yet (the id is not
-- known client-side until the insert returns). Row creation itself is
-- already gated at the application layer (platform-admin only); RLS's job
-- here is preventing cross-tenant SELECT/UPDATE/DELETE leakage after
-- creation, which the existing USING clause still covers.
CREATE POLICY entity_insert ON "Entity" FOR INSERT WITH CHECK (true);
