// Settings page: section navigation + routed sections.

import { Outlet } from "react-router-dom";
import { SettingsNav } from "@/features/settings/ui/SettingsNav";
import styles from "./settingsPage.module.css";

export function SettingsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.heading}>Settings</h1>
        <div className={styles.layout}>
          <SettingsNav />
          <div className={styles.content}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
