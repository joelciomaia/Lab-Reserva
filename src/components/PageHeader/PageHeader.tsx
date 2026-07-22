import type { HTMLAttributes, ReactNode } from 'react';
import styles from './PageHeader.module.css';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
  ...headerProps
}: PageHeaderProps) {
  const classes = [styles.header, className].filter(Boolean).join(' ');

  return (
    <header {...headerProps} className={classes}>
      <div className={styles.copy}>
        {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
        <h1 className={styles.title} tabIndex={-1}>
          {title}
        </h1>
        {description ? <div className={styles.description}>{description}</div> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
