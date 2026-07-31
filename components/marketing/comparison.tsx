import { Reveal } from "@/components/marketing/reveal";

/**
 * Section 6: the old way vs PawMatch. Text ledger on the dark act, no
 * scoring bars, no icons: the words carry it. PawMatch-side claims are
 * shipped features only.
 */
const ROWS = [
  {
    old: "Facebook threads and word of mouth",
    now: "Search by specialty, distance, and price",
  },
  {
    old: "Guessing from a logo and a phone number",
    now: "Bio, credentials, and services with real prices",
  },
  {
    old: "Text tag until a time finally sticks",
    now: "Request a time that is actually open. The trainer confirms",
  },
  {
    old: "Another app, another account, a cut off the top",
    now: "Pay the trainer directly. PawMatch never touches the money",
  },
] as const;

export function ComparisonSection() {
  return (
    <section className="mx-auto w-full max-w-[1100px] px-6 py-24 sm:px-10 sm:py-36">
      <Reveal className="flex flex-col gap-14">
        <h2
          data-line
          className="font-display text-4xl leading-none font-bold tracking-[-0.035em] text-balance sm:text-6xl"
        >
          Skip the old way
        </h2>
        {/* Restyled at the friend-feedback pass: pairs read as tight
            units, the old way fades, PawMatch carries full contrast plus
            an amber rule (the accent's one non-CTA appearance, sanctioned
            for this section). Deliberately NOT red/green: SaaS-matrix
            language, and a colorblind failure (decline recorded in
            arc-notes). Mobile stacks old-over-new inside each pair with
            wide gaps BETWEEN pairs, so couples stay visually coupled. */}
        <div className="flex flex-col gap-9 sm:gap-8">
          <div
            data-line
            className="text-muted-foreground hidden grid-cols-2 gap-8 text-sm font-medium sm:grid"
          >
            <p>The old way</p>
            <p>With PawMatch</p>
          </div>
          {ROWS.map((row) => (
            <div
              key={row.now}
              data-line
              className="flex flex-col gap-2.5 sm:grid sm:grid-cols-2 sm:items-center sm:gap-8"
            >
              <p className="text-muted-foreground/70 text-base leading-relaxed sm:text-lg">
                {row.old}
              </p>
              <p className="border-action border-l-2 pl-4 text-base leading-relaxed font-medium sm:text-lg">
                {row.now}
              </p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
