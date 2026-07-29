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
 * - The photo fills the viewport; a bottom-heavy scrim guarantees text
 *   contrast regardless of which field shot ends up in the slot.
 * - Hero stack is exactly: headline, one sentence, two CTAs. Nothing else.
 *
 * Truthful-copy contract: every claim here is live today (search by
 * location/specialty/price, sport specialties, messaging, booking).
 */
export function MarketingHero() {
  const { image, alt } = MARKETING_IMAGES.heroField;

  return (
    <section className="relative flex min-h-[100dvh] flex-col">
      <Image
        src={image}
        alt={alt}
        fill
        priority
        placeholder="blur"
        sizes="100vw"
        className="object-cover object-[65%_35%]"
      />
      {/* Scrim: dark floor for the text block, clear upper frame for the dog. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10"
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
          The right trainer changes everything.
        </h1>
        <p className="max-w-xl text-lg leading-relaxed text-balance text-white/85 sm:text-xl">
          Search professional trainers by location, specialty, and price.
          From everyday obedience to protection sport.
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
