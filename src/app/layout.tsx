import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "VibeCheck — Security audits for AI-generated code",
    template: "%s · VibeCheck",
  },
  description:
    "A self-service security scanner for freelancers building with AI-generated code. Review automated findings, track fixes, and re-scan projects.",
};

export const viewport: Viewport = {
  themeColor: "#111a14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
