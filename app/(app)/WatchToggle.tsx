"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { setVipWatch } from "./actions";

/**
 * Put a player on the fallen-away list, or take them off.
 *
 * Detection only sees the numbers. A VIP rep who has just had a bad call knows
 * something the wager figures will not show for another fortnight, and this is
 * how that gets recorded.
 */
export function WatchToggle({
  playerId,
  watching,
  compact = false,
}: {
  playerId: string;
  watching: boolean;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant={watching ? "secondary" : "ghost"}
        loading={pending}
        onClick={(e) => {
          // The row is a link to the player; this button is not.
          e.preventDefault();
          e.stopPropagation();
          start(async () => {
            const result = await setVipWatch(playerId, !watching);
            setError(result.error ?? null);
            if (!result.error) router.refresh();
          });
        }}
      >
        {watching ? (compact ? "Unwatch" : "Stop watching") : "Watch"}
      </Button>
      {error && <span className="text-caption text-danger">{error}</span>}
    </span>
  );
}
