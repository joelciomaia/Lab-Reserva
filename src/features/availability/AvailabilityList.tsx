import { Clock3, UsersRound } from 'lucide-react';
import { StatusBadge } from '../../components';
import type { StatusTone } from '../../components';
import type { PeriodAvailability } from '../../types';
import styles from './AvailabilityList.module.css';

const availabilityPresentation: Record<
  PeriodAvailability['status'],
  { label: string; tone: StatusTone }
> = {
  AVAILABLE: { label: 'Disponível', tone: 'success' },
  PARTIAL: { label: 'Parcial', tone: 'warning' },
  UNAVAILABLE: { label: 'Indisponível', tone: 'danger' },
};

export interface AvailabilityListProps {
  periods: PeriodAvailability[];
  selectable?: boolean;
  selectedPeriodIds?: string[];
  onPeriodToggle?: (periodId: string) => void;
}

export function AvailabilityList({
  periods,
  selectable = false,
  selectedPeriodIds = [],
  onPeriodToggle,
}: AvailabilityListProps) {
  return (
    <div className={styles.list} aria-live="polite">
      {periods.map((period) => {
        const presentation = availabilityPresentation[period.status];
        const isSelected = selectedPeriodIds.includes(period.periodId);
        const isDisabled = period.status === 'UNAVAILABLE';

        return (
          <label
            key={period.periodId}
            className={`${styles.period} ${isSelected ? styles.selected : ''} ${isDisabled ? styles.disabled : ''}`}
          >
            {selectable ? (
              <input
                className={styles.checkbox}
                type="checkbox"
                checked={isSelected}
                disabled={isDisabled}
                onChange={() => onPeriodToggle?.(period.periodId)}
              />
            ) : null}
            <span className={styles.periodMain}>
              <strong>{period.label}</strong>
              <span>
                <Clock3 size={16} aria-hidden="true" /> {period.startTime}–{period.endTime}
              </span>
            </span>
            <span className={styles.periodStatus}>
              <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
              <small>
                <UsersRound size={14} aria-hidden="true" /> {period.availableCapacity} vaga(s)
              </small>
            </span>
          </label>
        );
      })}
    </div>
  );
}
