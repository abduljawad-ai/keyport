// Sanitized markdown renderer for assistant messages.
// SECURITY: react-markdown + remark-gfm + rehype-sanitize; raw HTML from
// model output is never rendered; links open in a new tab with
// rel="noopener noreferrer".

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { chatSanitizeSchema } from "@/features/chat/lib/markdown";
import { CodeBlock } from "@/features/chat/ui/CodeBlock";
import styles from "./chat.module.css";

const components: Components = {
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  code({ className, children }) {
    const isBlock =
      Boolean(className?.includes("language-")) || String(children ?? "").includes("\n");
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return <code className={styles.inlineCode}>{children}</code>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, chatSanitizeSchema]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
