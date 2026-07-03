import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
 * Cards are TERMINAL this group — no link target. Trainer profile pages are a
 * later surface; when they exist, the card wraps in a Link and this comment
 * dies.
 */
export type TrainerCardData = {
  id: string;
  displayName: string;
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
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-lg">{trainer.displayName}</CardTitle>
        {trainer.distanceMeters !== undefined ? (
          <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium">
            {(trainer.distanceMeters / METERS_PER_MILE).toFixed(1)} mi away
          </span>
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
