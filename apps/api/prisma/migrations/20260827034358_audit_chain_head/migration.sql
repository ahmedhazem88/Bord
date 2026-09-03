-- CreateTable
CREATE TABLE "AuditChainHead" (
    "chainKey" TEXT NOT NULL,
    "lastHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY ("chainKey")
);
