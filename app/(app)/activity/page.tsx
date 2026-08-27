import { redirect } from "next/navigation";
import { getMe } from "@/lib/queries";
import { getActivityByDay } from "@/lib/stats";
import { ActivityTable } from "./ActivityTable";

export const dynamic = "force-dynamic";

/**
 * ACTIVITY - who logged what, day by day.
 *
 * Built because a manager had no way to answer "what did the team do
 * yesterday" without opening thirteen Stats pages and reading each one in a
 * different window.
 *
 * SCOPE IS THE DATABASE'S DECISION.
 *   activity_by_day is security invoker, so Row Level Security answers it: an
 *   admin sees everyone, a rep sees themselves. This page does not check the
 *   role and filter - re-deriving scope in the app is what once showed every
 *   rep the whole company's funnel, and what made an admin's Today page list
 *   other people's work as their own.
 *
 *   It is also why reps get this page rather than being blocked from it. A rep
 *   who thinks a number is wrong can point at the day it went wrong, which is
 *   worth more than protecting them from their own history.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const me = await getMe();
  if (!me) redirect("/login");

  /* Fourteen by default: long enough to cover "last week" without anybody
     doing arithmetic, short enough to read in one screen. */
  const days = Math.min(Math.max(Number(searchParams.days) || 14, 1), 90);
  const rows = await getActivityByDay(days);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-h1 text-ink">Activity</h1>
        <p className="mt-1 text-body text-ink-muted">
          {me.role === "admin"
            ? "What each rep logged, day by day, in their own time zone."
            : "What you logged, day by day."}{" "}
          Counted from the same record every other figure is counted from, so a
          number here and a number on Stats cannot disagree.
        </p>
      </header>

      <ActivityTable rows={rows} days={days} isAdmin={me.role === "admin"} />
    </>
  );
}
