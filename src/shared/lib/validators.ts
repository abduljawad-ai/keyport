// Zod validation schemas for frontend forms.
// Server-side validation remains the authoritative guard; these schemas give
// fast, accessible inline feedback.

import { z } from "zod";
import { PROVIDER_IDS } from "@/shared/types/provider";
import { MAX_MESSAGE_CHARS } from "@/shared/types/chat";

const MAX_API_KEY_LENGTH = 1024;
const MAX_LABEL_LENGTH = 200;
const MAX_BASE_URL_LENGTH = 2048;

// --- auth ------------------------------------------------------------------

export const emailSchema = z
  .string()
  .min(1, "Email is required.")
  .email("Enter a valid email address.")
  .max(320, "Email is too long.");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password is too long.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required.").max(128, "Password is too long."),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

// --- provider form -----------------------------------------------------------

export const providerFormSchema = z
  .object({
    provider_id: z.enum(PROVIDER_IDS, {
      errorMap: () => ({ message: "Choose a provider." }),
    }),
    api_key: z
      .string()
      .min(1, "API key is required.")
      .max(MAX_API_KEY_LENGTH, "API key is too long.")
      .refine((value) => value.trim().length > 0, "API key is required."),
    label: z
      .string()
      .max(MAX_LABEL_LENGTH, `Label must be ${MAX_LABEL_LENGTH} characters or fewer.`)
      .optional()
      .or(z.literal("")),
    base_url: z
      .string()
      .max(MAX_BASE_URL_LENGTH, "Base URL is too long.")
      .optional()
      .or(z.literal("")),
    default_model_id: z
      .string()
      .max(MAX_LABEL_LENGTH, "Model name is too long.")
      .optional()
      .or(z.literal("")),
  })
  .superRefine((value, ctx) => {
    // Free-form base URL applies ONLY to the custom provider; named providers
    // use the built-in locked registry URL and shouldn't send one at all.
    if (value.provider_id === "openai-compatible") {
      const raw = (value.base_url ?? "").trim();
      if (!raw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_url"],
          message: "Base URL is required for the custom provider.",
        });
        return;
      }
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_url"],
          message: "Enter a valid absolute URL (including https://).",
        });
        return;
      }
      const isLoopback =
        url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
      if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_url"],
          message: "Base URL must use https://.",
        });
      }
      if (url.username || url.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["base_url"],
          message: "Base URL must not contain credentials.",
        });
      }
    }
  });
export type ProviderFormInput = z.infer<typeof providerFormSchema>;

/** Field-level errors extracted from a ZodError. */
export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// --- composer ------------------------------------------------------------------

export const composerMessageSchema = z
  .string()
  .max(MAX_MESSAGE_CHARS, `Messages must be ${MAX_MESSAGE_CHARS.toLocaleString()} characters or fewer.`)
  .refine((value) => value.trim().length > 0, "Message is empty.");

export const conversationTitleSchema = z
  .string()
  .min(1, "Title is required.")
  .max(140, "Title must be 140 characters or fewer.");
