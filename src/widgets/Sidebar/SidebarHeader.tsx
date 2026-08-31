// Sidebar header: brand + new chat action.

import { Link, useNavigate } from "react-router-dom";
import { AppIcon, Button } from "@/shared/ui";
import styles from "./sidebar.module.css";

export function SidebarHeader() {
  const navigate = useNavigate();

  return (
    <div className={styles.header}>
      <Link to="/chat" className={styles.brand} aria-label="Keyport home">
        <span className={styles.brandMark} aria-hidden="true">
          <AppIcon kind="brand" size={18} />
        </span>
        <span className={styles.brandName}>Keyport</span>
      </Link>
      <Button
        className={styles.newChat}
        onClick={() => navigate("/chat")}
        aria-label="Start a new chat"
      >
        <AppIcon kind="plus" size={16} weight="bold" />
        New chat
      </Button>
    </div>
  );
}
