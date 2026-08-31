import type { ReactNode } from "react";
import { Icon, type PhosphorIcon } from "@/shared/ui/Icon";

export interface EmptyStateProps {
  /** Phosphor icon component rendered above the title. */
  icon?: PhosphorIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon ? (
        <div className="empty-state__icon" aria-hidden="true">
          <Icon icon={icon} size={34} />
        </div>
      ) : null}
      <div className="empty-state__title">{title}</div>
      {description ? <div className="empty-state__description">{description}</div> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
