// Auth state + mutations built on Supabase Auth.
// SECURITY: credentials are sent only to Supabase Auth, never logged, and
// form state holding passwords is cleared by the forms after submission.

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/shared/supabase/client";
import { normalizeError } from "@/shared/lib/errors";

export const SESSION_QUERY_KEY = ["auth", "session"] as const;

export interface SessionState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

/** Reactive session state; revalidates on every Supabase auth event. */
export function useSession(): SessionState {
  const queryClient = useQueryClient();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) throw normalizeError(error);
      return sessionData.session;
    },
    staleTime: Infinity,
  });

  return {
    session: data ?? null,
    user: data?.user ?? null,
    isLoading: isLoading || isFetching,
  };
}

export interface SignInInput {
  email: string;
  password: string;
}

export function useSignInMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignInInput) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: input.email.trim(),
        password: input.password,
      });
      if (error) throw normalizeError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export interface SignUpInput {
  email: string;
  password: string;
}

export function useSignUpMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignUpInput) => {
      const { data, error } = await supabase.auth.signUp({
        email: input.email.trim(),
        password: input.password,
      });
      if (error) throw normalizeError(error);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useSignOutMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw normalizeError(error);
    },
    onSuccess: () => {
      queryClient.clear(); // drop all cached user data on sign out
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useResetPasswordMutation() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw normalizeError(error);
    },
  });
}
