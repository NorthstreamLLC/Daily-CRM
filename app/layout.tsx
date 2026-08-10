import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Gamba CRM",
  description: "Lead pipeline and daily task queue",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-slate-900">{children}</body>
    </html>
  );
}
