import { CircleAlert } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import styles from './ErrorMessage.module.css';

export interface ErrorMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export function ErrorMessage({
  title = 'Não foi possível concluir',
  children,
  action,
  className,
  role = 'alert',
  ...containerProps
}: ErrorMessageProps) {
  const classes = [styles.container, className].filter(Boolean).join(' ');

  return (
    <div {...containerProps} className={classes} role={role}>
      <CircleAlert className={styles.icon} size={22} aria-hidden="true" />
      <div className={styles.content}>
        <p className={styles.title}>{title}</p>
        <div className={styles.message}>{children}</div>
        {action ? <div className={styles.action}>{action}</div> : null}
      </div>
    </div>
  );
}
