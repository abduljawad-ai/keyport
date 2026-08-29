// Profile queries.

import { supabase } from "@/shared/supabase/client";
import type { ProfileRow } from "@/shared/supabase/types";
import { normalizeError } from "@/shared/lib/errors";

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,created_at,updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw normalizeError(error);
  return data;
}

export async function updateProfile(
  userId: string,
  patch: { full_name?: string | null },
): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select("id,email,full_name,created_at,updated_at")
    .single();
  if (error) throw normalizeError(error);
  return data;
}
