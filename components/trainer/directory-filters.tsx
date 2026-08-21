import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  DEFAULT_DIRECTORY_RADIUS,
  DIRECTORY_RADIUS_MILES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  type Specialty,
} from "@/lib/validators/trainer";

/**
 * Directory search controls — a plain GET form, deliberately: filters live in
 * the URL, so every search is shareable, bookmarkable, and back-button-friendly
 * with zero client state (this stays a Server Component). Submitting rebuilds
 * /trainers?zip=…&radius=…&specialties=… and the page re-reads searchParams.
 *
 * Current values arrive as props (parsed from the URL by the page) and are
 * re-applied via default* attributes so the form reflects the active search.
 */
export function DirectoryFilters({
  zip,
  radiusMiles,
  specialties,
}: {
  zip: string;
  radiusMiles: number;
  specialties: Specialty[];
}) {
  return (
    <form
      method="get"
      action="/trainers"
      className="border-border bg-card flex flex-col gap-4 rounded-lg border p-4"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {/* ZIP — empty = browse mode; filled = proximity mode */}
        <div className="grid gap-2">
          <Label htmlFor="zip">Near ZIP code</Label>
          <Input
            id="zip"
            name="zip"
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            placeholder="37203"
            defaultValue={zip}
          />
        </div>

        {/* Radius — only meaningful with a ZIP; harmless without one */}
        <div className="grid gap-2">
          <Label htmlFor="radius">Within</Label>
          <NativeSelect
            id="radius"
            name="radius"
            defaultValue={radiusMiles || DEFAULT_DIRECTORY_RADIUS}
          >
            {DIRECTORY_RADIUS_MILES.map((miles) => (
              <option key={miles} value={miles}>
                {miles} miles
              </option>
            ))}
          </NativeSelect>
        </div>

        <Button type="submit" variant="action">Search</Button>
      </div>

      {/* Specialty filter — canonical enum order, same as everywhere.
          OR-semantics across selections (any match qualifies), deliberately:
          directory filters exist to BROADEN discovery, and AND would
          near-empty most multi-selects. The page's queries implement this
          with contains-any (`ov` on the RPC's array, `in` on assignments).

          COLLAPSED by default (ruling 9's cheap IA version): the 17-item
          grid was ~700px of taxonomy before the first result on mobile.
          A zero-JS <details> keeps this a Server Component GET form —
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
