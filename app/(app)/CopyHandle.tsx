"use client";

import { useState } from "react";
import { cn } from "@/components/ui";
import { Check, MessageSquare } from "@/components/icons";

/**
 * The handle, as a one-click copy.
 *
 * A rep's loop is: read the handle, get it into Discord, message, come back,
 * tick. The "get it into Discord" half was drag-selecting small text with a
 * mouse - about four seconds a player, and genuinely error-prone on handles
 * like .yesbroo or v8nx2.0 where a stray character means messaging the wrong
 * person or nobody at all.
 *
 * At 250 players a day that is a quarter of an hour per rep, every day, spent
 * on nothing. This makes it one click.
 *
 * Falls back silently if the browser refuses clipboard access - the text is
 * still selectable, so nothing is lost.
 */
export function CopyHandle({
  handle,
  className,
}: {
  handle: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    // The row itself opens the detail panel; copying should not.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(handle);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* Clipboard blocked - leave the text selectable and say nothing. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${handle}`}
      aria-label={`Copy ${handle} to clipboard`}
      className={cn(
        "group inline-flex max-w-full items-center gap-1 rounded px-1 -mx-1",
        "text-left transition-colors duration-fast hover:bg-accent-soft",
        className
      )}
    >
      <span className="truncate font-medium text-ink">{handle}</span>
      {copied ? (
        <Check size={12} className="shrink-0 text-success" />
      ) : (
        <Copy className="shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

/** Two overlapping rectangles - the universal copy glyph. */
function Copy({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/**
 * Open the player where they actually are.
 *
 * Only for platforms with a real profile URL. Discord has no reliable
 * username-to-DM link, so a Discord player gets the copy button alone rather
 * than a link that half-works - a broken shortcut is worse than none.
 */
export function OpenProfile({
  handle,
  source,
}: {
  handle: string;
  source: string | null;
}) {
  const url = profileUrl(handle, source);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open ${handle} on ${source}`}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded
                 text-ink-subtle transition-colors hover:bg-sunken hover:text-accent"
    >
      <MessageSquare size={12} />
      <span className="sr-only">Open profile</span>
    </a>
  );
}

function profileUrl(handle: string, source: string | null) {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return null;

  switch ((source ?? "").toLowerCase()) {
    case "twitter":
    case "x":
      return `https://x.com/${encodeURIComponent(clean)}`;
    case "instagram":
      return `https://instagram.com/${encodeURIComponent(clean)}`;
    case "telegram":
      return `https://t.me/${encodeURIComponent(clean)}`;
    default:
      return null;
  }
}
