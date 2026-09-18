import { recordTrainerSearch } from "@/app/(app)/trainers/actions";
import { Button } from "@/components/ui/button";
import { DirectoryLocationFields } from "@/components/trainer/directory-location-fields";
import type { Country } from "@/lib/location/countries";
import {
  SPECIALTIES,
  SPECIALTY_LABELS,
  type Specialty,
} from "@/lib/validators/trainer";

/**
 * Directory search controls. The form POSTs to recordTrainerSearch so a
 * click on Search is a trusted server event (not a /trainers pageview).
 * The action redirects to the same shareable GET URL the page already
 * reads, so bookmarks, chips, and the back button stay GET-only.
 *
 * Current values arrive as props (parsed from the URL by the page) and are
 * applied via default* attributes. default* only seeds a control at MOUNT —
 * the page renders this component with key={canonical search URL}, so any
 * change to the active search re-creates the form and the controls are
 * re-seeded. Without that key the controls went stale across chip / Clear /
 * widen / back-forward transitions and Search re-submitted the stale DOM
 * (tests/e2e/directory-filters.spec.ts pins all five shapes).
 */
export function DirectoryFilters({
  country,
  zip,
  radiusMiles,
  specialties,
}: {
  country: Country;
  zip: string;
  radiusMiles: number;
  specialties: Specialty[];
}) {
  return (
    <form
      action={recordTrainerSearch}
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end lg:grid-cols-[1fr_1fr_1fr_auto]">
        <DirectoryLocationFields country={country} zip={zip} radiusMiles={radiusMiles} />
        <Button type="submit" variant="action">Search</Button>
      </div>

      {/* Specialty filter — canonical enum order, same as everywhere.
          OR-semantics across selections (any match qualifies), deliberately:
          directory filters exist to BROADEN discovery, and AND would
          near-empty most multi-selects. The page's queries implement this
          with contains-any (`ov` on the RPC's array, `in` on assignments).

          COLLAPSED by default (ruling 9's cheap IA version): the specialty
          grid was ~700px of taxonomy before the first result on mobile.
          The specialty disclosure is a zero-JS <details> —
          closed content stays in the DOM, so checked boxes still submit.
          The at-a-glance visibility of ACTIVE filters lives in the page's
          chips summary, not in this disclosure. */}
      <details className="group">
        <summary className="text-muted-foreground hover:text-foreground -my-2 flex cursor-pointer list-none items-center gap-1 py-3 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="transition-transform group-open:rotate-90">
            ›
          </span>
          Specialties
          {specialties.length > 0 ? ` · ${specialties.length} selected` : ""}
        </summary>
      <fieldset className="mt-2 grid gap-2">
        <legend className="sr-only">Specialties (any of)</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SPECIALTIES.map((specialty) => (
            <label
              key={specialty}
              className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors"
            >
              <input
                type="checkbox"
                name="specialties"
                className="accent-primary"
                value={specialty}
                defaultChecked={specialties.includes(specialty)}
              />
              <span>{SPECIALTY_LABELS[specialty]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      </details>
    </form>
  );
}
