import Image, { type StaticImageData } from "next/image";

import { Reveal } from "@/components/marketing/reveal";
import { UI_CROPS } from "@/lib/marketing/ui-shots";

/**
 * Feature sections, split across the page's two acts (the constitution:
 * owner act light, trainer act dark, the transition IS the audience turn).
 * Each feature pairs its claim with a REAL-UI proof crop (truthful-imagery
 * contract; provenance in lib/marketing/ui-shots.ts): proofs, not
 * decoration.
 *
 * Copy is promise-level, never instruction-level, every claim shipped.
 * The no-new-logins framing is Shane's locked lead language.
 */

type Feature = {
  headline: string;
  body: string;
  crop: { image: StaticImageData; alt: string };
};

const OWNER_FEATURES: Feature[] = [
  {
    headline: "Search by what matters.",
    body: "Specialty, distance, and price up front. Working-dog credentials are first-class, not a footnote.",
    crop: UI_CROPS.search,
  },
  {
    headline: "Message first. Book when it fits.",
    body: "Talk it through before you commit. Request a time; the trainer confirms it.",
    crop: UI_CROPS.thread,
  },
];

const TRAINER_FEATURES: Feature[] = [
  {
    headline: "Your calendar runs the show.",
    body: "Bookings land in the calendar you already use, and your busy times block new requests. Both directions, automatically.",
    crop: UI_CROPS.calendar,
  },
  {
    headline: "No new accounts. No new logins.",
    body: "No payment platform in the middle. Clients pay the way they already do, and the money never touches PawMatch.",
    crop: UI_CROPS.payment,
  },
];

function FeatureRow({ feature, flip }: { feature: Feature; flip: boolean }) {
  return (
    <Reveal className="grid min-h-[55vh] items-center gap-10 py-10 lg:grid-cols-2 lg:gap-16">
      <div
        className={`flex flex-col gap-5 ${flip ? "lg:order-2" : ""}`}
        data-line
      >
        <h2 className="font-display max-w-xl text-4xl leading-none font-bold tracking-[-0.035em] text-balance sm:text-5xl lg:text-6xl">
          {feature.headline}
        </h2>
        <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
          {feature.body}
        </p>
      </div>
      {/* Quiet proof frame: real pixels, small presentation. */}
      <div
        data-line
        className={`mx-auto w-full max-w-sm ${flip ? "lg:order-1" : ""}`}
      >
        <div className="border-border/60 overflow-hidden rounded-xl border shadow-lg shadow-black/5">
          <Image
            src={feature.crop.image}
            alt={feature.crop.alt}
            sizes="(min-width: 1024px) 384px, 88vw"
            className="h-auto w-full"
          />
        </div>
      </div>
    </Reveal>
  );
}

function FeatureList({ features }: { features: Feature[] }) {
  return (
    <section className="mx-auto w-full max-w-[1200px] px-6 py-8 sm:px-10 sm:py-12">
      {features.map((feature, i) => (
        <FeatureRow key={feature.headline} feature={feature} flip={i % 2 === 1} />
      ))}
    </section>
  );
}

/** Act 1 (light): the owner's features. */
export function OwnerFeaturesSection() {
  return <FeatureList features={OWNER_FEATURES} />;
}

/** Dark act: the trainer's features, flowing into the finale. */
export function TrainerFeaturesSection() {
  return <FeatureList features={TRAINER_FEATURES} />;
}
