// Sidebar footer: settings/usage navigation + user menu.

import { NavLink } from "react-router-dom";
import { UserMenu } from "@/features/auth/ui/UserMenu";
import { useProviderKeys } from "@/features/providers/model/providerQueries";
import { isActiveProvider } from "@/shared/types/provider";
import styles from "./sidebar.module.css";

export function SidebarFooter() {
  const { data } = useProviderKeys();
  const hasProvider = (data?.providers ?? []).some(isActiveProvider);

  return (
    <div className={styles.footer}>
      <nav className={styles.footerNav} aria-label="App navigation">
        <NavLink
          to="/settings/providers"
          className={({ isActive }) => `${styles.footerLink}${isActive ? ` ${styles.footerLinkActive}` : ""}`}
        >
          <span aria-hidden="true">⚙</span> Settings
        </NavLink>
        <NavLink
          to="/usage"
          className={({ isActive }) => `${styles.footerLink}${isActive ? ` ${styles.footerLinkActive}` : ""}`}
        >
          <span aria-hidden="true">📊</span> Usage
        </NavLink>
      </nav>
      <div className={styles.footerUser}>
        {!hasProvider ? (
          <span className="badge badge--warning" title="No active provider key">
            <span className="badge__dot" aria-hidden="true" /> No key
          </span>
        ) : null}
        <UserMenu />
      </div>
    </div>
  );
}
