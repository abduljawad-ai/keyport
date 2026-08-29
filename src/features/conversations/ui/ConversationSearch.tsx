// Controlled conversation search input.

import { Input } from "@/shared/ui";

export interface ConversationSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function ConversationSearch({ value, onChange }: ConversationSearchProps) {
  return (
    <Input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search conversations…"
      aria-label="Search conversations"
      autoComplete="off"
    />
  );
}
