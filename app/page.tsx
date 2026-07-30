import { MarketingHero } from "@/components/marketing/hero";
import { HeroScene } from "@/components/marketing/hero-scene";
import { ProductAnglesSection } from "@/components/marketing/product-angles";
import { TransformationSection } from "@/components/marketing/transformation";

/**
 * PawMatch launch homepage (design arc, phase 2: hero + sections 1-2).
 * Sections 3-6 and 8 arrive in phase 3; section 7 (social proof) stays
 * scaffolded-hidden until real proof exists.
 *
 * TRUTHFUL-COPY CONTRACT (standing — every claim on this page MUST be true
 * TODAY; do not add a claim until the feature ships):
 *   CLAIMABLE (built + live): search trainers by location, specialty, and
 *     price; the working/sport-dog niche (PSA, Schutzhund, French Ring,
 *     PPD); message a trainer; request a booking that the trainer confirms;
 *     two-way calendar sync (bookings -> your calendar, your calendar ->
 *     blocked slots); the trainer sets how they take payment (off-platform).
 *   NOT CLAIMABLE until built: reviews / ratings / "verified" trainers;
 *     in-app or "secure" payment / Stripe / payouts; ANY social proof or
 *     volume claims. The contract extends to imagery: product shots are
 *     real captured screens (lib/marketing/ui-shots.ts), never mockups.
 *
 * VOICE (locked 2026-07-29, see docs/design/arc-notes.md): pet-owner-first,
 * warm competence; the sport/working niche is present but secondary.
 *
 * Static route: no auth, no per-user data, no DB reads. GSAP lives only in
 * the client leaf components this route imports; the booking funnel loads
 * none of it.
 */
export const metadata = {
  title: "PawMatch — find the trainer your dog needs",
  description:
    "Search professional dog trainers by location, specialty, and price — for every dog, from family pets to working K9s. Message, book, and keep it in the calendar you already use.",
};

export default function Home() {
  return (
    <main className="bg-background min-h-screen">
      <HeroScene>
        <MarketingHero />
      </HeroScene>

      <TransformationSection />

      <ProductAnglesSection />

      <footer className="border-border text-muted-foreground border-t px-6 py-8 text-center text-sm">
        PawMatch — dog owners and professional trainers.
      </footer>
    </main>
  );
}
