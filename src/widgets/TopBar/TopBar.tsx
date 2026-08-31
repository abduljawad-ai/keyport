// Top bar: mobile menu, conversation title, provider/model status,
// settings shortcut, user menu.

import { Link, useLocation } from "react-router-dom";
import { useConversation } from "@/features/chat/model/useConversations";
import { useActiveProviders } from "@/features/providers/model/providerQueries";
import { TopBarActions } from "@/widgets/TopBar/TopBarActions";
import { UserMenu } from "@/features/auth/ui/UserMenu";
import { AppIcon } from "@/shared/ui";
import { PROVIDER_LABELS } from "@/shared/types/provider";
import styles from "./topbar.module.css";

function useActiveConversationId(): string | null {
  const { pathname } = useLocation();
  const match = /^\/chat\/([^/?#]+)/.exec(pathname);
  return match ? match[1] : null;
}

export interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const conversationId = useActiveConversationId();
  const { data: conversation } = useConversation(conversationId);
  const { activeProviders, isLoading } = useActiveProviders();

  const connectionState = isLoading
    ? { label: "Checking…", tone: "neutral" as const }
    : activeProviders.length > 0
      ? { label: `${PROVIDER_LABELS[activeProviders[0].provider_connection.provider_id]} connected`, tone: "success" as const }
      : { label: "No provider connected", tone: "danger" as const };

  return (
    <header className={styles.topbar}>
      <button
        type="button"
        className={`icon-btn ${styles.menuButton}`}
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <AppIcon kind="menu" size={20} />
      </button>

      <div className={styles.title} title={conversation?.title}>
        {conversation?.title || "New chat"}
      </div>

      <div className={styles.statusArea}>
        {conversation?.model_id ? (
          <span className={styles.modelChip}>{conversation.model_id}</span>
        ) : null}
        <span
          className={`badge badge--${connectionState.tone}`}
          role="status"
          aria-label={`Connection status: ${connectionState.label}`}
        >
          <span className="badge__dot" aria-hidden="true" />
          {connectionState.label}
        </span>
      </div>

      <TopBarActions
        settings={
          <Link to="/settings" className="icon-btn" aria-label="Open settings" title="Settings">
            <AppIcon kind="settings" size={19} />
          </Link>
        }
        userMenu={<UserMenu />}
      />
    </header>
  );
}

export default TopBar;
