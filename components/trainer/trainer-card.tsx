import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/shared/avatar";
import {
  METERS_PER_MILE,
  SPECIALTY_LABELS,
  type Specialty,
} from "@/lib/validators/trainer";

/**
 * The directory's normalized card shape — both read modes (browse PostgREST,
 * proximity RPC) map their rows into this, so the card never knows which mode
 * produced it. `distanceMeters` is the one mode-specific field: present only
 * in proximity mode, where it renders the distance badge.
 *
 * Cards link to /trainers/[id] via the STRETCHED-LINK pattern: the anchor is
 * the heading (so its accessible name is the trainer's name, not the whole
 * card's text read out as one giant link label) and an ::after overlay makes
 * the full card the hit target. Safe while the card contains no other
 * interactive elements; revisit if it gains any (the overlay would shadow
 * their clicks).
 */
export type TrainerCardData = {
  id: string;
  displayName: string;
  /** The stored profiles.avatar_url value, or null → initials tile. */
  avatarPath: string | null;
  bio: string | null;
  /** Already in canonical enum order — both modes guarantee it at the query. */
  specialties: Specialty[];
  serviceRadiusMeters: number | null;
  distanceMeters?: number;
};

export function TrainerCard({ trainer }: { trainer: TrainerCardData }) {
  const radiusMiles =
    trainer.serviceRadiusMeters !== null
      ? Math.round(trainer.serviceRadiusMeters / METERS_PER_MILE)
      : null;

  return (
    <Card className="hover:border-primary/40 relative transition-colors">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        {/* Avatar is a plain image, NOT a link — the stretched-link overlay
            below covers it, which is fine for a non-interactive leaf (the
            header comment's condition holds: still zero other interactive
            elements in the card). */}
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            profileId={trainer.id}
            avatarPath={trainer.avatarPath}
            displayName={trainer.displayName}
            size={48}
          />
          <CardTitle>
            <Link
              href={`/trainers/${trainer.id}`}
              className="after:absolute after:inset-0"
            >
              {trainer.displayName}
            </Link>
          </CardTitle>
        </div>
        {trainer.distanceMeters !== undefined ? (
          <Badge className="shrink-0">
            {(trainer.distanceMeters / METERS_PER_MILE).toFixed(1)} mi away
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {trainer.bio ? (
          <p className="text-muted-foreground line-clamp-2 text-sm">
            {trainer.bio}
          </p>
        ) : null}

        {trainer.specialties.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {trainer.specialties.map((specialty) => (
              <span
                key={specialty}
                className="bg-accent text-accent-foreground inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
              >
                {SPECIALTY_LABELS[specialty]}
              </span>
            ))}
          </div>
        ) : null}

        {radiusMiles !== null ? (
          <p className="text-muted-foreground text-xs">
            Travels up to {radiusMiles} miles
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
