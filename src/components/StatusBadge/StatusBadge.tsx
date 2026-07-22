import type { HTMLAttributes, ReactNode } from 'react';
import styles from './StatusBadge.module.css';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusPreset {
  label: string;
  tone: StatusTone;
}

const STATUS_PRESETS: Record<string, StatusPreset> = {
  AVAILABLE: { label: 'Disponível', tone: 'success' },
  PARTIAL: { label: 'Parcial', tone: 'warning' },
  UNAVAILABLE: { label: 'Indisponível', tone: 'danger' },
  ATIVA: { label: 'Ativa', tone: 'success' },
  ATIVO: { label: 'Ativo', tone: 'success' },
  CONFIRMADA: { label: 'Confirmada', tone: 'success' },
  PENDENTE: { label: 'Pendente', tone: 'warning' },
  CANCELADA: { label: 'Cancelada', tone: 'danger' },
  CONCLUIDA: { label: 'Concluída', tone: 'neutral' },
  INATIVO: { label: 'Inativo', tone: 'neutral' },
};

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: string | undefined;
  tone?: StatusTone | undefined;
  label?: ReactNode;
}

export function StatusBadge({
  status,
  tone,
  label,
  children,
  className,
  ...badgeProps
}: StatusBadgeProps) {
  const preset = status ? STATUS_PRESETS[status.toUpperCase()] : undefined;
  const resolvedTone = tone ?? preset?.tone ?? 'neutral';
  const content = children ?? label ?? preset?.label ?? status;
  const classes = [styles.badge, styles[resolvedTone], className].filter(Boolean).join(' ');

  return (
    <span {...badgeProps} className={classes}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{content}</span>
    </span>
  );
}
