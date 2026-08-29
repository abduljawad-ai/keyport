import { forwardRef, type SelectHTMLAttributes, type ReactNode } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, children, ...rest },
  ref,
) {
  const classes = ["select", invalid ? "select--error" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <select ref={ref} className={classes} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
});
