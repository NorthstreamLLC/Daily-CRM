"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { addMeeting, type MeetingState } from "./actions";
import { Button, Card, Field, Input, Notice, Textarea } from "@/components/ui";
import { Plus, X } from "@/components/icons";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending}>
      {pending ? "Adding…" : "Add meeting"}
    </Button>
  );
}

/**
 * The browser combines the date and time fields into a real instant before
 * submitting - it is the only party that reliably knows the rep's UTC offset
 * for that particular date, daylight saving included.
 */
export function AddMeeting({ defaultDate }: { defaultDate: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("10:00");
  const [state, formAction] = useFormState<MeetingState, FormData>(addMeeting, null);

  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lastMessage = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state?.message || state.message === lastMessage.current) return;
    lastMessage.current = state.message;
    formRef.current?.reset();
    setOpen(false);
    router.refresh();
  }, [state?.message, router]);

  if (!open) {
    return (
      <Button variant="primary" icon={<Plus size={15} />} onClick={() => setOpen(true)}>
        Add meeting
      </Button>
    );
  }

  const startsAtIso =
    date && time ? new Date(`${date}T${time}`).toISOString() : "";

  return (
    <Card className="mb-4">
      <form ref={formRef} action={formAction}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-h3 font-semibold text-ink">Add a meeting</h3>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-control
                       text-ink-subtle hover:bg-sunken hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_110px]">
          <Field label="What is it?" htmlFor="meeting-title">
            <Input
              id="meeting-title"
              name="title"
              required
              autoFocus
              placeholder="Call with VIP team"
            />
          </Field>

          <Field label="Date" htmlFor="meeting-date">
            <Input
              id="meeting-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>

          <Field label="Time" htmlFor="meeting-time">
            <Input
              id="meeting-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
            />
          </Field>

          <Field label="Notes" htmlFor="meeting-notes" className="sm:col-span-3">
            <Textarea id="meeting-notes" name="notes" rows={2} placeholder="optional" />
          </Field>
        </div>

        <input type="hidden" name="starts_at_iso" value={startsAtIso} />

        <div className="mt-3 flex items-center gap-2">
          <Submit />
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>

        {state?.error && (
          <div className="mt-3">
            <Notice tone="danger">{state.error}</Notice>
          </div>
        )}
      </form>
    </Card>
  );
}
