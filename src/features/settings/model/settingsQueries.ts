// Settings queries/mutations (user_settings table).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/model/authQueries";
import {
  fetchSettings,
  upsertSettings,
  type SettingsPatch,
} from "@/shared/supabase/queries/settings";
import type { UserSettingsRow } from "@/shared/supabase/types";
import { DEFAULT_SETTINGS } from "@/shared/types/settings";

export function settingsQueryKey(userId: string) {
  return ["settings", userId] as const;
}

/** Settings for the signed-in user; falls back to defaults until loaded. */
export function useSettings(): {
  settings: UserSettingsRow | null;
  isLoading: boolean;
  isError: boolean;
} {
  const { user } = useSession();
  const userId = user?.id;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings", userId ?? "anonymous"],
    queryFn: () => fetchSettings(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
  return { settings: data ?? null, isLoading: Boolean(userId) && isLoading, isError };
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const { user } = useSession();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => upsertSettings(user!.id, patch),
    onSuccess: (row) => {
      queryClient.setQueryData(settingsQueryKey(row.user_id), row);
    },
  });
}

/** Effective settings row, merged over defaults. */
export function effectiveSettings(settings: UserSettingsRow | null): UserSettingsRow {
  if (!settings) {
    return {
      user_id: "",
      updated_at: "",
      preferences: {},
      locale: DEFAULT_SETTINGS.locale,
      theme: DEFAULT_SETTINGS.theme,
      send_behavior: DEFAULT_SETTINGS.send_behavior,
    };
  }
  return settings;
}
