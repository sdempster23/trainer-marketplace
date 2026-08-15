import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Textarea matching Input's exact field treatment (border, ring-offset
 * focus, placeholder tone). Exists to retire the hand-rolled
 * `fieldClasses` strings the investigation found drifting in five files
 * — same ring, same colors, no per-file forks.
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
