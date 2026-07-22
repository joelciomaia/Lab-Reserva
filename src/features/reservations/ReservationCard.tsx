import { CalendarDays, Clock3, FlaskConical, UsersRound } from 'lucide-react';
import { Card, StatusBadge } from '../../components';
import type { StatusTone } from '../../components';
import type { Reservation } from '../../types';
import { formatDatePtBr } from '../../utils/dates';
import styles from './ReservationCard.module.css';

const reservationStatus: Record<Reservation['status'], { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'Confirmada', tone: 'success' },
  CANCELLED: { label: 'Cancelada', tone: 'danger' },
  COMPLETED: { label: 'Concluída', tone: 'neutral' },
};

export interface ReservationCardProps {
  reservation: Reservation;
}

export function ReservationCard({ reservation }: ReservationCardProps) {
  const status = reservationStatus[reservation.status];

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div>
          <span>Reserva {reservation.id}</span>
          <h2>{reservation.laboratoryName}</h2>
        </div>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <div className={styles.details}>
        <span>
          <CalendarDays size={18} aria-hidden="true" /> {formatDatePtBr(reservation.date)}
        </span>
        <span>
          <Clock3 size={18} aria-hidden="true" /> {reservation.periodLabels.join(' e ')}
        </span>
        <span>
          <UsersRound size={18} aria-hidden="true" /> {reservation.classGroup} ·{' '}
          {reservation.studentCount} alunos
        </span>
        <span>
          <FlaskConical size={18} aria-hidden="true" /> {reservation.subject}
        </span>
      </div>
      <p className={styles.purpose}>{reservation.purpose}</p>
      <div className={styles.footer}>
        <span>
          Agenda:{' '}
          {reservation.calendarStatus === 'SYNCED'
            ? 'sincronizada'
            : reservation.calendarStatus === 'PENDING'
              ? 'sincronização pendente'
              : 'integração desativada'}
        </span>
      </div>
    </Card>
  );
}
