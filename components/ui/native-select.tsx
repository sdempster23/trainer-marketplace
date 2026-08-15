import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A styled NATIVE `<select>` matching Input's field treatment — h-10, same
 * border/ring-offset/focus, so a select beside an Input in a grid row sits
 * at the same height with the same focus language (the misalignment the
 * investigation flagged in every form that hand-rolled this). Native on
 * purpose: mobile pickers beat a custom dropdown for these short lists,
 * and no new dependency (KISS).
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
