// Right-side action cluster of the top bar.

import type { ReactNode } from "react";
import styles from "./topbar.module.css";

export interface TopBarActionsProps {
  settings: ReactNode;
  userMenu: ReactNode;
}

export function TopBarActions({ settings, userMenu }: TopBarActionsProps) {
  return (
    <div className={styles.actions}>
      {settings}
      {userMenu}
    </div>
  );
}
