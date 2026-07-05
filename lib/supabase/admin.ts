import "server-only";
// ^ the `server-only` package is a runtime no-op whose package.json export
// conditions make any CLIENT-bundle import fail AT BUILD TIME — the loud
// guard this module demands.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/supabase";

/**
 * THE APP'S SERVICE-ROLE SURFACE — first and only usage. The service-role
 * key BYPASSES ALL RLS: anything exported from this module runs with total
 * database authority, so this module's exports ARE the app's entire
 * service-role blast radius. Keep them narrow, named for exactly what they
 * answer, and never export the raw client.
 *
 * WHY EMAIL LOOKUP LIVES HERE AND NOT IN A profiles.email COLUMN (the
 * rejected M13): profiles policies are ROW-level — a column rides EVERY
 * existing read path for any visible row. An email column would make
 * trainer emails ANON-READABLE (the public directory policy publishes
 * trainer rows to the internet) and hand owner emails to trainers via the
 * M11 counterparty policy. Email in profiles is a leak BY CONSTRUCTION;
 * the admin client is the security-correct vehicle, not merely the
 * convenient one. Addresses stay in auth.users, fetched one at a time,
 * server-only, for exactly one purpose (transition mail).
 */

let adminClient: SupabaseClient<Database> | null = null;

function getAdminClient(): SupabaseClient<Database> {
  if (!adminClient) {
    adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      // No sessions, no refresh — this is a key, not a user.
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return adminClient;
}

/** The one export: a user's email address, or null (unknown id, missing
 * env, or any auth-API failure — callers are mail code; null means "skip
 * the send", never "crash the request"). */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data, error } = await getAdminClient().auth.admin.getUserById(
      userId,
    );
    if (error) {
      console.error(`[MAIL] email lookup failed for ${userId}:`, error.message);
      return null;
    }
    return data.user?.email ?? null;
  } catch (e) {
    console.error(`[MAIL] email lookup threw for ${userId}:`, e);
    return null;
  }
}
