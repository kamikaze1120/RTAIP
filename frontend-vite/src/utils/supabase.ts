let client: any = null;

export async function getSupabaseClient(): Promise<any | null> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || (import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined);
  if (!url || !key) return null;
  if (client) return client;
  try {
    const modName = '@supabase/supabase-js';
    const m: any = await import(modName);
    client = m.createClient(url, key);
    return client;
  } catch {
    return null;
  }
}