import Link from "next/link";

import { SiteFooter } from "@/components/shared/site-footer";

/**
 * Legal-document shell (/terms, /privacy): a quiet reading layout — wordmark
 * home link, measured prose column, shared footer. Static, no auth, no data.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-border border-b px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          PawMatch
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl px-6 py-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
