import type { LabelHTMLAttributes, ReactNode } from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  hint?: string;
  children: ReactNode;
}

export function Label({ hint, children, ...rest }: LabelProps) {
  return (
    <label className="label" {...rest}>
      {children}
      {hint ? <span className="label__hint"> — {hint}</span> : null}
    </label>
  );
}
