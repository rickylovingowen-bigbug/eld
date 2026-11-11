import type { Metadata, Viewport } from "next";
import { loadHome } from "@/lib/home/load";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memoir",
  description: "A private place to tell the story of growing up.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF8F5",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const home = await loadHome();
  return (
    <html lang={home.locale === "zh" ? "zh-Hans" : "en"}>
      <body>{children}</body>
    </html>
  );
}
