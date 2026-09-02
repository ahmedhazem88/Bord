-- CreateEnum
CREATE TYPE "BoardElectionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "BoardElection" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "agendaItemId" TEXT NOT NULL,
    "seatsOpen" INTEGER NOT NULL,
    "status" "BoardElectionStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardElection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardElectionCandidate" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposedRole" "GovernanceRole" NOT NULL,
    "elected" BOOLEAN NOT NULL DEFAULT false,
    "appointingResolutionId" TEXT,

    CONSTRAINT "BoardElectionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CumulativeVoteAllocation" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "voterCapacityId" TEXT NOT NULL,
    "votes" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CumulativeVoteAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardElection_agendaItemId_key" ON "BoardElection"("agendaItemId");

-- CreateIndex
CREATE INDEX "BoardElection_entityId_status_idx" ON "BoardElection"("entityId", "status");

-- CreateIndex
CREATE INDEX "BoardElectionCandidate_electionId_idx" ON "BoardElectionCandidate"("electionId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardElectionCandidate_electionId_userId_key" ON "BoardElectionCandidate"("electionId", "userId");

-- CreateIndex
CREATE INDEX "CumulativeVoteAllocation_electionId_voterCapacityId_idx" ON "CumulativeVoteAllocation"("electionId", "voterCapacityId");

-- CreateIndex
CREATE UNIQUE INDEX "CumulativeVoteAllocation_candidateId_voterCapacityId_key" ON "CumulativeVoteAllocation"("candidateId", "voterCapacityId");

-- AddForeignKey
ALTER TABLE "BoardElection" ADD CONSTRAINT "BoardElection_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardElection" ADD CONSTRAINT "BoardElection_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardElectionCandidate" ADD CONSTRAINT "BoardElectionCandidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "BoardElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardElectionCandidate" ADD CONSTRAINT "BoardElectionCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CumulativeVoteAllocation" ADD CONSTRAINT "CumulativeVoteAllocation_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "BoardElection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CumulativeVoteAllocation" ADD CONSTRAINT "CumulativeVoteAllocation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "BoardElectionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CumulativeVoteAllocation" ADD CONSTRAINT "CumulativeVoteAllocation_voterCapacityId_fkey" FOREIGN KEY ("voterCapacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level tenant isolation, matching every other entity-scoped table.
ALTER TABLE "BoardElection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardElection" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "BoardElection"
  USING ("entityId" = current_setting('app.current_entity_id', true));

ALTER TABLE "BoardElectionCandidate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardElectionCandidate" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "BoardElectionCandidate"
  USING (EXISTS (SELECT 1 FROM "BoardElection" e WHERE e.id = "BoardElectionCandidate"."electionId" AND e."entityId" = current_setting('app.current_entity_id', true)));

ALTER TABLE "CumulativeVoteAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CumulativeVoteAllocation" FORCE ROW LEVEL SECURITY;
CREATE POLICY entity_isolation ON "CumulativeVoteAllocation"
  USING (EXISTS (SELECT 1 FROM "BoardElection" e WHERE e.id = "CumulativeVoteAllocation"."electionId" AND e."entityId" = current_setting('app.current_entity_id', true)));

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'bord_app') THEN
    GRANT SELECT, INSERT, UPDATE ON "BoardElection" TO bord_app;
    GRANT SELECT, INSERT, UPDATE ON "BoardElectionCandidate" TO bord_app;
    GRANT SELECT, INSERT, UPDATE ON "CumulativeVoteAllocation" TO bord_app;
  END IF;
END $$;
