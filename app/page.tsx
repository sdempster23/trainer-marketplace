import { ComparisonSection } from "@/components/marketing/comparison";
import {
  OwnerFeaturesSection,
  TrainerFeaturesSection,
} from "@/components/marketing/features";
import { FinaleSection } from "@/components/marketing/finale";
import { MarketingHero } from "@/components/marketing/hero";
import { HeroScene } from "@/components/marketing/hero-scene";
import { ProductAnglesSection } from "@/components/marketing/product-angles";
import { SearchDemoSection } from "@/components/marketing/search-demo";
import { SocialProofSection } from "@/components/marketing/social-proof";
import { TrainerTurnSection } from "@/components/marketing/trainer-turn";
import { TransformationSection } from "@/components/marketing/transformation";
import { SiteFooter } from "@/components/shared/site-footer";

/**
 * PawMatch launch homepage.
 *
 * TWO-ACT CONSTITUTION (locked after real-user review flagged audience
 * confusion; see docs/design/arc-notes.md):
 *   ACT 1 (light) is the OWNER's journey: transformation, the product
 *   pan, owner features, the live search demo, the comparison.
 *   The light-to-dark transition IS the audience turn: the dark act
 *   opens with "For trainers." and everything after it speaks to
 *   trainers, flowing into the finale's ask.
 * Do not mix the audiences across the acts.
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
 *     volume claims; ANY pricing claims (pending the founding-offer
 *     decision; "founding" appears nowhere on the page). The contract
 *     extends to imagery: product shots are real captured screens and the
 *     demo video is a real recorded search (lib/marketing/ui-shots.ts).
 *
 * VOICE (locked): pet-owner-first, warm competence; the sport/working
 * niche is present but secondary.
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

      {/* ACT 1: the owner's journey (light). */}
      <TransformationSection />

      <ProductAnglesSection />

      <OwnerFeaturesSection />

      <SearchDemoSection />

      <ComparisonSection />

      {/* THE AUDIENCE TURN: one composed light-to-dark scene transition
          (pure CSS: survives no-JS and reduced motion), then the dark act
          speaks to trainers. text-foreground re-declares color inside the
          .dark scope. */}
      <div className="dark bg-background text-foreground">
        <div
          aria-hidden
          className="h-[45vh] bg-gradient-to-b from-[#fafafa] to-[#0a0a0b]"
        />
        <TrainerTurnSection />

        <TrainerFeaturesSection />

        <SocialProofSection />

        <FinaleSection />

        {/* Inside the dark scope so the footer closes the dark act (the
            two-act law allows exactly one theme transition per page). */}
        <SiteFooter />
      </div>
    </main>
  );
}
