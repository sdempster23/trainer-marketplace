import { AppHeader } from "@/components/shared/app-header";
import { SiteFooter } from "@/components/shared/site-footer";

/**
 * The app shell (interior-polish ruling 5): every product page gets the
 * slim header and the footer from ONE place — the investigation's
 * "islands strung on Back-to-X buttons" problem, fixed structurally.
 * Page <main>s use flex-1 (not min-h-screen) so the column fills the
 * viewport without the iOS 100vh jump; min-h-[100dvh] is the hero's own
 * pattern applied shell-wide.
 *
 * The marketing homepage (app/page.tsx) and its overlay nav live
 * OUTSIDE this group on purpose — that page is a composed scene with
 * its own laws (arc-notes), and its footer closes the dark act.
 */
export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
