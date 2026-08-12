"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "@/components/icons";
import { deleteMeeting } from "./actions";

export function DeleteMeeting({ meetingId, title }: { meetingId: string; title: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`Remove meeting: ${title}`}
      onClick={() =>
        start(async () => {
          await deleteMeeting(meetingId);
          router.refresh();
        })
      }
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded
                 text-ink-subtle transition-colors duration-fast hover:bg-danger-soft
                 hover:text-danger disabled:opacity-40"
    >
      <X size={13} />
    </button>
  );
}
