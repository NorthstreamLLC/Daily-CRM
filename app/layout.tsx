import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily CRM",
  description: "Lead pipeline and daily task queue",

  /* This is an internal tool holding real player data. Nothing about it
     should ever appear in a search result, so every page asks not to be
     indexed, cached, or have a preview snippet taken. Belt and braces with
     robots.txt and the X-Robots-Tag header in next.config - a crawler that
     ignores one may still respect another. */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Applies the theme class before first paint. Runs inline in <head> because
 * doing it after hydration flashes the wrong theme on every load. An explicit
 * choice in localStorage wins; otherwise the device setting decides.
 */
const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Colours and type come from globals.css, which reads the design tokens. */}
      <body>
        {children}
        {/* Page views only - no cookies, no cross-site identifiers, and it
            reports nothing about who is signed in. */}
        <Analytics />
      </body>
    </html>
  );
}
