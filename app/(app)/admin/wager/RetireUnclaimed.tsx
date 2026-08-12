"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";
import { retireUnclaimedWagerers } from "../actions";

/**
 * One-time cleanup: everyone wagering before the CRM existed.
 *
 * Behind a confirmation because it touches hundreds of rows, and worded to be
 * clear it hides rather than deletes - the money stays in every total.
 */
export function RetireUnclaimed({ count }: { count: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const router = useRouter();

  if (result?.message) {
    return <p className="text-caption text-success">{result.message}</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-caption text-ink-muted">
            Hide all {count.toLocaleString()} as pre-existing?
          </span>
          <Button
            size="sm"
            variant="primary"
            loading={pending}
            onClick={() =>
              start(async () => {
                setResult(await retireUnclaimedWagerers());
                setConfirming(false);
                router.refresh();
              })
            }
          >
            Yes, retire them
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)}>
          Mark all as pre-existing
        </Button>
      )}
      {result?.error && <Notice tone="danger">{result.error}</Notice>}
    </div>
  );
}
