import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import "./globals.css";

// Body stays Inter (crisp, neutral). Archivo is the display voice: large,
// tightly-tracked headlines; its width axis gives the wordmark its expanded
// cut without a second font family. Geist Mono (truthful numbers / data
// labels) is deliberately NOT loaded here: root-layout fonts preload on
// every route and the mono only appears on specific sections, so those
// components instantiate it themselves (see app/design/identity/page.tsx).
// The H1 is the homepage LCP element and every font byte here delays it.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

// Weight-only variable font: the width axis roughly doubled the file and
// sat on the H1's (LCP) critical font chain. The expanded cut is only used
// by the wordmark, so it loads separately below as a tiny text subset.
// display: 'optional' makes the H1 (the LCP element) paint exactly once:
// if Archivo misses the first-paint window the metric-matched fallback
// ships and stays (no swap repaint, no LCP inflation). Fast connections
// and every cached visit render Archivo normally. Tradeoff, accepted at
// phase 4: the very slowest cold visits see the fallback headline.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "optional",
});

// Width-axis instance for the wordmark only. preload: false keeps it off
// the render-critical chain (it loads lazily when the wordmark's CSS
// requests it; the wordmark falls back to the main Archivo meanwhile).
const archivoWide = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo-wide",
  axes: ["wdth"],
  preload: false,
});

export const metadata: Metadata = {
  title: "PawMatch",
  description: "Find professional dog trainers near you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: browser extensions (Grammarly-class) inject
    // attributes on the root element before React hydrates, throwing a
    // hydration mismatch for real users. This suppresses attribute-level
    // mismatch warnings on <html> only, not for children.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${archivo.variable} ${archivoWide.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
