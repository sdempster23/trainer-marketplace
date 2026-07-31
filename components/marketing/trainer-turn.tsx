import { Reveal } from "@/components/marketing/reveal";

/**
 * The audience turn: the dark act opens by saying out loud who it is for.
 * This beat exists because a real-user review flagged audience confusion;
 * the light/dark split is now the page's constitution (owner act light,
 * trainer act dark) and this is its hinge. Ruled at the copy-refinement
 * pass: the dark turn and the two words carry it alone, no subhead.
 */
export function TrainerTurnSection() {
  return (
    <section
      id="for-trainers"
      className="mx-auto w-full max-w-[1400px] scroll-mt-10 px-6 pt-10 pb-4 sm:px-10 sm:pt-16"
    >
      <Reveal>
        <h2
          data-line
          className="font-display text-5xl leading-none font-bold tracking-[-0.035em] sm:text-7xl"
        >
          For trainers
        </h2>
      </Reveal>
    </section>
  );
}
