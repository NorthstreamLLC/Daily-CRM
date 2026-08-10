import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Gamba CRM",
  description: "Lead pipeline and daily task queue",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Colours and type come from globals.css, which reads the design tokens. */}
      <body>{children}</body>
    </html>
  );
}
