import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_DIRECTORY_RADIUS,
  DIRECTORY_RADIUS_MILES,
  SPECIALTIES,
  SPECIALTY_LABELS,
  type Specialty,
} from "@/lib/validators/trainer";

const fieldClasses =
  "border-input focus-visible:ring-ring w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-2 focus-visible:outline-none";

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
          <select
            id="radius"
            name="radius"
            defaultValue={radiusMiles || DEFAULT_DIRECTORY_RADIUS}
            className={fieldClasses}
          >
            {DIRECTORY_RADIUS_MILES.map((miles) => (
              <option key={miles} value={miles}>
                {miles} miles
              </option>
            ))}
          </select>
        </div>

        <Button type="submit">Search</Button>
      </div>

      {/* Specialty filter — canonical enum order, same as everywhere.
          OR-semantics across selections (any match qualifies), deliberately:
          directory filters exist to BROADEN discovery, and AND would
          near-empty most multi-selects. The page's queries implement this
          with contains-any (`ov` on the RPC's array, `in` on assignments). */}
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Specialties (any of)
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SPECIALTIES.map((specialty) => (
            <label
              key={specialty}
              className="border-border hover:bg-accent/40 has-[:checked]:border-primary has-[:checked]:bg-accent/60 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm transition-colors"
            >
              <input
                type="checkbox"
                name="specialties"
                value={specialty}
                defaultChecked={specialties.includes(specialty)}
              />
              <span>{SPECIALTY_LABELS[specialty]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </form>
  );
}
