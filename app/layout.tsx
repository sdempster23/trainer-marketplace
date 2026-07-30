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

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
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
      className={`${inter.variable} ${archivo.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
