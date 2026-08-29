import { forwardRef, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, ...rest },
  ref,
) {
  const classes = ["textarea", invalid ? "textarea--error" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <textarea ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
});
