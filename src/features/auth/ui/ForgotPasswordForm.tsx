// Forgot password form — sends a reset email via Supabase Auth.

import { useState, type FormEvent } from "react";
import { useResetPasswordMutation } from "@/features/auth/model/authQueries";
import { Button, Input, Label } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { flattenZodErrors, forgotPasswordSchema } from "@/shared/lib/validators";
import styles from "./auth.module.css";

export interface ForgotPasswordFormProps {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: ForgotPasswordFormProps) {
  const reset = useResetPasswordMutation();
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});

    try {
      await reset.mutateAsync(parsed.data.email);
      setSent(true);
    } catch (err) {
      const normalized = normalizeError(err);
      setFormError(normalized.message || getUserFriendlyMessage(normalized.code));
    }
  };

  if (sent) {
    return (
      <div className={styles.form}>
        <div className={styles.notice} role="status">
          If an account exists for <strong>{email}</strong>, you will receive a password reset
          link shortly.
        </div>
        <Button variant="secondary" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="field">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "forgot-email-error" : undefined}
          required
        />
        {errors.email ? (
          <p className="field__error" id="forgot-email-error">
            {errors.email}
          </p>
        ) : null}
      </div>

      <Button type="submit" loading={reset.isPending}>
        Send reset link
      </Button>

      <div className={styles.footer}>
        Remembered your password?{" "}
        <button type="button" onClick={onBack}>
          Sign in
        </button>
      </div>
    </form>
  );
}
