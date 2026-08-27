-- Epic 1 AC: a user's own capacity history must be queryable across every
-- entity they hold a capacity at ("who am I, everywhere"), without opening
-- up any other entity's data. Extend the isolation policy with a narrow
-- self-access branch: a row is visible if it belongs to the current tenant
-- OR it is the requesting user's own capacity row. This never exposes
-- another user's data — only the caller's own capacities become visible
-- across tenant boundaries.
DROP POLICY entity_isolation ON "Capacity";
CREATE POLICY entity_isolation ON "Capacity"
  USING (
    "entityId" = current_setting('app.current_entity_id', true)
    OR "userId" = current_setting('app.current_user_id', true)
  );
