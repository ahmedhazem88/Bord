import { notFound } from "next/navigation";
import { meetings, agendaItems } from "@/lib/mock-data";
import { AgendaClient } from "./AgendaClient";

export default function AgendaPage({ params }: { params: { meetingId: string } }) {
  const meeting = meetings.find((m) => m.id === params.meetingId);
  if (!meeting) notFound();
  const items = agendaItems.filter((i) => i.meetingId === meeting.id);

  return <AgendaClient meeting={meeting} items={items} />;
}
