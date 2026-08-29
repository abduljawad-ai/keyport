// Mock-mode detection.
//
// The app can run fully in the browser without any Supabase project for UI
// testing. Mock mode activates when:
//   1. VITE_USE_MOCK === "true", or
//   2. VITE_SUPABASE_URL is missing, or
//   3. VITE_SUPABASE_URL still points at the .env.example placeholder.
//
// In mock mode every data access (Supabase client + Edge Function client)
// is served by in-browser stores — no network requests are made.

export const MOCK_PLACEHOLDER_HOST = "your-project.supabase.co";

export function isMockMode(): boolean {
  if (import.meta.env.VITE_USE_MOCK === "true") return true;
  const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
  if (!url) return true;
  return url.includes(MOCK_PLACEHOLDER_HOST);
}