// Sidebar conversation item with rename/delete actions.

import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useDeleteConversation } from "@/features/conversations/model/conversationMutations";
import { RenameConversationDialog } from "@/features/conversations/ui/RenameConversationDialog";
import { formatRelative } from "@/shared/lib/date";
import { Button, Dialog, Menu } from "@/shared/ui";
import type { ConversationDbRow } from "@/shared/supabase/types";
import styles from "./conversations.module.css";

export interface ConversationItemProps {
  conversation: ConversationDbRow;
}

export function ConversationItem({ conversation }: ConversationItemProps) {
  const deleteConversation = useDeleteConversation();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <div className={styles.itemWrapper}>
      <NavLink
        to={`/chat/${conversation.id}`}
        className={({ isActive }) =>
          `${styles.item}${isActive ? ` ${styles.itemActive}` : ""}`
        }
        title={conversation.title}
      >
        <span className={styles.itemTitle}>{conversation.title || "New conversation"}</span>
        <span className={styles.itemMeta}>{formatRelative(conversation.updated_at)}</span>
      </NavLink>

      <div className={styles.itemActions}>
        <Menu
          ariaLabel={`Actions for ${conversation.title}`}
          trigger={
            <span className="icon-btn" aria-hidden="true">
              ⋯
            </span>
          }
          items={[
            { label: "Rename", onSelect: () => setRenameOpen(true) },
            {
              label: deleteConversation.isPending ? "Deleting…" : "Delete",
              onSelect: () => setDeleteOpen(true),
              danger: true,
            },
          ]}
        />
      </div>

      <RenameConversationDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        conversation={conversation}
      />

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete conversation?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteConversation.isPending}
              onClick={() => deleteConversation.mutate(conversation.id)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p>
          “{conversation.title || "New conversation"}” and all of its messages will be
          permanently deleted.
        </p>
      </Dialog>
    </div>
  );
}
