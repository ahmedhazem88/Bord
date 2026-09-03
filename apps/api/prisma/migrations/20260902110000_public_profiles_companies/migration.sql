-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "about" TEXT,
ADD COLUMN     "publicSlug" TEXT,
ADD COLUMN     "publiclyListed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "headline" TEXT,
ADD COLUMN     "publicProfileVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Entity_publicSlug_key" ON "Entity"("publicSlug");

-- CreateIndex
CREATE UNIQUE INDEX "User_publicSlug_key" ON "User"("publicSlug");

-- Public company profiles (opt-out via publiclyListed): extend Entity's
-- SELECT policy with a third branch alongside tenant-match and
-- platform-admin, so an anonymous request (no session context at all) can
-- still read a row that has explicitly opted in to being public. This is
-- the ONLY new public-read surface — Board/Resolution/Meeting/Vote/Document
-- policies are untouched, so governance data stays exactly as private as
-- before.
DROP POLICY entity_isolation ON "Entity";
CREATE POLICY entity_isolation ON "Entity" FOR SELECT USING (
  id = current_setting('app.current_entity_id', true)
  OR current_setting('app.is_platform_admin', true) = 'true'
  OR "publiclyListed" = true
);


