// Sign up form with confirm-password validation.
// Handles both immediate sessions and "confirm your email" flows.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSignUpMutation } from "@/features/auth/model/authQueries";
import { Button, Input, Label, useToast } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { flattenZodErrors, signUpSchema } from "@/shared/lib/validators";
import styles from "./auth.module.css";

export interface SignUpFormProps {
  onSwitchToSignIn: () => void;
}

export function SignUpForm({ onSwitchToSignIn }: SignUpFormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const signUp = useSignUpMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationNeeded, setConfirmationNeeded] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = signUpSchema.safeParse({ email, password, confirmPassword });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});

    try {
      const result = await signUp.mutateAsync(parsed.data);
      // Clear secrets from form state immediately after submission.
      setPassword("");
      setConfirmPassword("");

      if (result.session) {
        toast.success("Account created.");
        navigate("/chat", { replace: true });
      } else {
        setConfirmationNeeded(true);
      }
    } catch (err) {
      const normalized = normalizeError(err);
      setFormError(normalized.message || getUserFriendlyMessage(normalized.code));
    }
  };

  if (confirmationNeeded) {
    return (
      <div className={styles.form}>
        <div className={styles.notice} role="status">
          Check your inbox — we sent a confirmation link to <strong>{email}</strong>. Confirm
          your email, then sign in.
        </div>
        <Button variant="secondary" onClick={onSwitchToSignIn}>
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
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "signup-email-error" : undefined}
          required
        />
        {errors.email ? (
          <p className="field__error" id="signup-email-error">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="field">
        <Label htmlFor="signup-password" hint="at least 8 characters">
          Password
        </Label>
        <Input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "signup-password-error" : undefined}
          required
        />
        {errors.password ? (
          <p className="field__error" id="signup-password-error">
            {errors.password}
          </p>
        ) : null}
      </div>

      <div className="field">
        <Label htmlFor="signup-confirm">Confirm password</Label>
        <Input
          id="signup-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          invalid={Boolean(errors.confirmPassword)}
          aria-describedby={errors.confirmPassword ? "signup-confirm-error" : undefined}
          required
        />
        {errors.confirmPassword ? (
          <p className="field__error" id="signup-confirm-error">
            {errors.confirmPassword}
          </p>
        ) : null}
      </div>

      <Button type="submit" loading={signUp.isPending}>
        Create account
      </Button>

      <div className={styles.footer}>
        Already have an account?{" "}
        <button type="button" onClick={onSwitchToSignIn}>
          Sign in
        </button>
      </div>
    </form>
  );
}
