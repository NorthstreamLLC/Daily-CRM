"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { Mark, PRODUCT_NAME } from "@/components/Brand";
import {
  BarChart,
  BookOpen,
  Calendar,
  CalendarCheck,
  LogOut,
  Menu,
  Shield,
  History,
  X,
} from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  icon: "today" | "calendar" | "book" | "stats" | "activity" | "admin";
};

const ICONS = {
  today: CalendarCheck,
  calendar: Calendar,
  book: BookOpen,
  stats: BarChart,
  activity: History,
  admin: Shield,
} as const;

/**
 * THE APPLICATION FRAME.
 *
 * A fixed dark sidebar on desktop; a top bar with a slide-in drawer on mobile.
 * The dark surface does one job: it separates the product's chrome from the
 * work, so the content area can stay almost entirely white and calm.
 *
 * Active state is derived from the URL, so it can never disagree with the page
 * actually shown.
 */
export function Sidebar({
  items,
  user,
  signOut,
  unreadCount,
}: {
  items: NavItem[];
  user: { name: string; code: string; role: string; today: string };
  signOut: () => Promise<void>;
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer on navigation - an open drawer covering the page you just
  // asked for is the most common mobile-nav mistake.
  useEffect(() => setOpen(false), [pathname]);

  // Escape closes the drawer, matching every other overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const nav = (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 px-3">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-control px-3 py-2 text-body font-medium",
              "transition-colors duration-fast",
              active
                ? "bg-shell-raised text-shell-ink"
                : "text-shell-ink-muted hover:bg-shell-raised/60 hover:text-shell-ink"
            )}
          >
            <Icon size={16} className={cn(active ? "text-shell-ink" : "text-shell-ink-muted")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const userBlock = (
    <div className="border-t border-shell-line px-3 py-3">
      <div className="flex items-center gap-2.5 px-2 pb-2.5">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                     bg-shell-raised text-caption font-semibold text-shell-ink"
        >
          {user.code}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-small font-medium text-shell-ink">{user.name}</p>
          <p className="truncate text-caption text-shell-ink-muted">
            {user.role === "admin" ? "Admin" : "Rep"} · {user.today}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <NotificationBell unread={unreadCount} />
        <ThemeToggle />
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5
                     text-small font-medium text-shell-ink-muted transition-colors
                     duration-fast hover:bg-shell-raised/60 hover:text-shell-ink"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="on-shell fixed inset-y-0 left-0 z-30 hidden w-60 flex-col
                   bg-shell lg:flex"
      >
        <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
          <Mark />
          <span className="text-h3 font-semibold tracking-tight text-shell-ink">
            {PRODUCT_NAME}
          </span>
        </div>
        {nav}
        {userBlock}
      </aside>

      {/* Mobile top bar */}
      <header
        className="on-shell sticky top-0 z-30 flex h-[52px] items-center gap-3 bg-shell
                   px-4 lg:hidden"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="inline-flex h-9 w-9 items-center justify-center rounded-control
                     text-shell-ink-muted transition-colors duration-fast
                     hover:bg-shell-raised hover:text-shell-ink"
        >
          <Menu size={18} />
        </button>
        <Mark size={26} />
        <span className="text-body font-semibold text-shell-ink">{PRODUCT_NAME}</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/50"
          />
          <div className="on-shell absolute inset-y-0 left-0 flex w-64 flex-col bg-shell shadow-overlay">
            <div className="flex items-center justify-between px-4 pb-4 pt-4">
              <div className="flex items-center gap-2.5">
                <Mark size={26} />
                <span className="text-body font-semibold text-shell-ink">{PRODUCT_NAME}</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-control
                           text-shell-ink-muted hover:bg-shell-raised hover:text-shell-ink"
              >
                <X size={16} />
              </button>
            </div>
            {nav}
            {userBlock}
          </div>
        </div>
      )}
    </>
  );
}
