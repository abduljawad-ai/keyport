// Settings: Appearance section — theme preference (system/light/dark),
// persisted to user_settings.

import { useEffect, useState } from "react";
import { useUpdateSettings, useSettings } from "@/features/settings/model/settingsQueries";
import { Button, useToast } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { isThemePreference, type ThemePreference } from "@/shared/types/settings";
import styles from "./settings.module.css";

const THEMES: Array<{ value: ThemePreference; label: string; hint: string }> = [
  { value: "system", label: "System", hint: "Follow your device setting" },
  { value: "light", label: "Light", hint: "Bright surfaces" },
  { value: "dark", label: "Dark", hint: "Dimmed surfaces" },
];

export function AppearanceSettings() {
  const { settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const toast = useToast();

  const storedTheme: ThemePreference =
    settings && isThemePreference(settings.theme) ? settings.theme : "system";
  const [theme, setTheme] = useState<ThemePreference>(storedTheme);

  useEffect(() => {
    setTheme(storedTheme);
  }, [storedTheme]);

  const dirty = theme !== storedTheme;

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ theme });
      toast.success("Settings saved.");
    } catch (err) {
      const normalized = normalizeError(err);
      toast.error(normalized.message || getUserFriendlyMessage(normalized.code));
    }
  };

  return (
    <section aria-labelledby="settings-appearance-heading" className={styles.stack}>
      <div>
        <h2 id="settings-appearance-heading" className={styles.sectionTitle}>
          Appearance
        </h2>
        <p className={styles.sectionDescription}>
          Theme preference is stored with your account and follows you across devices.
        </p>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <fieldset className={styles.themeGroup}>
          <legend className={styles.themeLegend}>Theme</legend>
          {THEMES.map((option) => (
            <label key={option.value} className={styles.themeOption}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => setTheme(option.value)}
              />
              <span className={styles.themeOptionText}>
                <span className={styles.themeOptionLabel}>{option.label}</span>
                <span className={styles.themeOptionHint}>{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button onClick={handleSave} disabled={!dirty} loading={updateSettings.isPending}>
            Save appearance
          </Button>
        </div>
      </div>
    </section>
  );
}
