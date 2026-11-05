import type { Metadata } from "next";
import { THEME_INIT_SCRIPT } from "@/client/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefurbOps – refurbished electronics operations",
  description: "Repair/QC pipeline, marketplace stock sync and AI listings for a refurbished electronics business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script sets data-theme on <html> before React hydrates, so the attribute differs from the server HTML.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
