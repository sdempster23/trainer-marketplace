import type { Metadata } from "next";
import Image from "next/image";

import { MarketingHero } from "@/components/marketing/hero";
import { MARKETING_IMAGES } from "@/lib/marketing/image-manifest";

/**
 * Identity gate, round 2 (design arc, phase 1). Two decisions rendered for
 * visual choice:
 *   1. Promise line: five hero candidates on the real photo + scrim.
 *   2. Accent color: four alternatives + field-orange control, each as
 *      CTA-on-graphite and CTA-on-photo, with WCAG label math per swatch.
 * Review artifact, not a public page. On the arc cleanup list.
 */
export const metadata: Metadata = {
  title: "PawMatch — hero and accent variants",
  robots: { index: false, follow: false },
};

const PROMISE_VARIANTS = [
  { tag: "a", headline: "Every dog deserves the right trainer." },
  { tag: "b", headline: "Find the trainer your dog needs." },
  { tag: "c", headline: "Serious training. Every dog." },
  { tag: "d", headline: "Built for handlers. Built for trainers." },
  { tag: "e", headline: "The right trainer changes everything." },
] as const;

/**
 * Label colors below are the AA-compliant choice at button-label size
 * (16px medium is "normal text": needs 4.5:1; "large text" at 3:1 only
 * applies from 24px, or 18.66px bold).
 */
const ACCENT_CANDIDATES = [
  {
    tag: "control",
    name: "Field orange",
    hex: "#f14e07",
    label: "#0a0a0b",
    wcag: "black 5.3:1 AA. White 3.6:1, large-text only.",
  },
  {
    tag: "a",
    name: "Signal red",
    hex: "#e5484d",
    label: "#0a0a0b",
    wcag: "black 5.4:1 AA. White 3.9:1, large/bold only (common in the wild, but fails AA at button size).",
  },
  {
    tag: "b",
    name: "High-vis chartreuse",
    hex: "#a3e635",
    label: "#0a0a0b",
    wcag: "black 13.9:1 AAA. White 1.5:1, unusable.",
  },
  {
    tag: "c",
    name: "Electric blue",
    hex: "#3b82f6",
    label: "#0a0a0b",
    wcag: "black 5.7:1 AA. White 3.7:1, large-text only; darkening to #2563eb makes white pass at 5.2:1.",
  },
  {
    tag: "d",
    name: "Amber-gold",
    hex: "#f5a623",
    label: "#0a0a0b",
    wcag: "black 10.4:1 AAA. White 2.0:1, unusable.",
  },
] as const;

function SwatchButton({
  hex,
  label,
  children,
}: {
  hex: string;
  label: string;
  children: string;
}) {
  return (
    <span
      className="inline-flex h-11 items-center justify-center rounded-md px-8 text-base font-medium whitespace-nowrap"
      style={{ backgroundColor: hex, color: label }}
    >
      {children}
    </span>
  );
}

export default function VariantsPage() {
  const { image, alt } = MARKETING_IMAGES.heroField;

  return (
    <main className="bg-background min-h-screen">
      {/* 1. Promise line: full heroes, scroll through and compare. */}
      {PROMISE_VARIANTS.map(({ tag, headline }, i) => (
        <div key={tag} className="relative">
          <div className="absolute top-1/2 right-6 z-20 rounded-md bg-white/90 px-3 py-1.5 font-mono text-sm font-semibold text-black shadow-sm">
            {tag}
          </div>
          <MarketingHero headline={headline} priorityImage={i === 0} />
        </div>
      ))}

      {/* 2. Accent lab */}
      <section className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-24 sm:px-10">
        <h2 className="font-display text-3xl leading-none font-bold tracking-[-0.035em]">
          Accent candidates
        </h2>
        <p className="text-muted-foreground max-w-[65ch] text-base leading-relaxed">
          Each candidate rendered on graphite and on the hero photo, with the
          AA-compliant label color at button size. WCAG notes per swatch.
        </p>

        <div className="flex flex-col gap-8">
          {ACCENT_CANDIDATES.map((c) => (
            <div key={c.tag} className="flex flex-col gap-3">
              <p className="font-mono text-sm">
                {c.tag}. {c.name} {c.hex}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* On graphite (the dark scene) */}
                <div className="flex items-center justify-center rounded-xl bg-[#0a0a0b] p-10">
                  <SwatchButton hex={c.hex} label={c.label}>
                    Find a trainer
                  </SwatchButton>
                </div>
                {/* On the hero photo, over the real scrim floor */}
                <div className="relative flex items-end overflow-hidden rounded-xl p-10">
                  <Image
                    src={image}
                    alt={alt}
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    className="object-cover object-[65%_35%]"
                  />
                  <div
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20"
                  />
                  <div className="relative">
                    <SwatchButton hex={c.hex} label={c.label}>
                      Find a trainer
                    </SwatchButton>
                  </div>
                </div>
              </div>
              <p className="text-muted-foreground font-mono text-xs">
                {c.wcag}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
