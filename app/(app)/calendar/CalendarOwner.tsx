"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";

/**
 * Admin-only: whose calendar to look at.
 *
 * An admin who carries no players of their own saw an empty month and
 * reasonably read it as broken. The follow-ups exist - they belong to a rep.
 * Keeps the month you were looking at; drops the selected day, which almost
 * certainly has nothing on it in someone else's schedule.
 */
export function CalendarOwner({
  team,
  current,
  meId,
}: {
  team: { id: string; name: string; code: string }[];
  current: string;
  meId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  return (
    <Select
      value={current}
      disabled={pending}
      aria-label="Whose calendar to view"
      className="w-auto min-w-[168px]"
      onChange={(e) => {
        const owner = e.target.value;
        const sp = new URLSearchParams();
        const month = params.get("month");
        const view = params.get("view");
        if (month) sp.set("month", month);
        if (view) sp.set("view", view);
        if (owner !== meId) sp.set("owner", owner);
        start(() => router.push(`/calendar?${sp.toString()}`));
      }}
    >
      {team.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
          {t.id === meId ? " (you)" : ""}
        </option>
      ))}
    </Select>
  );
}
