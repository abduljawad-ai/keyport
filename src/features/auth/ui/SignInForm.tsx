// Sign in form: email + password with inline validation.
// Password state is cleared after a successful sign-in.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useSignInMutation } from "@/features/auth/model/authQueries";
import { Button, Input, Label, useToast } from "@/shared/ui";
import { getUserFriendlyMessage, normalizeError } from "@/shared/lib/errors";
import { flattenZodErrors, signInSchema } from "@/shared/lib/validators";
import styles from "./auth.module.css";

export interface SignInFormProps {
  onForgotPassword: () => void;
  onSwitchToSignUp: () => void;
}

export function SignInForm({ onForgotPassword, onSwitchToSignUp }: SignInFormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const signIn = useSignInMutation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrors(flattenZodErrors(parsed.error));
      return;
    }
    setErrors({});

    try {
      await signIn.mutateAsync(parsed.data);
      setPassword(""); // never keep credentials in state after success
      toast.success("Signed in successfully.");
      navigate("/chat", { replace: true });
    } catch (err) {
      const normalized = normalizeError(err);
      setFormError(getUserFriendlyMessage(normalized.code) !== normalized.message
        ? normalized.message
        : getUserFriendlyMessage(normalized.code));
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {formError ? (
        <div className="form-error" role="alert">
          {formError}
        </div>
      ) : null}

      <div className="field">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "signin-email-error" : undefined}
          required
        />
        {errors.email ? (
          <p className="field__error" id="signin-email-error">
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="field">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "signin-password-error" : undefined}
          required
        />
        {errors.password ? (
          <p className="field__error" id="signin-password-error">
            {errors.password}
          </p>
        ) : null}
      </div>

      <div className={styles.links}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onForgotPassword}>
          Forgot password?
        </button>
      </div>

      <Button type="submit" loading={signIn.isPending}>
        Sign in
      </Button>

      <div className={styles.footer}>
        New to Keyport?{" "}
        <button type="button" onClick={onSwitchToSignUp}>
          Create an account
        </button>
      </div>
    </form>
  );
}
