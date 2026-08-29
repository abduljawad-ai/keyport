// Application providers: TanStack Query + toasts + theme synchronization.

import { useEffect, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "@/features/auth/model/authQueries";
import { useSettings } from "@/features/settings/model/settingsQueries";
import { AppError, normalizeError } from "@/shared/lib/errors";
import { ToastProvider } from "@/shared/ui";
import { isThemePreference, type ThemePreference } from "@/shared/types/settings";

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Fail fast on auth problems and cancelled requests; retry sparingly.
        retry: (failureCount, error) => {
          const normalized = normalizeError(error);
          if (
            normalized instanceof AppError &&
            ["unauthorized", "forbidden", "aborted", "validation_error", "not_found"].includes(
              normalized.code,
            )
          ) {
            return false;
          }
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function resolveThemeClass(theme: ThemePreference): "light" | "dark" {
  if (theme === "system") {
    const prefersDark =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }
  return theme;
}

/** Non-secret cache used only to avoid a theme flash on boot. */
const THEME_CACHE_KEY = "keyport.theme";

export function applyTheme(theme: ThemePreference): void {
  const resolved = resolveThemeClass(theme);
  document.documentElement.dataset.theme = resolved;
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, resolved);
  } catch {
    /* storage unavailable — non-critical */
  }
}

/**
 * Applies the user's theme preference and follows system changes while the
 * preference is "system".
 */
function ThemeSync({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const { settings } = useSettings();

  const theme: ThemePreference =
    settings && isThemePreference(settings.theme) ? settings.theme : "system";

  useEffect(() => {
    if (!user) return;
    applyTheme(theme);
  }, [theme, user]);

  useEffect(() => {
    if (!user || theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme, user]);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const queryClient = useMemo(createQueryClient, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ThemeSync>{children}</ThemeSync>
      </ToastProvider>
    </QueryClientProvider>
  );
}
