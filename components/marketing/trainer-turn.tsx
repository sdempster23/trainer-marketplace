import { Reveal } from "@/components/marketing/reveal";

/**
 * The audience turn: the dark act opens by saying out loud who it is for.
 * This beat exists because a real-user review flagged audience confusion;
 * the light/dark split is now the page's constitution (owner act light,
 * trainer act dark) and this is its hinge. Keep it minimal: the scene
 * change does the work, the words just name it.
 */
export function TrainerTurnSection() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-6 pt-10 pb-4 sm:px-10 sm:pt-16">
      <Reveal className="flex flex-col gap-5">
        <h2
          data-line
          className="font-display text-5xl leading-none font-bold tracking-[-0.035em] sm:text-7xl"
        >
          For trainers.
        </h2>
        <p
          data-line
          className="text-muted-foreground max-w-xl text-lg leading-relaxed"
        >
          Everything above helps owners find you. The rest of this page is
          yours.
        </p>
      </Reveal>
    </section>
  );
}
