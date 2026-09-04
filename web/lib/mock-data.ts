import {
  AgendaItem,
  Capacity,
  Company,
  ComplianceAlert,
  GovernanceConflictFlag,
  Meeting,
  Person,
  SelfDeclaredPosition,
} from "./types";

/**
 * Mock data for the flagship screens, standing in for the backend that
 * doesn't exist yet (AGENTS.md: "scaffold has no working logic yet"). Names
 * and scenario follow PRD.md Section 8's personas so the screens read as
 * bord's actual product, not a generic demo: Karim (Persona 2, portfolio
 * NED) is the signed-in person; Nile Leasing is the active company context,
 * an FRA-regulated NBFI leasing company (Nourhan's company, Persona 1).
 */

export const currentPerson: Person = {
  id: "person_karim",
  fullName: "Karim El-Sayed",
  email: "karim.elsayed@example.com",
  kycStatus: "verified",
  profileCompleteness: 75,
};

export const companies: Record<string, Company> = {
  company_nile: {
    id: "company_nile",
    legalNameEn: "Nile Leasing Co.",
    regulatoryProfile: "nbfi_leasing",
    isEgxListed: false,
  },
  company_delta: {
    id: "company_delta",
    legalNameEn: "Delta Bank",
    regulatoryProfile: "bank_cbe",
    isEgxListed: true,
  },
  company_cairo: {
    id: "company_cairo",
    legalNameEn: "Cairo Capital Holdings",
    regulatoryProfile: "jsc",
    isEgxListed: true,
  },
};

export const capacities: Capacity[] = [
  {
    id: "capacity_nile_ind",
    personId: "person_karim",
    companyId: "company_nile",
    companyName: "Nile Leasing Co.",
    roleType: "independent_director",
    roleLabel: "Independent Director",
    isCommitteeScoped: false,
  },
  {
    id: "capacity_delta_risk",
    personId: "person_karim",
    companyId: "company_delta",
    companyName: "Delta Bank",
    roleType: "committee_member",
    roleLabel: "Risk Committee Member",
    committeeName: "Risk Committee",
    isCommitteeScoped: true,
  },
  {
    id: "capacity_cairo_ned",
    personId: "person_karim",
    companyId: "company_cairo",
    companyName: "Cairo Capital Holdings",
    roleType: "non_executive_director",
    roleLabel: "Non-Executive Director",
    isCommitteeScoped: false,
  },
];

export function getCapacity(id: string): Capacity | undefined {
  return capacities.find((c) => c.id === id);
}

export const meetings: Meeting[] = [
  {
    id: "meeting_nile_q3",
    companyId: "company_nile",
    type: "board",
    title: "Q3 2026 Board Meeting",
    scheduledAt: "2026-09-14T10:00:00Z",
    status: "scheduled",
    quorumPresent: 5,
    quorumRequired: 5,
  },
];

export const agendaItems: AgendaItem[] = [
  {
    id: "item_financials",
    meetingId: "meeting_nile_q3",
    title: "Q3 financial reporting review",
    topicCategory: "ordinary",
    disclosureSensitivity: "non_material",
    requiresVote: false,
    votingThreshold: "N/A -- informational",
  },
  {
    id: "item_related_party",
    meetingId: "meeting_nile_q3",
    title: "Related-party lease renewal, Delta Logistics",
    topicCategory: "related_party",
    disclosureSensitivity: "material",
    requiresVote: true,
    votingThreshold: "Simple majority of directors present, related director recused",
    conflictCheckSummary:
      "One prior related-party resolution found (Q1 2025, Delta Logistics office lease). No AoA restriction beyond standard related-party disclosure applies.",
    conflictCheckAcknowledged: false,
    discussionGuideExcerpt:
      "Art. 74, Companies Law 159/1981: a board member is barred from voting on a resolution in which they have a personal interest. Precedent: Resolution #2025-Q1-07 approved a similar renewal 4-1.",
  },
  {
    id: "item_carried_over",
    meetingId: "meeting_nile_q3",
    title: "Follow-up: internal audit finding on lease-file documentation (carried over)",
    topicCategory: "other",
    disclosureSensitivity: "non_material",
    requiresVote: false,
    carriedOverFromMeetingId: "meeting_nile_q2",
    votingThreshold: "N/A -- informational",
  },
  {
    id: "item_remuneration",
    meetingId: "meeting_nile_q3",
    title: "Q4 committee premium adjustment",
    topicCategory: "remuneration",
    disclosureSensitivity: "material",
    requiresVote: true,
    votingThreshold: "Simple majority, each director recused from their own compensation item",
  },
];

export const complianceAlerts: ComplianceAlert[] = [
  {
    id: "alert_independence_ratio",
    companyId: "company_nile",
    ruleKey: "nbfi_independent_ratio",
    title: "Independent-director ratio below required 50% of non-executives",
    severity: "violation",
    status: "open",
    sourceCitation: "FRA Decree 100/2020",
    confidence: "high",
    triggeredAt: "2026-09-01T08:00:00Z",
  },
  {
    id: "alert_ga_notice",
    companyId: "company_nile",
    ruleKey: "ogm_notice_days",
    title: "Upcoming OGM notice window closing in 6 days",
    severity: "warning",
    status: "open",
    sourceCitation: "Companies Law 159/1981, Exec. Regs Art. 202/203 (day-count unconfirmed, see PRD.md Section 5)",
    confidence: "medium",
    triggeredAt: "2026-09-02T09:00:00Z",
  },
  {
    id: "alert_auditor_tenure",
    companyId: "company_nile",
    ruleKey: "nbfi_auditor_tenure_cap",
    title: "External auditor approaching 6-year tenure cap",
    severity: "warning",
    status: "acknowledged",
    sourceCitation: "FRA Decree 100/2020",
    confidence: "high",
    triggeredAt: "2026-08-20T08:00:00Z",
  },
];

export const conflictFlags: GovernanceConflictFlag[] = [
  {
    id: "flag_split_votes",
    companyId: "company_nile",
    type: "consistent_split_votes",
    severity: "warning",
    detectionNote:
      "The same 3 capacities have voted as a bloc against the same opposing 2 capacities on 4 of the last 5 contested resolutions.",
    relatedCapacityNames: ["Karim El-Sayed", "Mona Farid", "Youssef Adel"],
    relatedResolutionTitles: ["Res. #2026-Q2-03", "Res. #2026-Q2-05", "Res. #2026-Q3-01"],
    detectedAt: "2026-08-28T12:00:00Z",
    status: "open",
  },
  {
    id: "flag_mislabel",
    companyId: "company_nile",
    type: "mislabel_incident",
    severity: "high",
    detectionNote:
      "Capacity 'Amr Hosny' (independent_director, flagged independence status) voted with 2 shareholder_representative capacities against 2 independent capacities on Res. #2026-Q3-01. Advisory only -- a single matching vote, not confirmed misconduct.",
    relatedCapacityNames: ["Amr Hosny"],
    relatedResolutionTitles: ["Res. #2026-Q3-01"],
    detectedAt: "2026-09-03T10:00:00Z",
    status: "open",
  },
];

export const selfDeclaredPositions: SelfDeclaredPosition[] = [
  {
    id: "sdp_alex",
    companyNameFreetext: "Alexandria Portfolio Holdings",
    roleTypeFreetext: "Non-Executive Director",
    isBordTenantCompany: false,
    isCurrent: true,
  },
];
