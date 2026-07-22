import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'small' | 'medium';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  fullWidth?: boolean | undefined;
  isLoading?: boolean | undefined;
  loadingLabel?: string | undefined;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    className,
    disabled,
    fullWidth = false,
    isLoading = false,
    loadingLabel = 'Aguarde…',
    size = 'medium',
    type = 'button',
    variant = 'primary',
    ...buttonProps
  },
  ref,
) {
  const classes = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      {...buttonProps}
      ref={ref}
      type={type}
      className={classes}
      disabled={isLoading ? true : disabled}
      aria-busy={isLoading || undefined}
    >
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      <span>{isLoading ? loadingLabel : children}</span>
    </button>
  );
});
