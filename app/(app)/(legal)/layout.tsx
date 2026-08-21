/**
 * Legal-document reading column (/terms, /privacy). Header and footer
 * come from the (app) shell; this nested layout only shapes the prose.
 */
export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      {children}
    </main>
  );
}
