// User menu (top bar + sidebar): shows the account email and actions.

import { useNavigate } from "react-router-dom";
import { useSession, useSignOutMutation } from "@/features/auth/model/authQueries";
import { Menu, useToast } from "@/shared/ui";

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
        <span
          className="btn btn--ghost btn--sm"
          style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {email}
        </span>
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
