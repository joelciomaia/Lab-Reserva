import { ArrowRight, CalendarDays, MonitorCog, UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, StatusBadge } from '../../components';
import type { StatusTone } from '../../components';
import type { Laboratory } from '../../types';
import styles from './LaboratoryCard.module.css';

const statusPresentation: Record<Laboratory['status'], { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: 'Disponível', tone: 'success' },
  PARTIAL: { label: 'Disponibilidade parcial', tone: 'warning' },
  UNAVAILABLE: { label: 'Indisponível', tone: 'danger' },
  MAINTENANCE: { label: 'Em manutenção', tone: 'danger' },
};

const useTypeLabel: Record<Laboratory['useType'], string> = {
  EXCLUSIVE: 'Uso exclusivo',
  SHARED: 'Uso compartilhado',
  OPEN: 'Uso livre',
};

export interface LaboratoryCardProps {
  laboratory: Laboratory;
}

export function LaboratoryCard({ laboratory }: LaboratoryCardProps) {
  const presentation = statusPresentation[laboratory.status];

  return (
    <Card className={styles.card}>
      <div className={styles.heading}>
        <span className={styles.icon} aria-hidden="true">
          <MonitorCog size={22} />
        </span>
        <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
      </div>
      <div className={styles.copy}>
        <h3>{laboratory.name}</h3>
        <p>{laboratory.description}</p>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>
            <UsersRound size={17} aria-hidden="true" /> Capacidade
          </dt>
          <dd>{laboratory.capacity} pessoas</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={17} aria-hidden="true" /> Modalidade
          </dt>
          <dd>{useTypeLabel[laboratory.useType]}</dd>
        </div>
      </dl>
      {laboratory.statusMessage ? (
        <p className={styles.statusMessage}>{laboratory.statusMessage}</p>
      ) : null}
      <Link
        className={styles.link}
        to={`/reservar?lab=${encodeURIComponent(laboratory.id)}`}
        aria-label={`Reservar ${laboratory.name}`}
      >
        Ver horários <ArrowRight size={17} aria-hidden="true" />
      </Link>
    </Card>
  );
}
