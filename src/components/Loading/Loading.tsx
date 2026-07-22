import type { HTMLAttributes } from 'react';
import styles from './Loading.module.css';

export interface LoadingProps extends HTMLAttributes<HTMLDivElement> {
  label?: string | undefined;
  size?: 'small' | 'medium' | 'large' | undefined;
  layout?: 'inline' | 'block' | undefined;
}

export function Loading({
  label = 'Carregando…',
  size = 'medium',
  layout = 'block',
  className,
  ...containerProps
}: LoadingProps) {
  const classes = [styles.loading, styles[layout], className].filter(Boolean).join(' ');

  return (
    <div {...containerProps} className={classes} role="status" aria-live="polite">
      <span className={`${styles.spinner} ${styles[size]}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
