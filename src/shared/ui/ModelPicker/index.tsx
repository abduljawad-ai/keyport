import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelOption } from "@/shared/types/providerModels";
import styles from "./ModelPicker.module.css";

export interface ModelPickerProps {
  id?: string;
  ariaLabel: string;
  /** Allowed models — pass the output of getModelOptions(...). */
  options: ModelOption[];
  /** Currently selected model id (may be empty, or absent from options). */
  value: string;
  onChange: (value: string) => void;
  /** Shown on the trigger when value is empty. */
  placeholder?: string;
  disabled?: boolean;
}

/** Pin a current value that the options list doesn't know, so selection is never lost. */
function pinnedCurrent(options: ModelOption[], value: string): ModelOption[] {
  const trimmed = value.trim();
  if (!trimmed || options.some((o) => o.id === trimmed)) return options;
  return [{ id: trimmed, label: `${trimmed} (current)`, family: "Current" }, ...options];
}

export function ModelPicker({
  id,
  ariaLabel,
  options,
  value,
  onChange,
  placeholder = "Select a model…",
  disabled = false,
}: ModelPickerProps) {
  const allOptions = useMemo(() => pinnedCurrent(options, value), [options, value]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allOptions.filter((o) => o.id.toLowerCase().includes(q)) : allOptions;
  }, [allOptions, query]);

  const groups = useMemo(() => {
    const out: { family: string; items: ModelOption[] }[] = [];
    for (const opt of flat) {
      const family = opt.family ?? "Other";
      const last = out[out.length - 1];
      if (last && last.family === family) last.items.push(opt);
      else out.push({ family, items: [opt] });
    }
    return out;
  }, [flat]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.children[activeIndex];
    if (el instanceof HTMLElement) el.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setActiveIndex(0);
      setQuery("");
      setOpen(true);
    }
  }

  function handleSearchKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = flat[activeIndex];
      if (chosen) {
        onChange(chosen.id);
        setOpen(false);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const listboxId = `${id ?? "model-picker"}-listbox`;

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={styles.trigger}
        onClick={() => {
          setActiveIndex(0);
          setOpen((o) => !o);
        }}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
      >
        <span className={styles.triggerValue}>{value.trim() ? value : placeholder}</span>
        <span className={styles.caret} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className={styles.popover}>
          <input
            ref={inputRef}
            className={styles.search}
            type="text"
            aria-label={`Search ${ariaLabel}`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleSearchKeyDown}
            spellCheck={false}
            autoComplete="off"
          />
          {flat.length === 0 ? (
            <p className={styles.empty}>No models match “{query}”</p>
          ) : (
            <ul id={listboxId} role="listbox" className={styles.list} ref={listRef}>
              {groups.map((group) => (
                <li key={group.family} role="presentation" className={styles.group}>
                  <div className={styles.groupLabel}>{group.family}</div>
                  <ul role="presentation" className={styles.groupList}>
                    {group.items.map((m) => {
                      const idx = flat.indexOf(m);
                      return (
                        <li
                          key={m.id}
                          role="option"
                          aria-selected={m.id === value}
                          className={activeIndex === idx ? styles.optionActive : styles.option}
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => {
                            onChange(m.id);
                            setOpen(false);
                          }}
                        >
                          <button
                            type="button"
                            className={styles.optionButton}
                            onClick={(event) => {
                              event.stopPropagation();
                              onChange(m.id);
                              setOpen(false);
                            }}
                          >
                            {m.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}