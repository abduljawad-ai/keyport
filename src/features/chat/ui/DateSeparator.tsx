// Day separator between message groups.

import { formatDayLabel } from "@/shared/lib/date";
import styles from "./chat.module.css";

export function DateSeparator({ day }: { day: string }) {
  return (
    <div className={styles.dateSeparator} role="separator">
      <span>{formatDayLabel(day)}</span>
    </div>
  );
}
