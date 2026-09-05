import "server-only";

import { track } from "@vercel/analytics/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isProfileComplete } from "@/lib/analytics/complete-profile";
import { insertAnalyticsEvent } from "@/lib/supabase/admin";
import type { Database, Json } from "@/types/supabase";

export { isProfileComplete } from "@/lib/analytics/complete-profile";

/**
 * Proof north-star events — the five names the CHECK constraint and the
 * export SQL both spell. A sixth name is a product decision, not a typo
 * to paper over here.
 */
export const ANALYTICS_EVENT_NAMES = [
  "trainer_signup",
  "complete_profile",
  "search",
  "conversation",
  "booking_request",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

const ONCE_PER_USER = new Set<AnalyticsEventName>([
  "trainer_signup",
  "complete_profile",
]);

export type AnalyticsProps = {
  zip?: string;
  radius?: number;
  specialties?: string[];
  result_count?: number;
  beachhead_nashville?: boolean;
  thread_id?: string;
  owner_id?: string;
  trainer_id?: string;
  booking_id?: string;
};

function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return (ANALYTICS_EVENT_NAMES as readonly string[]).includes(name);
}

function toJsonProps(props: AnalyticsProps): Json {
  const out: { [key: string]: Json | undefined } = {};
  if (props.zip !== undefined) out.zip = props.zip;
  if (props.radius !== undefined) out.radius = props.radius;
  if (props.specialties !== undefined) out.specialties = props.specialties;
  if (props.result_count !== undefined) out.result_count = props.result_count;
  if (props.beachhead_nashville !== undefined) {
    out.beachhead_nashville = props.beachhead_nashville;
  }
  if (props.thread_id !== undefined) out.thread_id = props.thread_id;
  if (props.owner_id !== undefined) out.owner_id = props.owner_id;
  if (props.trainer_id !== undefined) out.trainer_id = props.trainer_id;
  if (props.booking_id !== undefined) out.booking_id = props.booking_id;
  return out;
}

/** Vercel custom-event props cannot be arrays — join specialties. */
function toVercelProps(
  props: AnalyticsProps,
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (props.zip !== undefined) out.zip = props.zip;
  if (props.radius !== undefined) out.radius = props.radius;
  if (props.specialties !== undefined) {
    out.specialties = props.specialties.join(",");
  }
  if (props.result_count !== undefined) out.result_count = props.result_count;
  if (props.beachhead_nashville !== undefined) {
    out.beachhead_nashville = props.beachhead_nashville;
  }
  if (props.thread_id !== undefined) out.thread_id = props.thread_id;
  if (props.owner_id !== undefined) out.owner_id = props.owner_id;
  if (props.trainer_id !== undefined) out.trainer_id = props.trainer_id;
  if (props.booking_id !== undefined) out.booking_id = props.booking_id;
  return out;
}

/**
 * Write one event to analytics_events (source of truth) and optionally
 * mirror it to Vercel Web Analytics. NEVER throws to the caller — a
 * telemetry failure must not break signup, search, messaging, or booking.
 *
 * Call only from a trusted server path AFTER the domain write succeeded.
 */
export async function emitAnalyticsEvent(input: {
  eventName: AnalyticsEventName;
  userId?: string | null;
  props?: AnalyticsProps;
}): Promise<void> {
  if (!isAnalyticsEventName(input.eventName)) {
    console.error("[ANALYTICS] refused unknown event_name:", input.eventName);
    return;
  }
  if (ONCE_PER_USER.has(input.eventName) && !input.userId) {
    console.error(
      `[ANALYTICS] ${input.eventName} requires user_id — skipped`,
    );
    return;
  }

  const props = input.props ?? {};
  try {
    await insertAnalyticsEvent({
      event_name: input.eventName,
      user_id: input.userId ?? null,
      props: toJsonProps(props),
    });
  } catch (e) {
    console.error("[ANALYTICS] DB insert failed:", e);
    // Still try the Vercel mirror — one sink down should not kill the other.
  }

  try {
    await track(input.eventName, toVercelProps(props));
  } catch (e) {
    console.error("[ANALYTICS] Vercel mirror failed:", e);
  }
}

/**
 * Fire-on-transition complete_profile. Reads the six facts under the
 * CALLER's session (own-row RLS). Calendar completeness is "a
 * trainer_external_calendars row exists" — url is NOT NULL on that table
 * and is granted to no API role, so we must not select it (M16 tripwire).
 *
 * Idempotent: a second call after the event exists is a 23505 no-op.
 */
export async function maybeEmitCompleteProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  try {
    const [profile, trainer, certs, specialties, services, calendar] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("avatar_url")
          .eq("id", userId)
          .maybeSingle(),
        supabase.from("trainers").select("bio").eq("id", userId).maybeSingle(),
        supabase
          .from("trainer_certifications")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", userId),
        supabase
          .from("trainer_specialty_assignments")
          .select("specialty", { count: "exact", head: true })
          .eq("trainer_id", userId),
        supabase
          .from("trainer_services")
          .select("id", { count: "exact", head: true })
          .eq("trainer_id", userId)
          .gt("price_cents", 0)
          .is("deleted_at", null),
        // trainer_id only — NEVER url (column grant does not exist).
        supabase
          .from("trainer_external_calendars")
          .select("trainer_id")
          .eq("trainer_id", userId)
          .maybeSingle(),
      ]);

    if (
      profile.error ||
      trainer.error ||
      certs.error ||
      specialties.error ||
      services.error ||
      calendar.error
    ) {
      console.error("[ANALYTICS] complete_profile fact-read failed", {
        profile: profile.error?.message,
        trainer: trainer.error?.message,
        certs: certs.error?.message,
        specialties: specialties.error?.message,
        services: services.error?.message,
        calendar: calendar.error?.message,
      });
      return;
    }

    if (
      !isProfileComplete({
        hasPhoto: Boolean(profile.data?.avatar_url?.trim()),
        hasBio: Boolean(trainer.data?.bio?.trim()),
        hasCredentials: (certs.count ?? 0) >= 1,
        hasSpecialties: (specialties.count ?? 0) >= 1,
        hasPricedService: (services.count ?? 0) >= 1,
        hasCalendar: calendar.data !== null,
      })
    ) {
      return;
    }

    await emitAnalyticsEvent({
      eventName: "complete_profile",
      userId,
    });
  } catch (e) {
    console.error("[ANALYTICS] complete_profile check threw:", e);
  }
}
