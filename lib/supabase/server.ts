import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/supabase";

/**
 * Server (Server Component / Route Handler / Server Action) Supabase client.
 *
 * Create a NEW client per request — never hoist it to a module-level singleton
 * (with Fluid compute a shared client leaks one request's auth into another).
 *
 * `cookies()` is async in Next 15, so this function is async and must be
 * awaited. Typed with `Database` for schema-checked queries.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` was called from a Server Component, where cookies are
            // read-only. Safe to ignore: the middleware refreshes the session
            // and writes the rotated cookies on every request, so the write
            // here is redundant rather than required.
          }
        },
      },
    },
  );
}
