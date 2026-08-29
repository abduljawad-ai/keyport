// Public auth page: sign in / sign up / forgot password.
// Authenticated users are bounced away by the PublicOnly guard.

import { useState } from "react";
import { AuthLayout } from "@/features/auth/ui/AuthLayout";
import { ForgotPasswordForm } from "@/features/auth/ui/ForgotPasswordForm";
import { SignInForm } from "@/features/auth/ui/SignInForm";
import { SignUpForm } from "@/features/auth/ui/SignUpForm";

type AuthMode = "signin" | "signup" | "forgot";

const COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  signin: {
    title: "Welcome back",
    subtitle: "Sign in to continue chatting with your own provider keys.",
  },
  signup: {
    title: "Create your account",
    subtitle: "Add your API key once, use it on every device.",
  },
  forgot: {
    title: "Reset your password",
    subtitle: "We'll email you a link to reset your password.",
  },
};

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const copy = COPY[mode];

  return (
    <AuthLayout title={copy.title} subtitle={copy.subtitle}>
      {mode === "signin" ? (
        <SignInForm
          onForgotPassword={() => setMode("forgot")}
          onSwitchToSignUp={() => setMode("signup")}
        />
      ) : mode === "signup" ? (
        <SignUpForm onSwitchToSignIn={() => setMode("signin")} />
      ) : (
        <ForgotPasswordForm onBack={() => setMode("signin")} />
      )}
    </AuthLayout>
  );
}

export default AuthPage;
