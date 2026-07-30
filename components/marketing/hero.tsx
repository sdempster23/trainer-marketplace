import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { MARKETING_IMAGES } from "@/lib/marketing/image-manifest";

/**
 * Full-viewport opening scene. Static in phase 1 (identity gate); the GSAP
 * scroll layer arrives in the motion phase and wraps this without changing
 * its markup.
 *
 * Layout notes:
 * - min-h-[100dvh], never h-screen (iOS address-bar jump).
 * - Hero stack is exactly: headline, one sentence, two CTAs. Nothing else.
 *
 * Scrim contract (AA at the WORST point of ANY slotted image, not the
 * average): the text-floor layer guarantees a minimum combined black alpha
 * over the text zones even if the underlying pixel is pure white, so a
 * brighter field shot cannot break contrast.
 *   - body/CTA zone (bottom ~25% of viewport): combined alpha >= 0.84
 *     -> worst-case contrast >= 4.5:1 (AA normal text needs alpha >= 0.82)
 *   - headline zone (up to ~45%): combined alpha >= 0.72
 *     -> worst-case contrast >= 3:1 (AA large/bold text needs alpha >= 0.70)
 * If the scrim stops or text position change, re-run this math.
 *
 * Truthful-copy contract: every claim here is live today (search by
 * location/specialty/price, sport specialties, messaging, booking).
 */

/** Locked at the identity gate (Shane's wording, verbatim). */
const LOCKED_CONTEXT_SENTENCE =
  "Search professional trainers by location, specialty, and price — for every dog, from family pets to working K9s.";

const DEFAULT_HEADLINE = "The right trainer changes everything.";

type MarketingHeroProps = {
  headline?: string;
  /** Only the first hero on a page should claim LCP priority. */
  priorityImage?: boolean;
};

export function MarketingHero({
  headline = DEFAULT_HEADLINE,
  priorityImage = true,
}: MarketingHeroProps) {
  const { image, alt } = MARKETING_IMAGES.heroField;

  return (
    <section className="relative flex min-h-[100dvh] flex-col">
      <Image
        src={image}
        alt={alt}
        fill
        priority={priorityImage}
        placeholder="blur"
        sizes="100vw"
        className="object-cover object-[65%_35%]"
      />
      {/* Mood layer: keeps the photo cinematic without crushing the top. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/20 to-black/10"
      />
      {/* Text-floor layer: the AA guarantee documented above. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[65%] bg-gradient-to-t from-black/90 via-black/75 via-40% to-transparent"
      />

      {/* Overlay nav: wordmark + the one non-hero action. */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <span className="font-display text-lg font-bold tracking-tight text-white uppercase [font-stretch:115%]">
          PawMatch
        </span>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-white hover:bg-white/15 hover:text-white"
        >
          <Link href="/login">Log in</Link>
        </Button>
      </header>

      {/* Promise block, anchored to the quiet lower-left of the frame. */}
      <div className="relative z-10 mt-auto flex w-full max-w-[1400px] flex-col gap-6 self-center px-6 pb-16 sm:px-10 sm:pb-24">
        <h1 className="font-display max-w-4xl text-5xl leading-[0.95] font-bold tracking-[-0.035em] text-balance text-white sm:text-7xl lg:text-8xl">
          {headline}
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-balance text-white/90 sm:text-xl">
          {LOCKED_CONTEXT_SENTENCE}
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button asChild variant="action" size="lg" className="text-base">
            <Link href="/trainers">Find a trainer</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/40 bg-transparent text-base text-white hover:bg-white/15 hover:text-white"
          >
            <Link href="/sign-up">Join as a trainer</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
