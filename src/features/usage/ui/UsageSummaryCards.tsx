// Usage summary cards: totals over the loaded history window.

import { useMemo } from "react";
import type { UsageEventRow } from "@/shared/supabase/types";
import styles from "./usage.module.css";

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export function UsageSummaryCards({ events }: { events: UsageEventRow[] }) {
  const totals = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    const models = new Set<string>();
    const providers = new Set<string>();
    for (const event of events) {
      inputTokens += event.input_tokens ?? 0;
      outputTokens += event.output_tokens ?? 0;
      if (event.model_id) models.add(event.model_id);
      if (event.provider_id) providers.add(event.provider_id);
    }
    return { inputTokens, outputTokens, models: models.size, providers: providers.size };
  }, [events]);

  const cards = [
    { label: "Input tokens", value: formatNumber(totals.inputTokens) },
    { label: "Output tokens", value: formatNumber(totals.outputTokens) },
    { label: "Requests", value: formatNumber(events.length) },
    { label: "Models used", value: formatNumber(totals.models) },
  ];

  return (
    <div className={styles.summaryGrid}>
      {cards.map((card) => (
        <div key={card.label} className={styles.summaryCard}>
          <div className={styles.summaryValue}>{card.value}</div>
          <div className={styles.summaryLabel}>{card.label}</div>
        </div>
      ))}
    </div>
  );
}
