import { SupabaseClient, createClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  const lsUrl = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseUrl') : null;
  const lsKey = typeof window !== 'undefined' ? window.localStorage.getItem('supabaseAnon') : null;
  const url = (lsUrl && lsUrl.trim()) || (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key = (lsKey && lsKey.trim()) || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);
  if (!url || !key) return null;
  if (client) return client;
  try {
    client = createClient(url, key);
    return client;
  } catch {
    return null;
  }
}