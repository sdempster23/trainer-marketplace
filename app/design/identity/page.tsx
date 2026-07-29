import type { Metadata } from "next";

import { MarketingHero } from "@/components/marketing/hero";
import { Button } from "@/components/ui/button";
import { MARKETING_IMAGES } from "@/lib/marketing/image-manifest";

/**
 * Identity gate sample (design arc, phase 1). Review artifact, not a public
 * page: shows the proposed identity applied to the real hero, plus the type
 * ramp, palette, and action styles. Delete after the design arc ships.
 */
export const metadata: Metadata = {
  title: "PawMatch — identity sample",
  robots: { index: false, follow: false },
};

const GRAPHITE_RAMP = [
  { name: "background", hex: "#fafafa", className: "bg-background border" },
  { name: "muted", hex: "#f4f4f5", className: "bg-muted border" },
  { name: "border", hex: "#e4e4e7", className: "bg-border" },
  { name: "muted-fg", hex: "#52525b", className: "bg-[#52525b]" },
  { name: "primary", hex: "#131316", className: "bg-primary" },
  { name: "off-black", hex: "#0a0a0b", className: "bg-[#0a0a0b]" },
] as const;

export default function IdentitySamplePage() {
  return (
    <main className="bg-background min-h-screen">
      {/* The identity applied to the real thing: the homepage hero. */}
      <MarketingHero />

      <div className="mx-auto flex max-w-5xl flex-col gap-20 px-6 py-24 sm:px-10">
        {/* Type ramp */}
        <section className="flex flex-col gap-8">
          <h2 className="text-muted-foreground text-sm font-medium">
            Type. Archivo display, Inter body, Geist Mono data.
          </h2>
          <p className="font-display text-6xl leading-[0.95] font-bold tracking-[-0.035em] sm:text-8xl">
            Aa
          </p>
          <p className="font-display text-4xl leading-none font-bold tracking-[-0.035em] text-balance sm:text-6xl">
            Built for handlers. Built for trainers.
          </p>
          <p className="font-display text-2xl leading-tight font-semibold tracking-tight">
            Section headline, second level.
          </p>
          <p className="text-muted-foreground max-w-[65ch] text-base leading-relaxed">
            Body copy is Inter: crisp and quiet, so the display voice owns the
            volume. Comfortable measure, relaxed leading, generous white space
            between blocks.
          </p>
          <p className="font-mono text-sm tracking-tight">
            15-minute calendar sync. 0 double-books by design. $0 platform fees
            on sessions.
          </p>
        </section>

        {/* Palette */}
        <section className="flex flex-col gap-6">
          <h2 className="text-muted-foreground text-sm font-medium">
            Palette. Graphite monochrome, one accent: field orange, actions
            only.
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {GRAPHITE_RAMP.map((swatch) => (
              <div key={swatch.name} className="flex flex-col gap-2">
                <div className={`h-20 rounded-lg ${swatch.className}`} />
                <p className="text-muted-foreground font-mono text-xs">
                  {swatch.name}
                  <br />
                  {swatch.hex}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <div className="bg-action h-20 rounded-lg sm:w-1/2" />
            <p className="text-muted-foreground font-mono text-xs">
              action (field orange) #f14e07. The color of long lines, harness
              gear, and the one button that matters.
            </p>
          </div>
        </section>

        {/* Actions */}
        <section className="flex flex-col gap-6">
          <h2 className="text-muted-foreground text-sm font-medium">
            Actions. Orange is rationed: one primary action per view.
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="action" size="lg">
              Find a trainer
            </Button>
            <Button variant="default" size="lg">
              Primary (app surfaces)
            </Button>
            <Button variant="outline" size="lg">
              Secondary
            </Button>
            <Button variant="ghost" size="lg">
              Ghost
            </Button>
          </div>
        </section>

        {/* Dark scene preview */}
        {/* text-foreground re-declares color inside the .dark scope; without
            it, children inherit body's light-mode computed color. */}
        <section className="dark bg-background text-foreground flex flex-col gap-6 rounded-xl p-8 sm:p-12">
          <h2 className="text-muted-foreground text-sm font-medium">
            Dark scene. The page transitions light to dark once, as a composed
            move; the closing scene lives here.
          </h2>
          <p className="font-display text-foreground max-w-2xl text-3xl leading-none font-bold tracking-[-0.035em] sm:text-5xl">
            Free for founding trainers.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button variant="action" size="lg">
              Join as a trainer
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-white/40 bg-transparent text-white hover:bg-white/15 hover:text-white"
            >
              See how it works
            </Button>
          </div>
        </section>

        {/* Image slot summary for the gate review */}
        <section className="flex flex-col gap-4">
          <h2 className="text-muted-foreground text-sm font-medium">
            Image slots. All interim stock, licensed, mapped in
            lib/marketing/image-manifest.ts. Shoot spec:
            docs/design/image-manifest.md.
          </h2>
          <ul className="text-muted-foreground grid gap-2 font-mono text-xs sm:grid-cols-2">
            {Object.entries(MARKETING_IMAGES).map(([key, slot]) => (
              <li key={key} className="border-border rounded-md border p-3">
                {key}: {slot.image.width}x{slot.image.height}, {slot.status}
                <br />
                {slot.section}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
