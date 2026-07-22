import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

export type CardVariant = 'default' | 'accent' | 'subtle';
export type CardPadding = 'small' | 'medium' | 'large';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant | undefined;
  padding?: CardPadding | undefined;
}

export function Card({
  variant = 'default',
  padding = 'medium',
  className,
  ...cardProps
}: CardProps) {
  const classes = [styles.card, styles[variant], styles[padding], className]
    .filter(Boolean)
    .join(' ');

  return <div {...cardProps} className={classes} />;
}
