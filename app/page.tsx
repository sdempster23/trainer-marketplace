import { ComparisonSection } from "@/components/marketing/comparison";
import { DevicesSection } from "@/components/marketing/devices";
import { FeaturesSection } from "@/components/marketing/features";
import { FinaleSection } from "@/components/marketing/finale";
import { MarketingHero } from "@/components/marketing/hero";
import { HeroScene } from "@/components/marketing/hero-scene";
import { ProductAnglesSection } from "@/components/marketing/product-angles";
import { SocialProofSection } from "@/components/marketing/social-proof";
import { TransformationSection } from "@/components/marketing/transformation";

/**
 * PawMatch launch homepage (design arc, phase 3: full scroll story).
 * Section 7 (social proof) stays scaffolded-hidden until real proof
 * exists (components/marketing/social-proof.tsx).
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

      <FeaturesSection />

      <DevicesSection />

      {/* The dark act (comparison + finale; the numbers section was cut at
          the phase-3 verdict: format fine, content not a buying reason).
          One composed light-to-dark scene transition per page (the
          tasteskill theme-switch exception): the band below fades the page
          floor to the dark scene over ~45vh of scroll. Pure CSS so the
          transition survives no-JS and reduced motion. Inside the .dark
          scope, text-foreground re-declares color (children otherwise
          inherit body's light-mode computed color). */}
      <div className="dark bg-background text-foreground">
        <div
          aria-hidden
          className="h-[45vh] bg-gradient-to-b from-[#fafafa] to-[#0a0a0b]"
        />
        <ComparisonSection />

        <SocialProofSection />

        <FinaleSection />

        <footer className="text-muted-foreground border-t border-white/10 px-6 py-8 text-center text-sm">
          PawMatch. Dog owners and professional trainers.
        </footer>
      </div>
    </main>
  );
}
