// Shared settings types (mirrors public.user_settings).

export type ThemePreference = "system" | "light" | "dark";
export type SendBehavior = "enter-to-send" | "enter-for-newline";

export interface UserSettings {
  user_id: string;
  theme: ThemePreference;
  locale: string;
  send_behavior: SendBehavior;
  preferences: Record<string, unknown>;
  updated_at: string;
}

export const DEFAULT_SETTINGS: Omit<UserSettings, "user_id" | "updated_at"> = {
  theme: "system",
  locale: "en",
  send_behavior: "enter-to-send",
  preferences: {},
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function isSendBehavior(value: unknown): value is SendBehavior {
  return value === "enter-to-send" || value === "enter-for-newline";
}
