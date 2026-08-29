// Password-style API key input with show/hide toggle.
// SECURITY: the value is never persisted, autofilled, or stored — it lives
// only in transient form state and is cleared by the caller after success.

import { useId, useState } from "react";
import { Input } from "@/shared/ui";

export interface ApiKeyInputProps {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function ApiKeyInput({
  value,
  onChange,
  invalid = false,
  describedBy,
  placeholder = "sk-…",
  disabled = false,
  id,
}: ApiKeyInputProps) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Input
        id={inputId}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        invalid={invalid}
        disabled={disabled}
        aria-describedby={describedBy}
        // Prevent password managers / autocomplete from capturing keys.
        autoComplete="off"
        data-lpignore="true"
        data-1password-ignore="true"
        spellCheck={false}
      />
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        aria-label={visible ? "Hide API key" : "Show API key"}
        disabled={disabled}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
