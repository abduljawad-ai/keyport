// App sidebar: brand, new chat, search, conversation list, footer nav.

import { useMemo, useState } from "react";
import { ConversationSearch } from "@/features/conversations/ui/ConversationSearch";
import { ConversationList } from "@/widgets/Sidebar/ConversationList";
import { SidebarFooter } from "@/widgets/Sidebar/SidebarFooter";
import { SidebarHeader } from "@/widgets/Sidebar/SidebarHeader";
import { useConversations } from "@/features/chat/model/useConversations";
import styles from "./sidebar.module.css";

export interface SidebarProps {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { data: conversations, isLoading } = useConversations();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const list = conversations ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((conversation) => conversation.title.toLowerCase().includes(query));
  }, [conversations, search]);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className={styles.mobileBackdrop}
          aria-label="Close menu"
          onClick={onMobileClose}
        />
      ) : null}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
        <SidebarHeader />
        <div className={styles.search}>
          <ConversationSearch value={search} onChange={setSearch} />
        </div>
        <div className={styles.listScroll}>
          <ConversationList conversations={filtered} isLoading={isLoading} onNavigate={onMobileClose} />
        </div>
        <SidebarFooter />
      </aside>
    </>
  );
}

export default Sidebar;
