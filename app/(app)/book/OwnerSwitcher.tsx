"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui";

/**
 * Admin-only: jump between people's books.
 *
 * Switching person clears the filters. Carrying a search for "jake" across to
 * a different book would show an empty table and look like the book was empty.
 */
export function OwnerSwitcher({
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
      aria-label="Whose book to view"
      className="w-auto min-w-[168px]"
      onChange={(e) => {
        const owner = e.target.value;
        const sp = new URLSearchParams();
        // Keep how many rows they like seeing; drop everything else.
        const size = params.get("size");
        if (size) sp.set("size", size);
        if (owner !== meId) sp.set("owner", owner);
        start(() => router.push(`/book?${sp.toString()}`));
      }}
    >
      {team.map((u) => (
        <option key={u.id} value={u.id}>
          {u.id === meId ? `${u.name} (you)` : `${u.name} (${u.code})`}
        </option>
      ))}
    </Select>
  );
}
