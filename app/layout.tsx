import type { Metadata } from "next";
import { Archivo, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

// Body stays Inter (crisp, neutral). Archivo is the display voice: large,
// tightly-tracked headlines; its width axis gives the wordmark its expanded
// cut without a second font family. Geist Mono is reserved for truthful
// numbers and data labels (sync intervals, prices, credentials).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  axes: ["wdth"],
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
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
    <html
      lang="en"
      className={`${inter.variable} ${archivo.variable} ${geistMono.variable}`}
    >
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
