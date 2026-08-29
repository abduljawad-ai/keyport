// Settings section navigation.

import { NavLink } from "react-router-dom";
import styles from "./settings.module.css";

const SECTIONS = [
  { to: "/settings/providers", label: "Providers" },
  { to: "/settings/account", label: "Account" },
  { to: "/settings/appearance", label: "Appearance" },
];

export function SettingsNav() {
  return (
    <nav className={styles.nav} aria-label="Settings sections">
      {SECTIONS.map((section) => (
        <NavLink
          key={section.to}
          to={section.to}
          className={({ isActive }) =>
            `${styles.navItem}${isActive ? ` ${styles.navItemActive}` : ""}`
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
