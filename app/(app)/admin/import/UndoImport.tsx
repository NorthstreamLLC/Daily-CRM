"use client";

import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import { undoImport } from "../actions";

/**
 * Undo a whole import.
 *
 * Refuses once anyone has been contacted, because deleting a player who has
 * been worked would also delete work that counted towards someone's numbers.
 * The server does that check, not this button.
 */
export function UndoImport({ batchId, count }: { batchId: string; count: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  if (result?.message) {
    return <p className="text-caption text-success">{result.message}</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      {confirming ? (
        <div className="flex items-center gap-2">
          <span className="text-caption text-ink-muted">
            Delete {count.toLocaleString()} players?
          </span>
          <Button
            size="sm"
            variant="danger"
            loading={pending}
            onClick={() => start(async () => setResult(await undoImport(batchId)))}
          >
            Yes, remove
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)}>
          Undo import
        </Button>
      )}

      {result?.error && <Notice tone="danger">{result.error}</Notice>}
    </div>
  );
}
