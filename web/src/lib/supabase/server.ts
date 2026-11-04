import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Both values are public by design. Row level security protects the data, not these keys.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dxmzzhglwblunszpqkvg.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_vrYxgM225rq8-ixnkLKPmg_ShJjO38q";

/**
 * Resolve the signed-in user's id from the request's Supabase auth cookies, or
 * null when no valid session is present. Read-only: cookie writes are no-ops,
 * so this only verifies the caller — it never mutates the session. Used to gate
 * server routes that must be restricted to authenticated users.
 */
export async function currentUserId(): Promise<string | null> {
  try {
    const store = await cookies();
    const client = createServerClient(URL, KEY, {
      cookies: {
        getAll: () => store.getAll().map((c) => ({ name: c.name, value: c.value })),
        setAll: () => {
          /* read-only: a route handler does not refresh the session */
        },
      },
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}
