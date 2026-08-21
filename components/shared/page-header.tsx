import type { ReactNode } from "react";

/**
 * THE interior page header (gate ruling 2): the h1 speaks in the display
 * voice — Archivo, tracking-tight, 3xl growing to 4xl — one notch quieter
 * than marketing's bold (interiors are worn daily; semibold keeps the
 * voice without the shout). Replaces the seven byte-identical
 * `text-3xl font-semibold` default headings the investigation found.
 * Headline law applies: no terminal punctuation in `title`.
 */
export function PageHeader({
  title,
  children,
}: {
  title: string;
  /** Optional subhead — body copy, normal punctuation. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h1>
      {children ? (
        <p className="text-muted-foreground text-sm sm:text-base">{children}</p>
      ) : null}
    </header>
  );
}
