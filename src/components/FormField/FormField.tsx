import type { ReactNode } from 'react';
import styles from './FormField.module.css';

export interface FormFieldProps {
  id: string;
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean | undefined;
  labelHidden?: boolean | undefined;
  className?: string | undefined;
  hintId?: string | undefined;
  errorId?: string | undefined;
}

export function FormField({
  id,
  label,
  children,
  hint,
  error,
  required = false,
  labelHidden = false,
  className,
  hintId = `${id}-hint`,
  errorId = `${id}-error`,
}: FormFieldProps) {
  const classes = [styles.field, className].filter(Boolean).join(' ');
  const labelClasses = [styles.label, labelHidden && styles.visuallyHidden]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <label className={labelClasses} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
