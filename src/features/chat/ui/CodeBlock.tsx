// Code block with language label + copy button (no syntax highlighting —
// avoids unsafe/unnecessary dependencies per spec Part 4 §19).

import type { ReactNode } from "react";
import { Check } from "@/shared/ui";
import { extractTextFromChildren, getLanguageFromClassName } from "@/features/chat/lib/markdown";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import styles from "./chat.module.css";

function findLanguage(node: ReactNode): string | null {
  if (node === null || node === undefined) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const result = findLanguage(child);
      if (result) return result;
    }
    return null;
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as {
      props?: { className?: string; children?: ReactNode };
    };
    const language = getLanguageFromClassName(element.props?.className);
    if (language) return language;
    return findLanguage(element.props?.children);
  }
  return null;
}

export function CodeBlock({ children }: { children: ReactNode }) {
  const { copied, copy } = useCopyToClipboard();
  const language = findLanguage(children);
  const codeText = extractTextFromChildren(children).replace(/\n$/, "");

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeBlockLanguage}>{language ?? "code"}</span>
        <button
          type="button"
          className={styles.codeBlockCopy}
          onClick={() => void copy(codeText)}
          aria-label="Copy code to clipboard"
        >
          {copied ? (
            <>
              <Check size={14} weight="bold" />
              Copied
            </>
          ) : (
            "Copy"
          )}
        </button>
      </div>
      <pre className={styles.codeBlockPre}>{children}</pre>
    </div>
  );
}
