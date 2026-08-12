"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";

/**
 * Admin-only: whose day, book or numbers to look at.
 *
 * One switcher shared by Today, Stats, Book and Calendar, because an admin
 * looking at a rep expects to stay on that rep as they move between pages -
 * and because four near-identical pickers is four places for them to drift.
 *
 * Every page that uses it scopes its queries by owner explicitly rather than
 * relying on Row Level Security. RLS answers "may I see this", which for an
 * admin is "everything" - a fine answer to the permission question and a
 * useless one for "what is on MY list today".
 */
export function ViewAs({
  team,
  current,
  meId,
  basePath,
  /** Params worth carrying across a switch; everything else is dropped. */
  keep = [],
}: {
  team: { id: string; name: string }[];
  current: string;
  meId: string;
  basePath: string;
  keep?: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  if (team.length < 2) return null;

  return (
    <Select
      value={current}
      disabled={pending}
      aria-label="Whose view to show"
      className="w-auto min-w-[168px]"
      onChange={(e) => {
        const owner = e.target.value;
        const next = new URLSearchParams();
        for (const key of keep) {
          const value = params.get(key);
          if (value) next.set(key, value);
        }
        if (owner !== meId) next.set("owner", owner);
        const qs = next.toString();
        start(() => router.push(qs ? `${basePath}?${qs}` : basePath));
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
