// Sidebar header: brand + new chat action.

import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/shared/ui";
import styles from "./sidebar.module.css";

export function SidebarHeader() {
  const navigate = useNavigate();

  return (
    <div className={styles.header}>
      <Link to="/chat" className={styles.brand} aria-label="Keyport home">
        <span className={styles.brandMark} aria-hidden="true">⌘</span>
        <span className={styles.brandName}>Keyport</span>
      </Link>
      <Button
        className={styles.newChat}
        onClick={() => navigate("/chat")}
        aria-label="Start a new chat"
      >
        + New chat
      </Button>
    </div>
  );
}
