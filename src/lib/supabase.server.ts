import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/** Service-role Supabase client. Server-only. */
export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env["FORGE_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const key = process.env["FORGE_SUPABASE_SERVICE_KEY"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to your .env file.",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
