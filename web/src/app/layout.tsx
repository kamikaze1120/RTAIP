import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "RTAIP: Real Time Analysis and Intelligence Platform", template: "%s | RTAIP" },
  description: "Investigate domains, IPs and organizations, and watch live global events on one map. Built on public and authorized data only.",
};

export const viewport: Viewport = { themeColor: "#060a10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
