// User settings queries (user_settings table, owner-scoped).

import { supabase } from "@/shared/supabase/client";
import type { UserSettingsRow } from "@/shared/supabase/types";
import { normalizeError } from "@/shared/lib/errors";
import { isSendBehavior, isThemePreference } from "@/shared/types/settings";
import type { SendBehavior, ThemePreference } from "@/shared/types/settings";

const SETTINGS_SELECT = "user_id,theme,locale,send_behavior,preferences,updated_at";

function sanitize(row: UserSettingsRow): UserSettingsRow {
  return {
    ...row,
    theme: isThemePreference(row.theme) ? row.theme : "system",
    send_behavior: isSendBehavior(row.send_behavior) ? row.send_behavior : "enter-to-send",
    preferences: row.preferences ?? {},
  };
}

export async function fetchSettings(userId: string): Promise<UserSettingsRow | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(SETTINGS_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw normalizeError(error);
  return data ? sanitize(data) : null;
}

export interface SettingsPatch {
  theme?: ThemePreference;
  locale?: string;
  send_behavior?: SendBehavior;
  preferences?: Record<string, unknown>;
}

/** Upsert settings for the signed-in user. */
export async function upsertSettings(
  userId: string,
  patch: SettingsPatch,
): Promise<UserSettingsRow> {
  const payload: Record<string, unknown> = { user_id: userId };
  if (patch.theme) payload.theme = patch.theme;
  if (patch.locale) payload.locale = patch.locale;
  if (patch.send_behavior) payload.send_behavior = patch.send_behavior;
  if (patch.preferences) payload.preferences = patch.preferences;

  const { data, error } = await supabase
    .from("user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select(SETTINGS_SELECT)
    .single();
  if (error) throw normalizeError(error);
  return sanitize(data);
}
