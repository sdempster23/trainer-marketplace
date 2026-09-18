"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  COUNTRIES, COUNTRY_LABELS, POSTAL_EXAMPLES, POSTAL_LABELS,
  distanceLabel, isCountry, type Country,
} from "@/lib/location/countries";
import { DIRECTORY_RADIUS_MILES, METERS_PER_MILE } from "@/lib/validators/trainer";

/** Country changes update field hints before submission. The parent form's
 * canonical-URL key still resets drafts on committed navigation. */
export function DirectoryLocationFields({ country, zip, radiusMiles }: {
  country: Country;
  zip: string;
  radiusMiles: number;
}) {
  const [selectedCountry, setSelectedCountry] = useState(country);
  const [location, setLocation] = useState(zip);

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="country">Country</Label>
        <NativeSelect id="country" name="country" value={selectedCountry} onChange={(event) => {
          if (isCountry(event.target.value)) {
            setSelectedCountry(event.target.value);
            setLocation("");
          }
        }}>
          {COUNTRIES.map((value) => <option key={value} value={value}>{COUNTRY_LABELS[value]}</option>)}
        </NativeSelect>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="zip">Near {selectedCountry === "US" ? "ZIP code" : POSTAL_LABELS[selectedCountry].toLowerCase()}</Label>
        <Input id="zip" name="zip"
          inputMode={selectedCountry === "US" ? "numeric" : "text"}
          pattern={selectedCountry === "US" ? "\\d{5}" : undefined}
          maxLength={selectedCountry === "US" ? 5 : selectedCountry === "CA" ? 7 : 8}
          placeholder={POSTAL_EXAMPLES[selectedCountry]}
          value={location} onChange={(event) => setLocation(event.target.value)}
          autoCapitalize="characters" spellCheck={false}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="radius">Within</Label>
        <NativeSelect id="radius" name="radius" defaultValue={radiusMiles}>
          {DIRECTORY_RADIUS_MILES.map((miles) => (
            <option key={miles} value={miles}>{distanceLabel(miles * METERS_PER_MILE, selectedCountry)}</option>
          ))}
        </NativeSelect>
      </div>
    </>
  );
}
