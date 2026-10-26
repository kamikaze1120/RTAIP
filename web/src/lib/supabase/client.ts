import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Both values are public by design. Row level security protects the data, not these keys.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dxmzzhglwblunszpqkvg.supabase.co";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_vrYxgM225rq8-ixnkLKPmg_ShJjO38q";

let client: SupabaseClient | null = null;

/** Browser Supabase client, created once. */
export function supabase(): SupabaseClient {
  if (!client) client = createBrowserClient(URL, KEY);
  return client;
}
