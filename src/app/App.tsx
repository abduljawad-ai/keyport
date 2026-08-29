// Authenticated application shell: sidebar + top bar + routed content.

import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "@/widgets/Sidebar";
import { TopBar } from "@/widgets/TopBar";
import styles from "./app.module.css";

export function AppShell() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className={styles.shell}>
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className={styles.main}>
        <TopBar onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppShell;
