import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * THE status/count pill (interior-polish step 1). The investigation found
 * five hand-rolled recipes for this one object — four backgrounds, three
 * paddings, two radii — including a `bg-accent` chip invisible on the
 * `bg-muted` page it sat on. One shape, three voices:
 *
 *  - neutral: quiet metadata (booking status, distance, hours). Border-led
 *    so it reads on bg-card AND bg-muted (the invisibility fix).
 *  - strong: the one pill allowed to shout (unread "New").
 *  - destructive: real problems only — NOT day-offs or preferences (the
 *    red/green-semantics ruling in docs/design/arc-notes.md binds here).
 *
 * Specialty CHIPS (square, rounded-md) are a different object and keep
 * their shared recipe.
 */
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        neutral: "border-border text-muted-foreground border bg-background",
        strong: "bg-primary text-primary-foreground",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
