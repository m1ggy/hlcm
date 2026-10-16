import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMyToday } from "@/lib/actions/visits";
import { TodayView } from "@/components/visits/today-view";

// A Caregiver's home screen: the visit in progress (checklist, end visit,
// report a concern), then today's schedule with a Start button per visit.
// Built phone-first — this is what they open at the door.
export default async function TodayPage() {
  const session = await auth();
  if (session?.user?.role !== "CAREGIVER") redirect("/");

  const data = await getMyToday();
  const firstName = session.user.name?.split(" ")[0] ?? "";

  return (
    <div data-tour="today">
      <TodayView data={data} firstName={firstName} />
    </div>
  );
}
