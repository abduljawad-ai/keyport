// Add / replace provider key dialog.
//
// SECURITY behavior (spec Part 4 §11):
//   * password-style key input with show/hide, never autofilled
//   * the key value is cleared immediately after a successful save
//   * nothing is ever prefilled from stored keys (they are never returned)
//   * failure keeps the dialog open with a safe message; secrets are never
//     echoed back
//   * base URL is validated client-side AND server-side (SSRF guard) — and it
//     only exists for the custom provider; named providers use the server's
//     locked built-in URL, so no user input ever selects an outbound URL

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useListModelsMutation,
  useSaveApiKeyMutation,
  useTestApiKeyMutation,
} from "@/features/providers/model/providerMutations";
import { ApiKeyInput } from "@/features/providers/ui/ApiKeyInput";
import { ConnectionTestBadge, type TestState } from "@/features/providers/ui/ConnectionTestBadge";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { flattenZodErrors, providerFormSchema } from "@/shared/lib/validators";
import { Button, Dialog, Input, Label, ModelPicker, Select } from "@/shared/ui";
import {
  PROVIDER_DEFAULT_MODELS,
  PROVIDER_LABELS,
  CUSTOM_PROVIDER_ID,
  getProviderBaseUrl,
  isCustomProviderId,
  type ProviderId,
} from "@/shared/types/provider";
import { getModelsForProvider, type ModelOption } from "@/shared/types/providerModels";
import {
  BUILTIN_PROVIDER_TYPES,
  CATEGORY_LABELS,
  NAMED_PRESET_IDS,
  getPresetsByCategory,
} from "@/shared/types/providerPresets";
import styles from "./providers.module.css";

export interface AddProviderDialogProps {
  open: boolean;
  onClose: () => void;
  /** Preselect a provider (e.g. when replacing an existing key). */
  initialProviderId?: ProviderId;
}

export function AddProviderDialog({ open, onClose, initialProviderId }: AddProviderDialogProps) {
  const saveMutation = useSaveApiKeyMutation();
  const testMutation = useTestApiKeyMutation();
  const listModelsMutation = useListModelsMutation();
  // Hold a stable ref to mutateAsync: TanStack mutations produce a new object
  // on every state transition, which would otherwise retrigger the debounce
  // effect and cause an infinite request loop.
  const listModelsFnRef = useRef(listModelsMutation.mutateAsync);
  listModelsFnRef.current = listModelsMutation.mutateAsync;

  const [providerId, setProviderId] = useState<ProviderId>(initialProviderId ?? "openai");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [defaultModel, setDefaultModel] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  /** Models fetched live from the provider for the submitted key. */
  const [loadedModels, setLoadedModels] = useState<ModelOption[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);

  // Reset transient state whenever the dialog opens. SECURITY: this also
  // guarantees no key value survives between sessions of the dialog.
  useEffect(() => {
    if (open) {
      setProviderId(initialProviderId ?? "openai");
      setApiKey("");
      setLabel("");
      setBaseUrl("");
      setDefaultModel(initialProviderId ? PROVIDER_DEFAULT_MODELS[initialProviderId] ?? "" : "");
      setErrors({});
      setFormError(null);
      setTestState({ status: "idle" });
      setLoadedModels(null);
      setModelsLoading(false);
      setModelsError(null);
    }
  }, [open, initialProviderId]);

  const isCustom = isCustomProviderId(providerId);
  const lockedBaseUrl = getProviderBaseUrl(providerId);
  const defaultModelPlaceholder = useMemo(() => {
    if (isCustom) {
      return PROVIDER_DEFAULT_MODELS[providerId] ?? "e.g. your-model-id";
    }
    return "Select a model…";
  }, [providerId, isCustom]);

  const buildFormValue = () => ({
    provider_id: providerId,
    api_key: apiKey,
    label: label.trim() || undefined,
    base_url: isCustom ? baseUrl.trim() || undefined : undefined,
    default_model_id: defaultModel.trim() || undefined,
  });

  const validate = () => {
    const parsed = providerFormSchema.safeParse(buildFormValue());
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return null;
    }
    setErrors({});
    return parsed.data;
  };

  const handleProviderChange = (value: ProviderId) => {
    setProviderId(value);
    setDefaultModel(PROVIDER_DEFAULT_MODELS[value] ?? "");
    setBaseUrl("");
    setLoadedModels(null);
    setModelsError(null);
    setModelsLoading(false);
    setTestState({ status: "idle" });
  };

  /**
   * Fetch the live model list for the submitted key (like opencode): select
   * provider → paste key → the dropdown fills with the models that key can
   * actually use. The key is sent only to the list-models Edge Function,
   * which uses it for a single provider request and never stores it.
   */
  const loadModels = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      setLoadedModels(null);
      setModelsError(null);
      return;
    }
    if (isCustom && !baseUrl.trim()) {
      setModelsError("Enter a base URL first to load models.");
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await listModelsFnRef.current({
        provider_id: providerId,
        api_key: key,
        base_url: isCustom ? baseUrl.trim() || null : undefined,
      });
      const options = result.models.map((id) => ({ id, label: id, family: "Available" as const }));
      setLoadedModels(options.length > 0 ? options : null);
    } catch (err) {
      const normalized = normalizeError(err);
      setModelsError(normalized.message || getUserFriendlyMessage(normalized.code));
      setLoadedModels(null);
    } finally {
      setModelsLoading(false);
    }
  }, [apiKey, baseUrl, isCustom, providerId]);

  // Debounced auto-load: fire ~800ms after the user stops typing the key
  // (or changes provider/base URL), so paste → dropdown fills automatically.
  useEffect(() => {
    if (!apiKey.trim()) {
      setLoadedModels(null);
      setModelsError(null);
      setModelsLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      void loadModels();
    }, 800);
    return () => clearTimeout(timer);
  }, [apiKey, baseUrl, providerId, loadModels]);

  const handleTest = async () => {
    setFormError(null);
    const value = validate();
    if (!value) return;
    setTestState({ status: "testing" });
    try {
      const result = await testMutation.mutateAsync({
        provider_id: value.provider_id,
        api_key: value.api_key.trim(),
        base_url: value.base_url ?? null,
      });
      setTestState({ status: "done", result });
    } catch (err) {
      const normalized = normalizeError(err);
      setTestState({
        status: "done",
        result: {
          success: true,
          ok: false,
          code: normalized.code,
          message: normalized.message || getUserFriendlyMessage(normalized.code),
        },
      });
    }
  };

  const handleSave = async () => {
    setFormError(null);
    const value = validate();
    if (!value) return;
    try {
      await saveMutation.mutateAsync({
        provider_id: value.provider_id,
        api_key: value.api_key.trim(),
        label: value.label ?? null,
        base_url: value.base_url ?? null,
        default_model_id: value.default_model_id ?? null,
      });
      // SECURITY: clear the plaintext key immediately after success.
      setApiKey("");
      onClose();
    } catch (err) {
      const normalized = normalizeError(err);
      setFormError(normalized.message || getUserFriendlyMessage(normalized.code));
      // Keep the dialog open; the key stays in transient state only.
    }
  };

  // Provider dropdown grouped like the preset registry: built-in first, then
  // named OpenAI-compatible providers by category, then the custom provider.
  const providerGroups = useMemo(() => {
    const groups: Array<{ label: string; ids: ProviderId[] }> = [
      { label: "Built-in", ids: [...BUILTIN_PROVIDER_TYPES] as ProviderId[] },
    ];
    const byCategory = getPresetsByCategory();
    for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
      const ids = NAMED_PRESET_IDS.filter(
        (id) => byCategory[category]?.some((p) => p.id === id),
      );
      if (ids.length > 0) groups.push({ label, ids: [...ids] as ProviderId[] });
    }
    groups.push({ label: "Other", ids: [CUSTOM_PROVIDER_ID] });
    return groups;
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initialProviderId ? "Replace API key" : "Add provider key"}
      wide
      footer={
        <>
          <div className={styles.testRow} style={{ marginRight: "auto" }}>
            <Button
              variant="secondary"
              onClick={handleTest}
              loading={testMutation.isPending}
              disabled={saveMutation.isPending}
            >
              Test key
            </Button>
            <ConnectionTestBadge state={testState} />
          </div>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saveMutation.isPending}>
            Save key
          </Button>
        </>
      }
    >
      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="field">
        <Label htmlFor="provider-select">Provider</Label>
        <Select
          id="provider-select"
          value={providerId}
          disabled={Boolean(initialProviderId)}
          onChange={(event) => handleProviderChange(event.target.value as ProviderId)}
        >
          {providerGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.ids.map((id) => (
                <option key={id} value={id}>
                  {PROVIDER_LABELS[id]}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <div className="field">
        <Label htmlFor="provider-key">API key</Label>
        <ApiKeyInput
          id="provider-key"
          value={apiKey}
          onChange={(value) => {
            setApiKey(value);
            if (testState.status === "done") setTestState({ status: "idle" });
          }}
          invalid={Boolean(errors.api_key)}
          describedBy={errors.api_key ? "provider-key-error" : "provider-key-help"}
        />
        {errors.api_key ? (
          <p className="field__error" id="provider-key-error">
            {errors.api_key}
          </p>
        ) : (
          <p className="field__help" id="provider-key-help">
            Stored encrypted; never shown again after saving.
          </p>
        )}
      </div>

      {isCustom ? (
        <>
          <div className="field">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              type="url"
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                if (testState.status === "done") setTestState({ status: "idle" });
              }}
              placeholder="https://api.example.com/v1"
              invalid={Boolean(errors.base_url)}
              aria-describedby={errors.base_url ? "provider-base-url-error" : undefined}
              spellCheck={false}
              autoComplete="off"
            />
            {errors.base_url ? (
              <p className="field__error" id="provider-base-url-error">
                {errors.base_url}
              </p>
            ) : null}
          </div>
          <p className={styles.baseUrlNote} role="note">
            For any OpenAI-compatible endpoint not in the list above. Custom
            endpoints must be services you trust and public https URLs.
          </p>
        </>
      ) : lockedBaseUrl ? (
        <p className={styles.baseUrlNote} role="note">
          Uses {PROVIDER_LABELS[providerId]}&apos;s official API at {lockedBaseUrl}.
        </p>
      ) : null}

      <div className="field">
        <Label htmlFor="provider-label" hint="optional">
          Label
        </Label>
        <Input
          id="provider-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="e.g. Work key"
          invalid={Boolean(errors.label)}
          maxLength={200}
        />
      </div>

      <div className="field">
        <div className={styles.modelFieldHeader}>
          <Label htmlFor="provider-model" hint="optional">
            Default model
          </Label>
          {loadedModels && loadedModels.length > 0 ? (
            <button
              type="button"
              className={styles.refreshModelsButton}
              onClick={() => void loadModels()}
              disabled={modelsLoading}
            >
              ↻ {modelsLoading ? "Loading…" : "Refresh"}
            </button>
          ) : null}
        </div>
        {(() => {
          // Live-loaded models take priority (fetched with the pasted key).
          if (modelsLoading) {
            return (
              <select id="provider-model" className="select" disabled aria-busy="true">
                <option>Loading models…</option>
              </select>
            );
          }

          const options: ModelOption[] | null =
            loadedModels && loadedModels.length > 0
              ? loadedModels
              : getModelsForProvider(providerId);

          if (!options) {
            // Free-text fallback: custom provider without a preset match, or
            // the live load failed before any curated options existed.
            return (
              <>
                <Input
                  id="provider-model"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                  placeholder={defaultModelPlaceholder}
                  invalid={Boolean(errors.default_model_id) || Boolean(modelsError)}
                  aria-describedby={modelsError ? "provider-model-error" : undefined}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={200}
                />
                {modelsError ? (
                  <p className="field__error" id="provider-model-error" role="alert">
                    {modelsError}
                  </p>
                ) : (
                  <p className="field__help" id="provider-model-help">
                    Paste your API key above to load available models automatically.
                  </p>
                )}
              </>
            );
          }

          // Preserve a custom current value that the source list doesn't know.
          const trimmed = defaultModel.trim();
          const allOptions =
            trimmed && !options.some((m) => m.id === trimmed)
              ? [{ id: trimmed, label: `${trimmed} (custom)`, family: "Current" }, ...options]
              : options;
          return (
            <>
              <ModelPicker
                id="provider-model"
                ariaLabel="Default model"
                options={allOptions}
                value={defaultModel}
                onChange={setDefaultModel}
                placeholder={defaultModelPlaceholder}
              />
              {modelsError ? (
                <p className="field__error" id="provider-model-error" role="alert">
                  {modelsError}
                </p>
              ) : loadedModels ? (
                <p className="field__help" id="provider-model-help">
                  Loaded from {PROVIDER_LABELS[providerId]} for this key.
                </p>
              ) : null}
            </>
          );
        })()}
      </div>

      <p className={styles.securityNote}>
        Keys are transmitted once over HTTPS, tested with the provider, and stored
        encrypted. Keyport can use them server-side but never returns them to your browser.
      </p>
    </Dialog>
  );
}