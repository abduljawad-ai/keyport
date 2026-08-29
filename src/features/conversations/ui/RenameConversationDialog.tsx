// Rename dialog with validation.

import { useEffect, useState } from "react";
import { useUpdateConversation } from "@/features/conversations/model/conversationMutations";
import { Button, Dialog, Input, Label } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { conversationTitleSchema } from "@/shared/lib/validators";
import type { ConversationDbRow } from "@/shared/supabase/types";

export interface RenameConversationDialogProps {
  open: boolean;
  onClose: () => void;
  conversation: ConversationDbRow;
}

export function RenameConversationDialog({
  open,
  onClose,
  conversation,
}: RenameConversationDialogProps) {
  const updateConversation = useUpdateConversation();
  const [title, setTitle] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(conversation.title);
      setError(null);
    }
  }, [open, conversation.title]);

  const handleSave = async () => {
    const parsed = conversationTitleSchema.safeParse(title.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid title.");
      return;
    }
    try {
      await updateConversation.mutateAsync({
        id: conversation.id,
        patch: { title: parsed.data },
      });
      onClose();
    } catch (err) {
      const normalized = normalizeError(err);
      setError(normalized.message || getUserFriendlyMessage(normalized.code));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Rename conversation"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={updateConversation.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="field">
        <Label htmlFor="rename-title">Title</Label>
        <Input
          id="rename-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleSave();
            }
          }}
          invalid={Boolean(error)}
          maxLength={140}
          aria-describedby={error ? "rename-title-error" : undefined}
        />
        {error ? (
          <p className="field__error" id="rename-title-error">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
