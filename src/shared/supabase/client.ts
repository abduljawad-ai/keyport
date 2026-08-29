// Single shared Supabase browser client.
//
// SECURITY scope of this client (enforced by RLS + revokes server-side):
//   allowed  : auth, profiles, conversations, messages (select / user-insert
//              / delete), user_settings, provider_connections (read-only),
//              usage_events (read-only)
//   forbidden: user_vaults, api_keys — these tables have NO grants and NO
//              policies for browser roles; secret operations go through
//              Edge Functions only (see src/shared/api/*).
//
// Session persistence is Supabase's own mechanism (login usability, v1).
// No API keys or custom secrets are ever stored client-side.
//
// Mock mode: when VITE_USE_MOCK is "true" or the Supabase URL is still the
// .env.example placeholder, every query is served by an in-browser fixture
// (see mockClient.ts) so the UI can be exercised without a backend.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isMockMode } from "../supabase/mockMode";
import { getMockSupabase } from "../supabase/mockClient";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function realSupabaseUrl(): string {
  return (supabaseUrl ?? "").trim().replace(/\/+$/, "");
}

function realAnonKey(): string {
  return (supabaseAnonKey ?? "").trim();
}

export const supabase: SupabaseClient = isMockMode()
  ? (getMockSupabase() as unknown as SupabaseClient)
  : createClient(realSupabaseUrl(), realAnonKey(), {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });