-- Platform Admin manages entity onboarding and platform-wide monitoring
-- (spec section 2) and so can see the Entity registry itself, but this flag
-- is checked ONLY on Entity's policy — never added to Capacity, Resolution,
-- Meeting, Vote, Document, etc. — preserving "never has standing access to
-- any entity's governance data" (section 9.10).
DROP POLICY entity_isolation ON "Entity";
CREATE POLICY entity_isolation ON "Entity" FOR SELECT USING (
  id = current_setting('app.current_entity_id', true)
  OR current_setting('app.is_platform_admin', true) = 'true'
);
CREATE POLICY entity_isolation_write ON "Entity" FOR UPDATE USING (id = current_setting('app.current_entity_id', true));
CREATE POLICY entity_isolation_delete ON "Entity" FOR DELETE USING (id = current_setting('app.current_entity_id', true));
