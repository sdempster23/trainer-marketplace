import Link from "next/link";

/**
 * Site-wide footer with the legal links (ToS + Privacy — the launch-gate
 * requirement: discoverable from every primary surface). Theme-token
 * styling only, so it renders correctly in both the light app surfaces
 * and the homepage's dark act (where it inherits the `.dark` scope).
 */
export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-border border-t px-6 py-8 text-center text-sm">
      <p>PawMatch. Dog owners and professional trainers.</p>
      <p className="mt-2 flex items-center justify-center gap-4">
        <Link href="/terms" className="hover:text-foreground underline-offset-4 transition-colors hover:underline">
          Terms of Service
        </Link>
        <Link href="/privacy" className="hover:text-foreground underline-offset-4 transition-colors hover:underline">
          Privacy Policy
        </Link>
      </p>
      <p className="mt-3 text-xs">
        UK postcode data adapted from{" "}
        <a href="https://www.geonames.org/" className="underline underline-offset-4">GeoNames</a>
        {" "}under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" className="underline underline-offset-4">CC BY 4.0</a>.
      </p>
    </footer>
  );
}
