import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

/**
 * Styled text input. Pair with <Label> and a field error paragraph;
 * set `aria-invalid` via the `invalid` prop for accessible error binding.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...rest },
  ref,
) {
  const classes = ["input", invalid ? "input--error" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return <input ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest} />;
});
