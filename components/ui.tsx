/**
 * SHARED UI PRIMITIVES.
 *
 * Every button, input and badge in the app comes from here. The point is not
 * convenience - it is that there is exactly one of each, so a "primary button"
 * looks and behaves identically on every screen, including its hover, focus,
 * disabled and loading states.
 *
 * No "use client" directive: none of these hold state, so they work in server
 * components and become client components automatically when a client component
 * imports them.
 */
import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/** Minimal class joiner - avoids pulling in a dependency for string concat. */
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Button */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: ReactNode;
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-control font-medium " +
  "transition-colors duration-fast disabled:pointer-events-none disabled:opacity-45 " +
  "whitespace-nowrap";

const BUTTON_VARIANT = {
  primary: "bg-accent text-white btn-on-accent hover:bg-accent-hover",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-muted hover:bg-sunken hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
} as const;

const BUTTON_SIZE = {
  // 32px and 36px tall - both clear the 24px minimum, and md clears 44px with
  // its surrounding row padding on touch screens.
  sm: "h-8 px-2.5 text-small",
  md: "h-9 px-3.5 text-body",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full",
        "border-2 border-current border-r-transparent opacity-70",
        className
      )}
      aria-hidden="true"
    />
  );
}

/**
 * A grey block standing in for content that has not arrived.
 *
 * WHY THIS EXISTS AT ALL
 *   Every page here is force-dynamic, so a click cannot render until the
 *   server has finished querying. Without a loading boundary Next.js keeps the
 *   OLD page on screen, frozen, until the new one is completely ready - so a
 *   700ms render is indistinguishable from a broken app, and the honest
 *   report is "each click takes 2-3 seconds".
 *
 *   A skeleton does not make anything faster. It makes the app answer
 *   immediately, which is most of what "fast" means to the person clicking.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-line-strong/60", className)}
      aria-hidden="true"
    />
  );
}

/**
 * The shape of a list page while it loads: heading, then rows.
 *
 * Deliberately matches the real layout's proportions. A skeleton that settles
 * into a different shape than the content that replaces it reads as a glitch.
 */
export function ListSkeleton({ rows = 8, title }: { rows?: number; title?: string }) {
  return (
    <div role="status" aria-label={title ? `Loading ${title}` : "Loading"}>
      <span className="sr-only">Loading…</span>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>

      <div className="overflow-hidden rounded-card border border-line-strong bg-surface">
        <div className="border-b-2 border-line-heavy bg-sunken px-3 py-2">
          <Skeleton className="h-3 w-24" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-0",
              i % 2 === 1 && "bg-sunken/40"
            )}
          >
            <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
            <Skeleton className="h-4 flex-1 max-w-[180px]" />
            <Skeleton className="hidden h-4 w-24 sm:block" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Form fields */

const FIELD_BASE =
  "w-full rounded-control border border-line-strong bg-surface px-2.5 text-body " +
  "text-ink placeholder:text-ink-subtle transition-colors duration-fast " +
  "hover:border-ink-subtle focus:border-accent focus:outline-none " +
  "focus-visible:outline-none disabled:bg-sunken disabled:text-ink-muted";

/**
 * Forwards its ref, so a caller can focus it - the add form puts the cursor
 * back in the handle field after each player is created.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(FIELD_BASE, "h-9", className)} {...rest} />;
  }
);

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD_BASE, "h-9 cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_BASE, "py-2 leading-relaxed", className)} {...rest} />;
}

/** Label + control + optional hint, so form spacing is never hand-rolled. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-label font-medium text-ink-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-caption text-ink-subtle">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------- Badge */

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const BADGE_TONE: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-muted",
  accent: "bg-accent-soft text-accent",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
  className,
  title,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /* A badge short enough to fit a table cell is usually too short to explain
     itself. "4" next to a red triangle told nobody anything for a month. */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption font-medium",
        BADGE_TONE[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/* --------------------------------------------------------- Surfaces, empty */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        padded && "p-4",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Section heading with a count and optional right-hand actions. */
export function SectionHeader({
  title,
  count,
  hint,
  action,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="text-h3 font-semibold text-ink">{title}</h2>
          {count !== undefined && (
            <span className="tabular text-small text-ink-subtle">{count}</span>
          )}
        </div>
        {hint && <p className="mt-0.5 text-small text-ink-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Empty state. Always says what would appear here and what to do about it -
 * never just "no results".
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-sunken text-ink-subtle">
          {icon}
        </div>
      )}
      <p className="text-body font-medium text-ink">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-small text-ink-muted">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Inline result message. Colour is never the only signal - the words carry it. */
export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <p
      role="status"
      className={cn(
        "rounded-control px-3 py-2 text-small",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-warning-soft text-warning",
        (tone === "neutral" || tone === "accent") && "bg-sunken text-ink-muted"
      )}
    >
      {children}
    </p>
  );
}
