import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RefurbOps – refurbished electronics operations",
  description: "Repair/QC pipeline, marketplace stock sync and AI listings for a refurbished electronics business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
