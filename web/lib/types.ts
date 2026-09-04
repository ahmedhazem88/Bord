/**
 * Frontend types mirroring ARCHITECTURE.md Section 4's entities, field names
 * kept in camelCase per AGENTS.md's naming convention (snake_case is the DB
 * column convention only). This is the mock-data shape for the flagship
 * screens; it is not the full entity set, only what these screens need.
 */

export type RoleType =
  | "chairman"
  | "md"
  | "executive_director"
  | "non_executive_director"
  | "independent_director"
  | "company_secretary"
  | "officer"
  | "committee_head"
  | "committee_member"
  | "head_of_internal_audit"
  | "mlro"
  | "compliance_officer"
  | "system_admin";

export interface Person {
  id: string;
  fullName: string;
  email: string;
  kycStatus: "not_started" | "pending" | "verified" | "failed";
  profileCompleteness: number; // 0-100, computed
}

export interface Company {
  id: string;
  legalNameEn: string;
  regulatoryProfile: "jsc" | "nbfi_leasing" | "nbfi_factoring" | "nbfi_microfinance" | "nbfi_insurance" | "nbfi_consumer_finance" | "bank_cbe";
  isEgxListed: boolean;
}

export interface Capacity {
  id: string;
  personId: string;
  companyId: string;
  companyName: string;
  roleType: RoleType;
  roleLabel: string;
  committeeName?: string;
  isCommitteeScoped: boolean;
}

export interface Meeting {
  id: string;
  companyId: string;
  type: "board" | "committee" | "ogm" | "egm";
  title: string;
  scheduledAt: string;
  status: "proposed" | "scheduled" | "in_progress" | "concluded";
  quorumPresent: number;
  quorumRequired: number;
}

export interface AgendaItem {
  id: string;
  meetingId: string;
  title: string;
  topicCategory: "ordinary" | "related_party" | "capital_change" | "dissolution_merger" | "remuneration" | "other";
  disclosureSensitivity: "material" | "non_material";
  requiresVote: boolean;
  carriedOverFromMeetingId?: string;
  votingThreshold: string;
  conflictCheckSummary?: string;
  conflictCheckAcknowledged?: boolean;
  discussionGuideExcerpt?: string;
}

export interface ComplianceAlert {
  id: string;
  companyId: string;
  ruleKey: string;
  title: string;
  severity: "violation" | "warning";
  status: "open" | "acknowledged" | "resolved";
  sourceCitation: string;
  confidence: "high" | "medium" | "low";
  triggeredAt: string;
}

export interface GovernanceConflictFlag {
  id: string;
  companyId: string;
  type: "consistent_split_votes" | "independent_vs_representative_opposition" | "mislabel_incident" | "other_manipulation_signal";
  severity: "info" | "warning" | "high";
  detectionNote: string;
  relatedCapacityNames: string[];
  relatedResolutionTitles: string[];
  detectedAt: string;
  status: "open" | "reviewed" | "dismissed";
}

export interface SelfDeclaredPosition {
  id: string;
  companyNameFreetext: string;
  roleTypeFreetext: string;
  isBordTenantCompany: boolean;
  isCurrent: boolean;
}
