"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlayerMessage } from "@/lib/book";
import { Button, Notice, Select, Textarea, cn } from "@/components/ui";
import { MessageSquare } from "@/components/icons";
import { deleteMessage, logMessage } from "./actions";
import { formatDateTime } from "@/lib/time";

const CHANNELS = [
  { value: "discord", label: "Discord" },
  { value: "telegram", label: "Telegram" },
  { value: "twitter", label: "X / Twitter" },
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "call", label: "Call" },
  { value: "other", label: "Other" },
];

/**
 * WHAT WAS SAID.
 *
 * The player's notes field is a scratchpad that gets overwritten. This is the
 * conversation: who said what, on which channel, when. A rep inheriting a book
 * needs that, not the last thing somebody happened to type.
 *
 * Logging an outbound message marks the player contacted, so the task clears
 * without a second click. Logging a reply does not - them answering is not us
 * doing the work.
 */
export function MessageLog({
  playerId,
  timezone,
  channelHint,
}: {
  playerId: string;
  timezone: string;
  /** Where this player usually gets contacted - their source, if we know it. */
  channelHint?: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<PlayerMessage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState(guessChannel(channelHint));
  const [direction, setDirection] = useState<"out" | "in">("out");
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);
  const [pending, start] = useTransition();

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/messages/${playerId}`);
      setMessages(response.ok ? await response.json() : []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  function submit() {
    if (!body.trim()) return;
    start(async () => {
      const res = await logMessage(playerId, body, channel, direction);
      setResult(res);
      if (!res.error) {
        setBody("");
        await load();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Compose */}
      <div className="rounded-card border border-line-strong bg-sunken/40 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "out" | "in")}
            aria-label="Direction"
            className="w-auto min-w-[112px]"
          >
            <option value="out">We sent</option>
            <option value="in">They replied</option>
          </Select>
          <Select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            aria-label="Channel"
            className="w-auto min-w-[118px]"
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          {direction === "out" && (
            <span className="text-caption text-ink-subtle">
              Marks them contacted
            </span>
          )}
        </div>

        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={
            direction === "out"
              ? "What you sent them…"
              : "What they said back…"
          }
          aria-label="Message"
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter to log, since this is typed dozens of times a day.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-caption text-ink-subtle">⌘/Ctrl + Enter</span>
          <Button
            size="sm"
            variant="primary"
            disabled={!body.trim()}
            loading={pending}
            onClick={submit}
          >
            Log message
          </Button>
        </div>

        {result?.error && (
          <div className="mt-2">
            <Notice tone="danger">{result.error}</Notice>
          </div>
        )}
      </div>

      {/* History */}
      {loading && <p className="text-small text-ink-muted">Loading messages…</p>}

      {!loading && messages && messages.length === 0 && (
        <p className="flex items-center gap-1.5 text-small text-ink-muted">
          <MessageSquare size={13} /> Nothing logged yet.
        </p>
      )}

      {!loading && messages && messages.length > 0 && (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "rounded-card border p-2.5",
                m.direction === "out"
                  ? "border-line-strong bg-surface"
                  : "border-accent/30 bg-accent-soft/40"
              )}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-caption text-ink-subtle">
                <span className="font-medium text-ink-muted">
                  {m.direction === "out" ? m.userName : "They said"}
                </span>
                <span>{channelLabel(m.channel)}</span>
                <span>{formatDateTime(m.occurred_at, timezone)}</span>
                {m.edited_at && <span>· edited</span>}
                <button
                  type="button"
                  className="ml-auto text-caption text-ink-subtle underline-offset-2
                             hover:text-danger hover:underline"
                  onClick={() =>
                    start(async () => {
                      await deleteMessage(m.id);
                      await load();
                      router.refresh();
                    })
                  }
                >
                  Delete
                </button>
              </div>
              <p className="whitespace-pre-wrap text-small text-ink">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function channelLabel(value: string) {
  return CHANNELS.find((c) => c.value === value)?.label ?? "Other";
}

/** A player from Discord is almost certainly contacted on Discord. */
function guessChannel(source?: string | null) {
  const s = (source ?? "").toLowerCase();
  const match = CHANNELS.find((c) => s.includes(c.value));
  return match?.value ?? "discord";
}
