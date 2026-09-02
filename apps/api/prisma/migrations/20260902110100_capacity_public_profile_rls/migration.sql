-- Purely additive: Postgres OR's multiple permissive policies for the same
-- command together, so this doesn't touch the existing tenant/self-access
-- policy on Capacity — it only adds one more way a row can be visible.
-- A capacity is publicly readable (SELECT only — never INSERT/UPDATE/DELETE)
-- when all three consent conditions hold: the capacity itself was verified,
-- the holder opted their profile in, and the entity is publicly listed.
CREATE POLICY capacity_public_read ON "Capacity" FOR SELECT USING (
  "verificationStatus" = 'APPROVED'
  AND EXISTS (SELECT 1 FROM "User" u WHERE u.id = "Capacity"."userId" AND u."publicProfileVisible" = true)
  AND EXISTS (SELECT 1 FROM "Entity" e WHERE e.id = "Capacity"."entityId" AND e."publiclyListed" = true)
);
