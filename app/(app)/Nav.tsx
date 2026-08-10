"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/components/ui";
import { BarChart, BookOpen, CalendarCheck, Menu, Shield, X } from "@/components/icons";

export type NavItem = { href: string; label: string; icon: "today" | "book" | "stats" | "admin" };

const ICONS = {
  today: CalendarCheck,
  book: BookOpen,
  stats: BarChart,
  admin: Shield,
} as const;

/**
 * Primary navigation.
 *
 * Active state is derived from the URL rather than passed in, so it can never
 * disagree with the page you are actually on. Below the small breakpoint the
 * links collapse into a disclosure button.
 */
export function Nav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Desktop */}
      <nav aria-label="Main" className="hidden sm:flex sm:items-center sm:gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-body font-medium",
                "transition-colors duration-fast",
                active
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-sunken hover:text-ink"
              )}
            >
              <Icon size={15} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-control
                   text-ink-muted transition-colors duration-fast hover:bg-sunken
                   hover:text-ink sm:hidden"
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>

      {/* Mobile panel */}
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Main"
          className="absolute inset-x-0 top-full z-20 border-b border-line bg-surface
                     p-2 shadow-raised sm:hidden"
        >
          {items.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-control px-3 py-2.5 text-body font-medium",
                  active ? "bg-accent-soft text-accent" : "text-ink hover:bg-sunken"
                )}
              >
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
