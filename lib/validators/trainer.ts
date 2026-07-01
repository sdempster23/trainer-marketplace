import { z } from "zod";

import { Constants } from "@/types/supabase";

/**
 * The 17 trainer specialties, in canonical (declaration) order — DERIVED from
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

/**
 * The 7 US IANA timezones offered at onboarding. `timezone` interprets the
 * trainer's availability hours, so a wrong zone breaks booking times — hence a
 * fixed, always-correct dropdown rather than a ZIP→tz guess (zipcodes exposes no
 * tz field anyway). Anchorage/Honolulu/Phoenix cover AK/HI and no-DST Arizona.
 */
export const TRAINER_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
] as const;

export type TrainerTimezone = (typeof TRAINER_TIMEZONES)[number];

/** Service-radius options in MILES (the form's choices). Converted to meters in
 * the action. 100mi ≈ 160,934m, within the DB CHECK cap of 200,000m (~124mi). */
export const SERVICE_RADIUS_MILES = [10, 25, 50, 100] as const;

export type ServiceRadiusMiles = (typeof SERVICE_RADIUS_MILES)[number];

/**
 * Onboarding input. The zip is validated for FORMAT only (5 digits) — whether
 * it's a real, resolvable US ZIP is decided in the action by the zipcodes
 * lookup (undefined → the action's own inline error), because the schema has no
 * access to the lookup table.
 */
export const onboardingSchema = z.object({
  bio: z
    .string()
    .trim()
    .min(BIO_MIN_LENGTH, "Tell owners a bit about yourself — at least a sentence.")
    .max(BIO_MAX_LENGTH, `Keep your bio under ${BIO_MAX_LENGTH} characters.`),
  specialties: z
    .array(z.enum(SPECIALTIES))
    .min(1, "Pick at least one specialty."),
  zip: z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP."),
  serviceRadiusMiles: z.coerce
    .number()
    .refine(
      (v): v is ServiceRadiusMiles =>
        (SERVICE_RADIUS_MILES as readonly number[]).includes(v),
      "Choose a service radius.",
    ),
  timezone: z.enum(TRAINER_TIMEZONES, "Choose your timezone."),
});

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
};

/** Sensible default zone for the Nashville-area core market (Central). The
 * trainer confirms/changes it — we don't derive it (see TRAINER_TIMEZONES). */
export const DEFAULT_TIMEZONE: TrainerTimezone = "America/Chicago";
