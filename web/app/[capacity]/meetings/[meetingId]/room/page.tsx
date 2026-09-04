import { notFound } from "next/navigation";
import { meetings, agendaItems } from "@/lib/mock-data";
import { RoomClient } from "./RoomClient";

export default function RoomPage({
  params,
}: {
  params: { capacity: string; meetingId: string };
}) {
  const meeting = meetings.find((m) => m.id === params.meetingId);
  if (!meeting) notFound();
  const items = agendaItems.filter((i) => i.meetingId === meeting.id);

  return <RoomClient meeting={meeting} items={items} capacityPath={params.capacity} />;
}
