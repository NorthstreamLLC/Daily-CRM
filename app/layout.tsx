import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily CRM",
  description: "Lead pipeline and daily task queue",
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
      <body>{children}</body>
    </html>
  );
}
