import { useId } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
  ...sectionProps
}: EmptyStateProps) {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const classes = [styles.emptyState, className].filter(Boolean).join(' ');

  return (
    <section {...sectionProps} className={classes} aria-labelledby={titleId}>
      {icon ? (
        <div className={styles.icon} aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {description ? <div className={styles.description}>{description}</div> : null}
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}
