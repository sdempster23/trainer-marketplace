import { z } from "zod";

import type { Currency } from "@/lib/money";
import { displayNameSchema } from "@/lib/validators/profile";
import { COUNTRIES, postalArea, postalError, type Country } from "@/lib/location/countries";
import { Constants } from "@/types/supabase";

/**
 * The trainer specialties, in canonical (declaration) order — DERIVED from
 * the generated Database enum, so regenerating types regenerates this list. It
 * cannot drift from the DB `trainer_specialty` enum, unlike a hand-copied array.
 *
 * Both the onboarding form (option list) and the zod validator (accepted values)
 * read from here; a value not in the DB enum would be rejected at insert. Same
 * match-the-DB discipline as SIGNUP_ROLES in ./auth.
 */
export const SPECIALTIES = Constants.public.Enums.trainer_specialty;

export type Specialty = (typeof SPECIALTIES)[number];

/** Bio bounds — floor forces a real sentence; cap defends the unbounded `text`
 * column (no DB CHECK) against abuse, same spirit as the messages 4000 cap. */
export const BIO_MIN_LENGTH = 20;
export const BIO_MAX_LENGTH = 2000;

// Display-name bounds + schema now live in ./profile (role-universal since
// the /account name section); onboardingSchema composes displayNameSchema.

/**
 * Supported IANA timezones offered at onboarding. `timezone` interprets the
 * trainer's availability hours, so a wrong zone breaks booking times — hence a
 * country-specific choices that trainers confirm, rather than a postal-code
 * guess. Correct clock rules also depend on the bundled runtime timezone data.
 */
const US_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
] as const;

const CA_TIMEZONES = [
  "America/St_Johns",
  "America/Halifax",
  "America/Moncton",
  "America/Goose_Bay",
  "America/Blanc-Sablon",
  "America/Toronto",
  "America/Iqaluit",
  "America/Atikokan",
  "America/Winnipeg",
  "America/Rankin_Inlet",
  "America/Resolute",
  "America/Regina",
  "America/Swift_Current",
  "America/Edmonton",
  "America/Cambridge_Bay",
  "America/Inuvik",
  "America/Vancouver",
  "America/Dawson_Creek",
  "America/Fort_Nelson",
  "America/Creston",
  "America/Whitehorse",
  "America/Dawson",
] as const;

export const TRAINER_TIMEZONES = [
  ...US_TIMEZONES,
  ...CA_TIMEZONES,
  "Europe/London",
] as const;

export type TrainerTimezone = (typeof TRAINER_TIMEZONES)[number];

export function timezonesForCountry(country: Country): readonly TrainerTimezone[] {
  return country === "US" ? US_TIMEZONES : country === "CA" ? CA_TIMEZONES : ["Europe/London"];
}

export function defaultTimezoneForCountry(country: Country): TrainerTimezone {
  return country === "US" ? "America/Chicago" : country === "CA" ? "America/Toronto" : "Europe/London";
}

/** Meters per statute mile — THE conversion constant for the trainer domain
 * (the DB stores meters; forms and display speak miles). Single definition;
 * import it rather than redeclaring (the investigation flagged copies drifting
 * into actions/pages). */
export const METERS_PER_MILE = 1609.344;

/** Service-radius options in MILES (the form's choices). Converted to meters in
 * the action. 100mi ≈ 160,934m, within the DB CHECK cap of 200,000m (~124mi). */
export const SERVICE_RADIUS_MILES = [10, 25, 50, 100] as const;

export type ServiceRadiusMiles = (typeof SERVICE_RADIUS_MILES)[number];

/** Directory search-radius options in MILES — a superset of the trainer-side
 * SERVICE_RADIUS_MILES. 250 exists deliberately: regional working-dog trainers
 * with 100 mi service radii are real in this niche, and an owner 150 mi out
 * still wants to find them. */
export const DIRECTORY_RADIUS_MILES = [10, 25, 50, 100, 250] as const;

export type DirectoryRadiusMiles = (typeof DIRECTORY_RADIUS_MILES)[number];

/** Default search radius when none is chosen — wide enough to show a metro
 * cluster, narrow enough that distance still means something. */
export const DEFAULT_DIRECTORY_RADIUS: DirectoryRadiusMiles = 25;

/**
 * Onboarding input. Validate the entire country-specific postal format before
 * reducing it to a coarse area. The action's offline resolver then checks
 * whether that area exists in our supported location data.
 */
const listingFields = z.object({
  displayName: displayNameSchema,
  bio: z
    .string()
    .trim()
    .min(BIO_MIN_LENGTH, "Tell owners a bit about yourself — at least a sentence.")
    .max(BIO_MAX_LENGTH, `Keep your bio under ${BIO_MAX_LENGTH} characters.`),
  specialties: z
    .array(z.enum(SPECIALTIES))
    .min(1, "Pick at least one specialty."),
  country: z.enum(COUNTRIES).default("US"),
  zip: z.string().trim().max(12, "Check your postal code."),
  serviceRadiusMiles: z.coerce
    .number()
    .refine(
      (v): v is ServiceRadiusMiles =>
        (SERVICE_RADIUS_MILES as readonly number[]).includes(v),
      "Choose a service radius.",
    ),
  timezone: z.enum(TRAINER_TIMEZONES, "Choose your timezone."),
});

export const onboardingSchema = listingFields.transform((value, context) => {
  const area = postalArea(value.zip, value.country);
  if (!area) {
    context.addIssue({ code: "custom", path: ["zip"], message: postalError(value.country) });
    return z.NEVER;
  }
  return { ...value, zip: area };
});

/**
 * Listing EDIT (interior-polish flow ruling #1 — the flow that makes
 * onboarding's "You can edit it later." true). Same fields minus the
 * display name (edited on /account). Blank postal input keeps the current
 * service area, unless the country changes (checked in the action). Legacy
 * rows have no saved postal area to prefill. '' → undefined via the transform.
 */
export const editListingSchema = listingFields
  .omit({ displayName: true })
  .transform((value, context) => {
    if (!value.zip) return { ...value, zip: undefined };
    const area = postalArea(value.zip, value.country);
    if (!area) {
      context.addIssue({ code: "custom", path: ["zip"], message: postalError(value.country) });
      return z.NEVER;
    }
    return { ...value, zip: area };
  });

export type EditListingInput = z.infer<typeof editListingSchema>;

export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ---------------------------------------------------------------------------
// Display labels — shared by the onboarding form (options) and the listing page
// (rendering). Typed as exhaustive Records so adding an enum value forces a
// label here (compile error until filled) — the labels can't silently fall
// behind the enum.
// ---------------------------------------------------------------------------
export const SPECIALTY_LABELS: Record<Specialty, string> = {
  puppy: "Puppy",
  basic_obedience: "Basic Obedience",
  competition_obedience: "Competition Obedience",
  behavioral: "Behavioral",
  reactivity: "Reactivity",
  aggression: "Aggression",
  service_dog: "Service Dog",
  protection_sport_psa: "Protection Sport (PSA)",
  protection_sport_schutzhund_igp: "Schutzhund / IGP",
  protection_sport_french_ring: "French Ring",
  protection_sport_mondio_ring: "Mondio Ring",
  personal_protection: "Personal Protection",
  decoy_work: "Decoy Work",
  agility: "Agility",
  scent_work: "Scent Work",
  barn_hunt: "Barn Hunt",
  tracking: "Tracking",
  gun_dog: "Gun Dog",
};

export const TIMEZONE_LABELS: Record<TrainerTimezone, string> = {
  "America/New_York": "Eastern (New York)",
  "America/Chicago": "Central (Chicago)",
  "America/Denver": "Mountain (Denver)",
  "America/Los_Angeles": "Pacific (Los Angeles)",
  "America/Anchorage": "Alaska (Anchorage)",
  "Pacific/Honolulu": "Hawaii (Honolulu)",
  "America/Phoenix": "Arizona (Phoenix, no DST)",
  "America/St_Johns": "Newfoundland (St. John's)",
  "America/Halifax": "Atlantic (Halifax)",
  "America/Moncton": "New Brunswick (Moncton)",
  "America/Goose_Bay": "Labrador (Goose Bay)",
  "America/Blanc-Sablon": "Lower North Shore (Blanc-Sablon)",
  "America/Toronto": "Eastern (Toronto / Montréal)",
  "America/Iqaluit": "Eastern Nunavut (Iqaluit)",
  "America/Atikokan": "Atikokan (no DST)",
  "America/Winnipeg": "Central (Winnipeg)",
  "America/Rankin_Inlet": "Central Nunavut (Rankin Inlet)",
  "America/Resolute": "Resolute",
  "America/Regina": "Saskatchewan (Regina)",
  "America/Swift_Current": "Saskatchewan (Swift Current)",
  "America/Edmonton": "Alberta (Edmonton)",
  "America/Cambridge_Bay": "Western Nunavut (Cambridge Bay)",
  "America/Inuvik": "Northwest Territories (Inuvik)",
  "America/Vancouver": "British Columbia (Vancouver)",
  "America/Dawson_Creek": "British Columbia (Dawson Creek)",
  "America/Fort_Nelson": "British Columbia (Fort Nelson)",
  "America/Creston": "British Columbia (Creston)",
  "America/Whitehorse": "Yukon (Whitehorse)",
  "America/Dawson": "Yukon (Dawson)",
  "Europe/London": "United Kingdom (London)",
};

/** Sensible default zone for the Nashville-area core market (Central). The
 * trainer confirms/changes it — we don't derive it (see TRAINER_TIMEZONES). */
export const DEFAULT_TIMEZONE: TrainerTimezone = "America/Chicago";

// ---------------------------------------------------------------------------
// Services — the trainer_services write surface.
// ---------------------------------------------------------------------------

/**
 * The 3 session types, derived from the generated Database enum — the
 * SPECIALTIES pattern: regenerating types regenerates this list, so it cannot
 * drift from the DB `session_type` enum.
 */
export const SESSION_TYPES = Constants.public.Enums.session_type;

export type SessionType = (typeof SESSION_TYPES)[number];

/** Exhaustive Record — adding an enum value breaks the build until labeled. */
export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  in_home: "In-home",
  at_trainer_location: "At trainer's location",
  virtual: "Virtual",
};

/** Name/description bounds — zod supplies the caps the DB columns don't have
 * (both are uncapped text; same discipline as the bio/display-name bounds). */
export const SERVICE_NAME_MIN_LENGTH = 2;
export const SERVICE_NAME_MAX_LENGTH = 80;
export const SERVICE_DESCRIPTION_MAX_LENGTH = 500;

/** Price/duration bounds — mirror the DB CHECKs exactly
 * (price_cents > 0 AND <= 100,000,000; duration 15–480), so violations
 * surface as friendly zod messages instead of raw 23514 constraint errors. */
export const SERVICE_PRICE_MIN_CENTS = 1;
export const SERVICE_PRICE_MAX_CENTS = 100_000_000;
export const SERVICE_DURATION_MIN_MINUTES = 15;
export const SERVICE_DURATION_MAX_MINUTES = 480;

const MINOR_UNITS_PER_UNIT = 100;

/**
 * Major-unit string → integer minor units WITHOUT float arithmetic. All
 * supported currencies have two decimal places. The classic trap
 * is `parseFloat("62.50") * 100` (float multiplication can land on
 * 6249.999…); splitting the validated string and doing integer math cannot.
 * Only called on input the price regex has already accepted.
 */
const dollarsToCents = (input: string): number => {
  const [dollars = "0", fraction = ""] = input.split(".");
  return (
    Number(dollars) * MINOR_UNITS_PER_UNIT + Number(fraction.padEnd(2, "0") || "0")
  );
};

/**
 * Service input. The historical priceDollars field holds a major-unit amount
 * in the service's displayed currency; the DB stores integer minor units.
 * Conversion happens here, at the boundary, without float arithmetic.
 * `description` is optional in the form; empty submits normalize to null
 * (the column is nullable — store the absence, not "").
 */
export const serviceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(SERVICE_NAME_MIN_LENGTH, "Give the service a name.")
    .max(
      SERVICE_NAME_MAX_LENGTH,
      `Keep the name under ${SERVICE_NAME_MAX_LENGTH} characters.`,
    ),
  description: z
    .string()
    .trim()
    .max(
      SERVICE_DESCRIPTION_MAX_LENGTH,
      `Keep the description under ${SERVICE_DESCRIPTION_MAX_LENGTH} characters.`,
    )
    .transform((v) => (v === "" ? null : v)),
  priceDollars: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a price like 85 or 62.50.")
    .transform(dollarsToCents)
    .refine((cents) => cents >= SERVICE_PRICE_MIN_CENTS, "Enter a price.")
    .refine(
      (cents) => cents <= SERVICE_PRICE_MAX_CENTS,
      "Price can't exceed 1,000,000 in the service's currency.",
    ),
  durationMinutes: z.coerce
    .number()
    .int("Duration must be whole minutes.")
    .min(
      SERVICE_DURATION_MIN_MINUTES,
      `Sessions are at least ${SERVICE_DURATION_MIN_MINUTES} minutes.`,
    )
    .max(
      SERVICE_DURATION_MAX_MINUTES,
      `Sessions are at most ${SERVICE_DURATION_MAX_MINUTES} minutes (8 hours).`,
    ),
  sessionType: z.enum(SESSION_TYPES, "Choose where the session happens."),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

/** Update/delete need the target row; the id rides the form as a hidden
 * field and is validated like any other input. */
export const serviceIdSchema = z.uuid("Invalid service.");

/** Minor units → the major-unit STRING the price input speaks — the inverse boundary
 * conversion (edit-form prefill). Integer math, mirroring dollarsToCents:
 * "8500 → 85", "6250 → 62.50". */
export function centsToDollarsInput(cents: number): string {
  const dollars = Math.floor(cents / MINOR_UNITS_PER_UNIT);
  const rem = cents % MINOR_UNITS_PER_UNIT;
  return rem === 0
    ? String(dollars)
    : `${dollars}.${String(rem).padStart(2, "0")}`;
}

/** Always state the stored currency; neither country nor locale converts it. */
export function formatPrice(cents: number, currency: Currency): string {
  const isWholeAmount = cents % MINOR_UNITS_PER_UNIT === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: isWholeAmount ? 0 : 2,
    maximumFractionDigits: isWholeAmount ? 0 : 2,
  }).format(cents / MINOR_UNITS_PER_UNIT);
}
