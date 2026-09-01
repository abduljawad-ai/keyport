// User menu (top bar + sidebar): shows the account email and actions.

import { useNavigate } from "react-router-dom";
import { useSession, useSignOutMutation } from "@/features/auth/model/authQueries";
import { Menu, useToast } from "@/shared/ui";
import styles from "./UserMenu.module.css";

/** Extract initials from email (e.g. "jaw@dev.com" → "J"). */
function getInitials(email: string): string {
  const local = email.split("@")[0] ?? "";
  return (local[0] ?? "?").toUpperCase();
}

export function UserMenu() {
  const { user } = useSession();
  const signOut = useSignOutMutation();
  const toast = useToast();
  const navigate = useNavigate();

  const email = user?.email ?? "Signed in";

  const handleSignOut = async () => {
    try {
      await signOut.mutateAsync();
      toast.info("Signed out.");
      navigate("/auth", { replace: true });
    } catch {
      toast.error("Could not sign out. Please try again.");
    }
  };

  return (
    <Menu
      ariaLabel={`Account menu for ${email}`}
      trigger={
        <>
          {/* Desktop: show full email */}
          <span className={`btn btn--ghost btn--sm ${styles.desktopEmail}`}>
            {email}
          </span>
          {/* Mobile: show avatar circle with initials */}
          <span className={styles.mobileAvatar} title={email}>
            {getInitials(email)}
          </span>
        </>
      }
      items={[
        { label: "Settings", onSelect: () => navigate("/settings") },
        { label: "Usage", onSelect: () => navigate("/usage") },
        "separator",
        { label: signOut.isPending ? "Signing out…" : "Sign out", onSelect: handleSignOut, danger: true },
      ]}
    />
  );
}
