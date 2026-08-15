import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * THE empty-state and error-state objects (interior-polish addition B —
 * the arc's core primitive). The rule they encode: a ZERO state and a
 * FAILURE must never be confusable, and the distinction is STRUCTURAL,
 * not a color token.
 *
 *  - EmptyState: an intentional, welcoming object — a spacious dashed
 *    frame, centered, with room for a display-voice title and a real
 *    next step. "Nothing here yet" reads as an invitation.
 *  - ErrorState: a tight alert strip with an icon, role="alert". "We
 *    failed" reads as a fault being owned, never as ordinary quiet text.
 *
 * Copy rules from the gate: keep the good existing copy VERBATIM where
 * it exists; em-dashes are house style; no terminal punctuation only
 * applies to display headings (EmptyState titles), body copy keeps
 * normal sentences.
 */

export function EmptyState({
  title,
  action,
  compact = false,
  children,
}: {
  /** Display-voice headline (no terminal punctuation). Optional for
   * small in-card states where the body carries it alone. */
  title?: string;
  /** The next step — a Link or Button. Amber only if it's the view's
   * ONE primary action (usually it isn't; the map rules). */
  action?: ReactNode;
  /** In-card variant: tighter, left-aligned, for states living inside
   * another object (a booking card, a settings card). */
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "border-border rounded-lg border border-dashed",
        compact
          ? "flex flex-col items-start gap-2 px-4 py-3 text-left"
          : "flex flex-col items-center gap-2 px-6 py-10 text-center",
      )}
    >
      {title ? (
        <p className="font-display font-semibold tracking-tight">{title}</p>
      ) : null}
      <p className="text-muted-foreground max-w-sm text-sm">{children}</p>
      {action ? <div className={compact ? "" : "mt-2"}>{action}</div> : null}
    </div>
  );
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-4 py-3 text-sm"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
