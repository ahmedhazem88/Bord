import { BOARD_ROLES } from "@bord/shared";
import type { AttendanceMode, GovernanceRole, MeetingType, Prisma } from "@prisma/client";

const DEFAULT_QUORUM_RULES: QuorumRules = {
  ogmQuorumPct: 25,
  egmFirstQuorumPct: 50,
  egmSecondQuorumPct: 25,
  boardQuorumFloor: 3,
};

/** Statutory default unless the entity has a confirmed AoA override on file (RegulatoryRuleOverride), mirroring how the Resolution Engine resolves effect basis. */
export async function resolveQuorumRules(tx: Prisma.TransactionClient, entityId: string): Promise<QuorumRules> {
  const overrides = await tx.regulatoryRuleOverride.findMany({
    where: { entityId, status: "CUSTOM_OVERRIDE", rule: { ruleKey: { in: ["OGM_QUORUM_PCT", "EGM_FIRST_QUORUM_PCT", "EGM_SECOND_QUORUM_PCT", "BOARD_QUORUM_FLOOR"] } } },
    include: { rule: true },
  });

  const rules = { ...DEFAULT_QUORUM_RULES };
  for (const o of overrides) {
    const value = Number(o.value);
    if (Number.isNaN(value)) continue;
    if (o.rule.ruleKey === "OGM_QUORUM_PCT") rules.ogmQuorumPct = value;
    if (o.rule.ruleKey === "EGM_FIRST_QUORUM_PCT") rules.egmFirstQuorumPct = value;
    if (o.rule.ruleKey === "EGM_SECOND_QUORUM_PCT") rules.egmSecondQuorumPct = value;
    if (o.rule.ruleKey === "BOARD_QUORUM_FLOOR") rules.boardQuorumFloor = value;
  }
  return rules;
}

/**
 * Context-based quorum calculator — spec section 6 / Epic 5 AC ("the
 * platform calculates quorum live during the meeting, including proxies
 * held, and blocks voting on any item if quorum is lost mid-meeting").
 *
 * "Context-based" means the rule applied depends on: meeting type (board /
 * committee / OGM / EGM), whether this is a second meeting (relaxed OGM
 * floor, lower EGM floor), and the entity's configured quorum percentages
 * (statutory default or AoA override, resolved by the caller via
 * RegulatoryRule the same way the Resolution Engine resolves effect basis).
 */

export interface RosterEntry {
  capacityId: string;
  role: GovernanceRole;
  sharePercentage: number | null;
}

export interface AttendanceEntry {
  capacityId: string;
  mode: AttendanceMode;
}

export interface QuorumRules {
  ogmQuorumPct: number; // AoA-set, 25-50% statutory range (spec: not less than 25%, not more than 50%)
  egmFirstQuorumPct: number; // >= 50% of capital
  egmSecondQuorumPct: number; // >= 25% of capital
  boardQuorumFloor: number; // 3, or AoA-set higher
}

export interface QuorumResult {
  met: boolean;
  basis: string;
  attendingCount: number;
  totalEligible: number;
  attendingCapitalPct: number | null;
  requiredCapitalPct: number | null;
}

const PRESENT_MODES: AttendanceMode[] = ["IN_PERSON", "VIRTUAL", "PROXY"];

function attendingCapacityIds(attendance: AttendanceEntry[]): Set<string> {
  return new Set(attendance.filter((a) => PRESENT_MODES.includes(a.mode)).map((a) => a.capacityId));
}

/** The eligible roster for a meeting's quorum calculation — board members, GA members, or committee members, as of now. */
export async function getMeetingRoster(
  tx: Prisma.TransactionClient,
  entityId: string,
  meetingType: MeetingType,
  committeeId: string | null,
): Promise<RosterEntry[]> {
  const now = new Date();
  if (meetingType === "COMMITTEE" && committeeId) {
    const memberships = await tx.committeeMembership.findMany({
      where: { committeeId, endDate: null, capacity: { active: true, verificationStatus: "APPROVED" } },
      include: { capacity: true },
    });
    return memberships.map((m) => ({ capacityId: m.capacityId, role: m.capacity.role, sharePercentage: null }));
  }

  const roles: GovernanceRole[] = meetingType === "OGM" || meetingType === "EGM" ? ["GA_MEMBER"] : [...BOARD_ROLES];
  const capacities = await tx.capacity.findMany({
    where: {
      entityId,
      role: { in: roles },
      active: true,
      verificationStatus: "APPROVED",
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gt: now } }],
    },
  });
  return capacities.map((c) => ({ capacityId: c.id, role: c.role, sharePercentage: c.sharePercentage ? Number(c.sharePercentage) : null }));
}

export function computeQuorum(
  meetingType: MeetingType,
  isSecondMeeting: boolean,
  roster: RosterEntry[],
  attendance: AttendanceEntry[],
  rules: QuorumRules,
): QuorumResult {
  const present = attendingCapacityIds(attendance);

  if (meetingType === "BOARD") {
    const board = roster.filter((r) => BOARD_ROLES.includes(r.role));
    const attendingBoard = board.filter((r) => present.has(r.capacityId));
    const hasChairPresence = attendingBoard.some((r) => r.role === "CHAIRMAN" || r.role === "VICE_CHAIRMAN" || r.role === "MANAGING_DIRECTOR");
    const floor = Math.max(rules.boardQuorumFloor, 3);
    const isMajority = attendingBoard.length * 2 > board.length;
    const met = attendingBoard.length >= floor && isMajority && hasChairPresence;
    const reasons: string[] = [];
    if (attendingBoard.length < floor) reasons.push(`fewer than the ${floor}-member floor`);
    if (!isMajority) reasons.push("not a majority of the board");
    if (!hasChairPresence) reasons.push("no Chairman, Vice Chairman, or MD present");
    return {
      met,
      basis: met
        ? `${attendingBoard.length} of ${board.length} board members present, including Chairman/Vice Chairman/MD`
        : `Not quorate: ${reasons.join("; ")}.`,
      attendingCount: attendingBoard.length,
      totalEligible: board.length,
      attendingCapitalPct: null,
      requiredCapitalPct: null,
    };
  }

  if (meetingType === "COMMITTEE") {
    const attendingCount = roster.filter((r) => present.has(r.capacityId)).length;
    const met = roster.length > 0 && attendingCount * 2 > roster.length;
    return {
      met,
      basis: met ? `${attendingCount} of ${roster.length} committee members present (majority)` : `Not quorate: ${attendingCount} of ${roster.length} present.`,
      attendingCount,
      totalEligible: roster.length,
      attendingCapitalPct: null,
      requiredCapitalPct: null,
    };
  }

  // OGM / EGM: quorum is by capital percentage present-or-represented-by-proxy, not headcount.
  const gaRoster = roster.filter((r) => r.role === "GA_MEMBER");
  const attendingCapitalPct = gaRoster.filter((r) => present.has(r.capacityId)).reduce((sum, r) => sum + (r.sharePercentage ?? 0), 0);
  const attendingCount = gaRoster.filter((r) => present.has(r.capacityId)).length;

  if (meetingType === "OGM") {
    if (isSecondMeeting) {
      return {
        met: true,
        basis: "Second OGM meeting — valid regardless of attendance (spec section 6; Companies Law Art. 67).",
        attendingCount,
        totalEligible: gaRoster.length,
        attendingCapitalPct,
        requiredCapitalPct: null,
      };
    }
    const met = attendingCapitalPct >= rules.ogmQuorumPct;
    return {
      met,
      basis: met
        ? `${attendingCapitalPct.toFixed(2)}% of capital present/represented, meeting the ${rules.ogmQuorumPct}% AoA-set threshold.`
        : `Not quorate: ${attendingCapitalPct.toFixed(2)}% of capital present, below the ${rules.ogmQuorumPct}% threshold. A second meeting would be valid regardless of attendance.`,
      attendingCount,
      totalEligible: gaRoster.length,
      attendingCapitalPct,
      requiredCapitalPct: rules.ogmQuorumPct,
    };
  }

  // EGM
  const requiredCapitalPct = isSecondMeeting ? rules.egmSecondQuorumPct : rules.egmFirstQuorumPct;
  const met = attendingCapitalPct >= requiredCapitalPct;
  return {
    met,
    basis: met
      ? `${attendingCapitalPct.toFixed(2)}% of capital present/represented, meeting the ${requiredCapitalPct}% ${isSecondMeeting ? "second-meeting" : "first-meeting"} threshold.`
      : `Not quorate: ${attendingCapitalPct.toFixed(2)}% of capital present, below the ${requiredCapitalPct}% ${isSecondMeeting ? "second-meeting" : "first-meeting"} threshold.`,
    attendingCount,
    totalEligible: gaRoster.length,
    attendingCapitalPct,
    requiredCapitalPct,
  };
}
