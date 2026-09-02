interface AttendanceRow {
  mode: string;
  capacity: { role: string; user: { fullName: string } };
}

interface VoteRow {
  value: string;
  weight: number;
  voterCapacity: { user: { fullName: string } } | null;
}

interface ResolutionRow {
  title: string;
  status: string;
  requiredMajority: string;
  votes: VoteRow[];
}

interface AgendaItemRow {
  id: string;
  title: string;
  description: string | null;
  resolutions: ResolutionRow[];
}

interface MeetingRow {
  type: string;
  scheduledAt: Date;
  location: string | null;
  isVirtual: boolean;
}

/**
 * Auto-generates the minutes narrative from the meeting's own record —
 * agenda, attendance, and vote outcomes (spec section 6: "minutes are
 * auto-generated from the agenda, attendance, and vote records, then
 * circulated for review"). The Secretary can still edit before signature;
 * this is the starting draft, not a locked document.
 */
export function generateMinutesContent(
  entityName: string,
  meeting: MeetingRow,
  attendance: AttendanceRow[],
  agendaItems: AgendaItemRow[],
  extraNotes: Map<string, string>,
): { content: string; discussionPoints: Array<{ agendaItemId: string; title: string; notes: string }>; keywords: string[] } {
  const lines: string[] = [];
  lines.push(`Minutes of ${meeting.type.replace(/_/g, " ")} Meeting — ${entityName}`);
  lines.push(`Date: ${meeting.scheduledAt.toISOString().slice(0, 10)}`);
  lines.push(`${meeting.isVirtual ? "Held virtually" : `Location: ${meeting.location ?? "—"}`} (GAFI Decree 160/2020: virtual attendance is deemed valid physical attendance).`);
  lines.push("");
  lines.push("Attendance:");
  for (const a of attendance) {
    lines.push(`  - ${a.capacity.user.fullName} (${a.capacity.role.replace(/_/g, " ")}) — ${a.mode.replace(/_/g, " ")}`);
  }
  lines.push("");

  const discussionPoints: Array<{ agendaItemId: string; title: string; notes: string }> = [];
  const keywords = new Set<string>();

  agendaItems.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.title}`);
    keywords.add(item.title);
    const notes = extraNotes.get(item.id) ?? item.description ?? "No additional discussion recorded.";
    lines.push(`   Discussion: ${notes}`);
    discussionPoints.push({ agendaItemId: item.id, title: item.title, notes });

    for (const res of item.resolutions) {
      keywords.add(res.title);
      lines.push(`   Resolution — "${res.title}" (required: ${res.requiredMajority.replace(/_/g, " ")}): ${res.status}`);
      for (const v of res.votes) {
        if (!v.voterCapacity) continue;
        lines.push(`     • ${v.voterCapacity.user.fullName}: ${v.value}`);
      }
    }
    lines.push("");
  });

  return { content: lines.join("\n"), discussionPoints, keywords: Array.from(keywords) };
}
