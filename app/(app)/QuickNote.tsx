"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, cn } from "@/components/ui";
import { MessageSquare } from "@/components/icons";
import { updatePlayerField } from "./actions";

/**
 * A note without opening anything.
 *
 * Reps take notes constantly, and the only way to add one was: open the
 * detail panel, find the field, type, wait for autosave. Two clicks before
 * you can put down the thing you just heard on a call - which is exactly when
 * people stop bothering.
 *
 * Click, type, Enter. Escape cancels. Existing notes come up in the box so
 * this is also the fastest way to read one.
 */
export function QuickNote({
  playerId,
  notes,
  handle,
}: {
  playerId: string;
  notes: string | null;
  handle: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(notes ?? "");
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => setValue(notes ?? ""), [notes]);

  useEffect(() => {
    if (!open) return;
    areaRef.current?.focus();
    // Cursor at the end, so adding to an existing note needs no repositioning.
    const len = areaRef.current?.value.length ?? 0;
    areaRef.current?.setSelectionRange(len, len);

    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function save() {
    start(async () => {
      const result = await updatePlayerField(playerId, "notes", value);
      if (!result?.error) {
        setSaved(true);
        setOpen(false);
        setTimeout(() => setSaved(false), 1500);
        router.refresh();
      }
    });
  }

  return (
    <span ref={boxRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={notes ? `Note on ${handle}` : `Add a note to ${handle}`}
        title={notes ?? "Add a note"}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-control",
          "transition-colors duration-fast",
          open
            ? "bg-accent text-white btn-on-accent"
            : saved
              ? "text-success"
              : notes
                ? "text-accent hover:bg-accent-soft"
                : "text-ink-subtle hover:bg-sunken hover:text-ink"
        )}
      >
        <MessageSquare size={14} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-40 mt-1 w-[300px] rounded-card border
                     border-line-strong bg-surface p-2 shadow-card"
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            ref={areaRef}
            value={value}
            rows={3}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Note about ${handle}…`}
            aria-label={`Note about ${handle}`}
            className="w-full rounded-control border border-line-strong bg-canvas px-2 py-1.5
                       text-small text-ink outline-none focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setValue(notes ?? "");
                setOpen(false);
              }
              // Enter saves; Shift+Enter is a new line.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                save();
              }
            }}
          />
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-caption text-ink-subtle">Enter saves</span>
            <Button size="sm" variant="primary" loading={pending} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      )}
    </span>
  );
}
