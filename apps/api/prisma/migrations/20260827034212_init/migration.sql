-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_ADMIN');

-- CreateEnum
CREATE TYPE "GovernanceRole" AS ENUM ('CHAIRMAN', 'VICE_CHAIRMAN', 'MANAGING_DIRECTOR', 'CORPORATE_SECRETARY', 'EXECUTIVE_BOARD_MEMBER', 'NON_EXECUTIVE_BOARD_MEMBER', 'INDEPENDENT_BOARD_MEMBER', 'COMMITTEE_MEMBER', 'COMMITTEE_CHAIR', 'ADVISOR', 'GA_MEMBER', 'COMPLIANCE_OFFICER');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('INSURANCE', 'LEASING', 'FACTORING', 'MORTGAGE_FINANCE', 'MICROFINANCE', 'BROKERAGE');

-- CreateEnum
CREATE TYPE "EffectBasis" AS ENUM ('RESOLUTION_EFFECTIVE', 'AUTHORIZATION_EFFECTIVE');

-- CreateEnum
CREATE TYPE "ResolutionType" AS ENUM ('COMMITTEE_ASSIGNMENT', 'MD_REMUNERATION', 'EXECUTIVE_REMUNERATION', 'PROCEDURAL', 'BOARD_APPOINTMENT', 'BOARD_REMOVAL', 'GA_SET_BOARD_REMUNERATION', 'AOA_AMENDMENT', 'CAPITAL_CHANGE');

-- CreateEnum
CREATE TYPE "ResolutionStatus" AS ENUM ('DRAFT', 'PASSED', 'PENDING_AUTHORIZATION', 'RATIFIED', 'REJECTED', 'LAPSED');

-- CreateEnum
CREATE TYPE "VoteValue" AS ENUM ('FOR', 'AGAINST', 'ABSTAIN', 'RECUSED');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('BOARD', 'COMMITTEE', 'OGM', 'EGM');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'QUORATE', 'QUORUM_LOST', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('IN_PERSON', 'VIRTUAL', 'PROXY', 'ABSENT');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommitteeType" AS ENUM ('AUDIT', 'RISK', 'REMUNERATION_AND_NOMINATION', 'GOVERNANCE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "MeetingRequestType" AS ENUM ('BOARD', 'OGM', 'EGM');

-- CreateEnum
CREATE TYPE "MeetingRequestStatus" AS ENUM ('PENDING', 'BOARD_CALLED', 'ESCALATED_TO_GAFI', 'ESCALATED_TO_REGULATOR');

-- CreateEnum
CREATE TYPE "RemunerationPolicyType" AS ENUM ('BOARD', 'EXECUTIVE', 'ATTENDANCE_ALLOWANCE');

-- CreateEnum
CREATE TYPE "ApprovingBody" AS ENUM ('GA', 'BOARD');

-- CreateEnum
CREATE TYPE "RemunerationComponent" AS ENUM ('BASE', 'ALLOWANCE', 'BONUS', 'EQUITY');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('SCHEDULED', 'PAID', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('USER', 'ENTITY');

-- CreateEnum
CREATE TYPE "RegulatoryObligationType" AS ENUM ('BOARD_MEETING_CADENCE', 'OGM_ANNUAL', 'FRA_MINUTES_SUBMISSION', 'GAFI_RATIFICATION', 'FRA_ANNUAL_DISCLOSURE', 'FRA_PRE_GA_DISCLOSURE', 'TERM_LIMIT', 'AUDITOR_ROTATION', 'INTEREST_DECLARATION_RECONFIRMATION');

-- CreateEnum
CREATE TYPE "RegulatoryObligationStatus" AS ENUM ('PENDING', 'DUE_SOON', 'OVERDUE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RuleOverrideStatus" AS ENUM ('STATUTORY_DEFAULT', 'CUSTOM_OVERRIDE', 'FLAGGED_FOR_REVIEW');

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationalIdHash" TEXT,
    "mfaSecret" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaEnforced" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "regulator" TEXT NOT NULL DEFAULT 'FRA',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Capacity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" "GovernanceRole" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "appointingResolutionId" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Capacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisqualificationCheck" (
    "id" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "criminalRecordClear" BOOLEAN,
    "criminalRecordNotes" TEXT,
    "publicSectorApprovalStatus" TEXT,
    "competingRoleApprovalStatus" TEXT,
    "blocksActivation" BOOLEAN NOT NULL DEFAULT false,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedByUserId" TEXT,

    CONSTRAINT "DisqualificationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "chairmanCapacityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Committee" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommitteeType" NOT NULL,
    "charterMandate" TEXT NOT NULL,
    "quorumRule" TEXT NOT NULL,
    "reportingLine" TEXT NOT NULL DEFAULT 'BOARD',
    "minIndependentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Committee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeMembership" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "isChair" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "appointingResolutionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteeMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resolution" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "agendaItemId" TEXT,
    "type" "ResolutionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredMajority" TEXT NOT NULL,
    "effectBasis" "EffectBasis" NOT NULL,
    "resolutionDate" TIMESTAMP(3),
    "authorizationDate" TIMESTAMP(3),
    "status" "ResolutionStatus" NOT NULL DEFAULT 'DRAFT',
    "rollbackReason" TEXT,
    "preResolutionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "committeeId" TEXT,
    "type" "MeetingType" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    "recordingUrl" TEXT,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "quorumRequiredPct" DOUBLE PRECISION,
    "quorumMet" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendaItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isOffAgendaAddition" BOOLEAN NOT NULL DEFAULT false,
    "unanimousAdditionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgendaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "mode" "AttendanceMode" NOT NULL,
    "rsvpAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proxy" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "grantorCapacityId" TEXT NOT NULL,
    "granteeCapacityId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'FULL',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "resolutionId" TEXT NOT NULL,
    "voterCapacityId" TEXT,
    "proxyId" TEXT,
    "value" "VoteValue" NOT NULL,
    "recusalReason" TEXT,
    "excludedByLaw" BOOLEAN NOT NULL DEFAULT false,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRequest" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "MeetingRequestType" NOT NULL,
    "requestorCapacityIds" TEXT[],
    "capitalOrMemberPct" DOUBLE PRECISION,
    "thresholdMet" BOOLEAN NOT NULL DEFAULT false,
    "status" "MeetingRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responseDeadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestDeclaration" (
    "id" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "declaredByUserId" TEXT NOT NULL,
    "relatedEntityName" TEXT NOT NULL,
    "natureOfInterest" TEXT NOT NULL,
    "dateDeclared" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InterestDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemunerationPolicy" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "RemunerationPolicyType" NOT NULL,
    "approvingBody" "ApprovingBody" NOT NULL,
    "capCalculationBasis" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemunerationPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemunerationRecord" (
    "id" TEXT NOT NULL,
    "capacityId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "component" "RemunerationComponent" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "approvingResolutionId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RemunerationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "remunerationRecordId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'SCHEDULED',
    "withheldTaxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "nonDeductibleTaxTag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryObligation" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "RegulatoryObligationType" NOT NULL,
    "frequencyDays" INTEGER,
    "triggerPoint" TEXT NOT NULL,
    "lastCompletedAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "status" "RegulatoryObligationStatus" NOT NULL DEFAULT 'PENDING',
    "responsibleRole" "GovernanceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryRule" (
    "id" TEXT NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currentValue" JSONB NOT NULL,
    "legalCitation" TEXT NOT NULL,
    "sourceDocument" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryRuleOverride" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" "RuleOverrideStatus" NOT NULL DEFAULT 'CUSTOM_OVERRIDE',
    "citation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulatoryRuleOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerType" "DocumentOwnerType" NOT NULL,
    "ownerUserId" TEXT,
    "entityId" TEXT,
    "capacityId" TEXT,
    "agendaItemId" TEXT,
    "type" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "prevHash" TEXT,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_registrationNumber_key" ON "Entity"("registrationNumber");

-- CreateIndex
CREATE INDEX "Entity_registrationNumber_idx" ON "Entity"("registrationNumber");

-- CreateIndex
CREATE INDEX "Capacity_entityId_role_idx" ON "Capacity"("entityId", "role");

-- CreateIndex
CREATE INDEX "Capacity_userId_idx" ON "Capacity"("userId");

-- CreateIndex
CREATE INDEX "Capacity_entityId_startDate_endDate_idx" ON "Capacity"("entityId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "DisqualificationCheck_capacityId_key" ON "DisqualificationCheck"("capacityId");

-- CreateIndex
CREATE UNIQUE INDEX "Board_entityId_key" ON "Board"("entityId");

-- CreateIndex
CREATE INDEX "Committee_entityId_idx" ON "Committee"("entityId");

-- CreateIndex
CREATE INDEX "CommitteeMembership_committeeId_startDate_endDate_idx" ON "CommitteeMembership"("committeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "CommitteeMembership_capacityId_idx" ON "CommitteeMembership"("capacityId");

-- CreateIndex
CREATE INDEX "Resolution_entityId_status_idx" ON "Resolution"("entityId", "status");

-- CreateIndex
CREATE INDEX "Meeting_entityId_type_scheduledAt_idx" ON "Meeting"("entityId", "type", "scheduledAt");

-- CreateIndex
CREATE INDEX "AgendaItem_meetingId_idx" ON "AgendaItem"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendance_meetingId_capacityId_key" ON "MeetingAttendance"("meetingId", "capacityId");

-- CreateIndex
CREATE INDEX "Proxy_meetingId_idx" ON "Proxy"("meetingId");

-- CreateIndex
CREATE INDEX "Vote_resolutionId_idx" ON "Vote"("resolutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Vote_resolutionId_voterCapacityId_key" ON "Vote"("resolutionId", "voterCapacityId");

-- CreateIndex
CREATE INDEX "MeetingRequest_entityId_status_idx" ON "MeetingRequest"("entityId", "status");

-- CreateIndex
CREATE INDEX "InterestDeclaration_capacityId_active_idx" ON "InterestDeclaration"("capacityId", "active");

-- CreateIndex
CREATE INDEX "RemunerationPolicy_entityId_type_idx" ON "RemunerationPolicy"("entityId", "type");

-- CreateIndex
CREATE INDEX "RemunerationRecord_capacityId_idx" ON "RemunerationRecord"("capacityId");

-- CreateIndex
CREATE INDEX "Payout_remunerationRecordId_status_idx" ON "Payout"("remunerationRecordId", "status");

-- CreateIndex
CREATE INDEX "RegulatoryObligation_entityId_nextDueAt_idx" ON "RegulatoryObligation"("entityId", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRule_ruleKey_key" ON "RegulatoryRule"("ruleKey");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRuleOverride_entityId_ruleId_key" ON "RegulatoryRuleOverride"("entityId", "ruleId");

-- CreateIndex
CREATE INDEX "Document_entityId_idx" ON "Document"("entityId");

-- CreateIndex
CREATE INDEX "Document_ownerUserId_idx" ON "Document"("ownerUserId");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_documentId_timestamp_idx" ON "DocumentAccessLog"("documentId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_createdAt_idx" ON "AuditLog"("entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_recordId_idx" ON "AuditLog"("tableName", "recordId");

-- AddForeignKey
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capacity" ADD CONSTRAINT "Capacity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capacity" ADD CONSTRAINT "Capacity_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capacity" ADD CONSTRAINT "Capacity_appointingResolutionId_fkey" FOREIGN KEY ("appointingResolutionId") REFERENCES "Resolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Capacity" ADD CONSTRAINT "Capacity_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisqualificationCheck" ADD CONSTRAINT "DisqualificationCheck_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Board" ADD CONSTRAINT "Board_chairmanCapacityId_fkey" FOREIGN KEY ("chairmanCapacityId") REFERENCES "Capacity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Committee" ADD CONSTRAINT "Committee_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMembership" ADD CONSTRAINT "CommitteeMembership_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMembership" ADD CONSTRAINT "CommitteeMembership_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMembership" ADD CONSTRAINT "CommitteeMembership_appointingResolutionId_fkey" FOREIGN KEY ("appointingResolutionId") REFERENCES "Resolution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resolution" ADD CONSTRAINT "Resolution_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendaItem" ADD CONSTRAINT "AgendaItem_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendance" ADD CONSTRAINT "MeetingAttendance_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proxy" ADD CONSTRAINT "Proxy_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_resolutionId_fkey" FOREIGN KEY ("resolutionId") REFERENCES "Resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_voterCapacityId_fkey" FOREIGN KEY ("voterCapacityId") REFERENCES "Capacity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "Proxy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRequest" ADD CONSTRAINT "MeetingRequest_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestDeclaration" ADD CONSTRAINT "InterestDeclaration_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestDeclaration" ADD CONSTRAINT "InterestDeclaration_declaredByUserId_fkey" FOREIGN KEY ("declaredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemunerationPolicy" ADD CONSTRAINT "RemunerationPolicy_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemunerationRecord" ADD CONSTRAINT "RemunerationRecord_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemunerationRecord" ADD CONSTRAINT "RemunerationRecord_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "RemunerationPolicy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemunerationRecord" ADD CONSTRAINT "RemunerationRecord_approvingResolutionId_fkey" FOREIGN KEY ("approvingResolutionId") REFERENCES "Resolution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_remunerationRecordId_fkey" FOREIGN KEY ("remunerationRecordId") REFERENCES "RemunerationRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryObligation" ADD CONSTRAINT "RegulatoryObligation_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryRuleOverride" ADD CONSTRAINT "RegulatoryRuleOverride_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryRuleOverride" ADD CONSTRAINT "RegulatoryRuleOverride_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RegulatoryRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_capacityId_fkey" FOREIGN KEY ("capacityId") REFERENCES "Capacity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_agendaItemId_fkey" FOREIGN KEY ("agendaItemId") REFERENCES "AgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
