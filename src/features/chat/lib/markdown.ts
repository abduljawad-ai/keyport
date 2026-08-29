// Markdown rendering configuration.
// SECURITY: assistant content is rendered with react-markdown + remark-gfm
// and sanitized with rehype-sanitize. Raw HTML from the model is not
// rendered; link protocols are restricted by the sanitize schema.

import type { Schema } from "hast-util-sanitize";
import { defaultSchema } from "rehype-sanitize";

/**
 * Sanitization schema: the rehype-sanitize default plus `language-*`
 * class names on inline/block code so fenced code keeps its language tag.
 */
export const chatSanitizeSchema: Schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-[a-zA-Z0-9+#-]+$/],
    ],
    span: [...(defaultSchema.attributes?.span ?? [])],
  },
};

/** Extract the language tag from a code element className, if present. */
export function getLanguageFromClassName(className: string | undefined | null): string | null {
  if (!className) return null;
  const match = /language-([a-zA-Z0-9+#-]+)/.exec(className);
  return match ? match[1] : null;
}

/** Recursively extract plain text from React children (for copy buttons). */
export function extractTextFromChildren(children: unknown): string {
  if (children === null || children === undefined) return "";
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (typeof children === "object" && "props" in (children as Record<string, unknown>)) {
    const element = children as { props?: { children?: unknown } };
    return extractTextFromChildren(element.props?.children);
  }
  return "";
}
