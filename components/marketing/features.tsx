import { Reveal } from "@/components/marketing/reveal";

/**
 * Section 3: key features, one at a time. Each feature gets its own
 * viewport moment (tall rows), typographic only: section 2 already showed
 * the screens, so this section is the claims, not the pixels.
 *
 * Copy is promise-level, never instruction-level (walkthrough ruling), and
 * every claim is shipped: specialty/distance/price search, messaging,
 * request-confirm booking, two-way calendar bridge (M15/M16), off-platform
 * payment. The no-new-logins framing is Shane's locked lead language for
 * calendar + payment.
 */
const FEATURES = [
  {
    headline: "Search by what matters.",
    body: "Specialty, distance, and price up front. Working-dog credentials are first-class, not a footnote.",
  },
  {
    headline: "Message first. Book when it fits.",
    body: "Talk it through before you commit. Request a time; the trainer confirms it.",
  },
  {
    headline: "Your calendar runs the show.",
    body: "Bookings land in the calendar you already use, and your busy times block new requests. Both directions, automatically.",
  },
  {
    headline: "No new accounts. No new logins.",
    body: "No payment platform in the middle. Clients pay the way they already do, and the money never touches PawMatch.",
  },
] as const;

export function FeaturesSection() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-6 py-16 sm:px-10 sm:py-24">
      {FEATURES.map((feature, i) => (
        <Reveal
          key={feature.headline}
          className={`flex min-h-[55vh] flex-col justify-center gap-5 ${
            i % 2 === 1 ? "items-end text-right" : ""
          }`}
        >
          <h2
            data-line
            className="font-display max-w-3xl text-4xl leading-none font-bold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl"
          >
            {feature.headline}
          </h2>
          <p
            data-line
            className="text-muted-foreground max-w-xl text-lg leading-relaxed"
          >
            {feature.body}
          </p>
        </Reveal>
      ))}
    </section>
  );
}
