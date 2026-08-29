// Auth page layout: centered card with branding.

import type { ReactNode } from "react";
import styles from "./auth.module.css";

export interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.brand} aria-hidden="true">
          <span className={styles.brandMark}>⌘</span>
          <span className={styles.brandName}>Keyport</span>
        </div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        {children}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
      <p className={styles.legal}>
        Your API keys are stored encrypted and are used server-side only. They are never
        returned to your browser.
      </p>
    </div>
  );
}
