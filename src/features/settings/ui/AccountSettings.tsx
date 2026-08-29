// Settings: Account section — email, profile display, sign out.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession, useSignOutMutation } from "@/features/auth/model/authQueries";
import { Button, Input, Label, useToast } from "@/shared/ui";
import { formatDate } from "@/shared/lib/date";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { fetchProfile, updateProfile } from "@/shared/supabase/queries/profiles";
import styles from "./settings.module.css";

export function AccountSettings() {
  const { user } = useSession();
  const signOut = useSignOutMutation();
  const toast = useToast();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["profile", user?.id ?? "anonymous"],
    queryFn: () => fetchProfile(user!.id),
    enabled: Boolean(user),
  });

  const [fullName, setFullName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const displayName = fullName ?? profileQuery.data?.full_name ?? "";

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updated = await updateProfile(user.id, {
        full_name: displayName.trim() || null,
      });
      queryClient.setQueryData(["profile", user.id], updated);
      setFullName(null);
      toast.success("Profile saved.");
    } catch (err) {
      const normalized = normalizeError(err);
      toast.error(normalized.message || getUserFriendlyMessage(normalized.code));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby="settings-account-heading" className={styles.stack}>
      <div>
        <h2 id="settings-account-heading" className={styles.sectionTitle}>
          Account
        </h2>
        <p className={styles.sectionDescription}>
          Your Keyport account. Account export and deletion are planned for a future
          release.
        </p>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div className="field">
          <Label htmlFor="account-email">Email</Label>
          <Input id="account-email" type="email" value={user?.email ?? ""} readOnly disabled />
        </div>
        {profileQuery.data ? (
          <div className={styles.metaLine}>
            Member since {formatDate(profileQuery.data.created_at)}
          </div>
        ) : null}
        <div className="field">
          <Label htmlFor="account-name" hint="optional">
            Display name
          </Label>
          <Input
            id="account-name"
            value={displayName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Your name"
            disabled={!user}
            maxLength={120}
          />
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <Button onClick={handleSave} loading={saving} disabled={!user}>
            Save profile
          </Button>
        </div>
      </div>

      <div
        className="card"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}
      >
        <div>
          <div style={{ fontWeight: 700 }}>Sign out</div>
          <div className={styles.metaLine}>Sign out of this browser session.</div>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            signOut.mutate(undefined, {
              onSuccess: () => toast.info("Signed out."),
            })
          }
          loading={signOut.isPending}
        >
          Sign out
        </Button>
      </div>
    </section>
  );
}
