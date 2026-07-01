import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/supabase";

/**
 * Browser (client-component) Supabase client.
 *
 * Safe to call in Client Components — it reads the session from cookies the
 * middleware keeps fresh. Typed with the generated `Database` type so every
 * query is checked against the M1→M9 schema.
 *
 * Uses the anon (public) key, which is designed to be exposed to browsers; RLS
 * is what actually gates access. (Supabase's newer naming calls this the
 * "publishable" key — a future rename option; we stay on ANON_KEY to match the
 * existing .env.)
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
