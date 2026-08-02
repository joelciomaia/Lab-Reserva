import { Check, Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button } from '../../components';
import type { AvailabilityResponse, ClassPeriod } from '../../types';
import { formatDatePtBr, formatIsoDate } from '../../utils/dates';
import type { WeekDay } from '../../utils/week';
import type { CalendarEventBlock } from './calendar';
import { buildCalendarEvents, sortPeriods } from './calendar';
import styles from './WeeklyCalendar.module.css';

interface SelectedEvent {
  day: WeekDay;
  event: CalendarEventBlock;
}

export interface WeeklyCalendarProps {
  days: WeekDay[];
  periods: ClassPeriod[];
  availability: AvailabilityResponse[];
  laboratoryName: string;
  newReservationId?: string;
  onBookSlot: (date: string, periodId: string) => void;
}

const eventToneClasses = ['eventBlue', 'eventTeal', 'eventViolet', 'eventAmber'] as const;

type CalendarDensity = 'comfortable' | 'regular' | 'compact' | 'dense';

function eventTone(reservationId: string): string {
  const hash = [...reservationId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return styles[eventToneClasses[hash % eventToneClasses.length]!] ?? '';
}

function getCalendarDensity(periodCount: number): CalendarDensity {
  if (periodCount <= 5) {
    return 'comfortable';
  }

  if (periodCount <= 8) {
    return 'regular';
  }

  if (periodCount <= 12) {
    return 'compact';
  }

  return 'dense';
}

export function WeeklyCalendar({
  days,
  periods,
  availability,
  laboratoryName,
  newReservationId,
  onBookSlot,
}: WeeklyCalendarProps) {
  const applicablePeriodIds = useMemo(
    () =>
      new Set(
        availability.flatMap((dayAvailability) =>
          dayAvailability.periods.map((period) => period.periodId),
        ),
      ),
    [availability],
  );
  const orderedPeriods = useMemo(
    () =>
      sortPeriods(
        availability.length === 0
          ? periods
          : periods.filter((period) => applicablePeriodIds.has(period.id)),
      ),
    [applicablePeriodIds, availability.length, periods],
  );
  const [selectedEvent, setSelectedEvent] = useState<SelectedEvent | null>(null);
  const dialogTitleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedElement = useRef<HTMLElement | null>(null);
  const today = formatIsoDate(new Date());
  const density = getCalendarDensity(orderedPeriods.length);
  const dayLayouts = useMemo(
    () =>
      days.map((day) => {
        const dayAvailability = availability.find((item) => item.date === day.isoDate);
        const events = buildCalendarEvents(orderedPeriods, dayAvailability?.periods ?? []);
        return {
          day,
          availabilityByPeriod: new Map(
            dayAvailability?.periods.map((period) => [period.periodId, period]) ?? [],
          ),
          eventByStartIndex: new Map(events.map((event) => [event.startIndex, event])),
        };
      }),
    [availability, days, orderedPeriods],
  );

  function openEvent(day: WeekDay, event: CalendarEventBlock) {
    lastFocusedElement.current = document.activeElement as HTMLElement | null;
    setSelectedEvent({ day, event });
  }

  function closeEvent() {
    setSelectedEvent(null);
    const elementToFocus = lastFocusedElement.current;
    window.requestAnimationFrame(() => elementToFocus?.focus());
  }

  function startsShift(periodIndex: number): boolean {
    return (
      periodIndex === 0 ||
      orderedPeriods[periodIndex - 1]?.shiftId !== orderedPeriods[periodIndex]?.shiftId
    );
  }

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    closeButtonRef.current?.focus();
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeEvent();
      }

      if (event.key === 'Tab') {
        const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled)',
        );
        if (!focusableElements?.length) {
          return;
        }

        const firstElement = focusableElements[0]!;
        const lastElement = focusableElements[focusableElements.length - 1]!;
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [selectedEvent]);

  return (
    <>
      <div
        className={styles.viewport}
        role="region"
        aria-label={`Agenda semanal de ${laboratoryName}`}
        tabIndex={0}
      >
        <div
          className={styles.grid}
          style={{ '--day-count': days.length } as CSSProperties}
          data-density={density}
          data-period-count={orderedPeriods.length}
        >
          <div className={styles.corner} aria-hidden="true">
            Horário
          </div>

          {days.map((day, dayIndex) => (
            <div
              className={`${styles.dayHeader} ${day.isoDate === today ? styles.today : ''}`}
              style={{ gridColumn: dayIndex + 2, gridRow: 1 }}
              key={day.isoDate}
              aria-label={`${day.name}, ${day.shortDate}`}
              aria-current={day.isoDate === today ? 'date' : undefined}
            >
              <span>{day.name.slice(0, 3)}</span>
              <strong>{day.shortDate.slice(0, 2)}</strong>
            </div>
          ))}

          {orderedPeriods.length === 0 ? (
            <div className={styles.emptyCalendar} style={{ gridColumn: '1 / -1', gridRow: 2 }}>
              Nenhuma aula foi configurada para esta escola.
            </div>
          ) : null}

          {orderedPeriods.map((period, periodIndex) => {
            const beginsShift = startsShift(periodIndex);
            const beginsLaterShift = periodIndex > 0 && beginsShift;

            return (
              <div
                className={`${styles.timeCell} ${beginsLaterShift ? styles.shiftBoundary : ''}`}
                style={{ gridColumn: 1, gridRow: periodIndex + 2 }}
                key={period.id}
              >
                {beginsShift ? (
                  <small className={styles.shiftName} title={period.shiftName}>
                    {period.shiftName}
                  </small>
                ) : null}
                <strong>{period.startTime}</strong>
                <span>{period.name}</span>
              </div>
            );
          })}

          {dayLayouts.flatMap(({ day, availabilityByPeriod }, dayIndex) => {
            return orderedPeriods.map((period, periodIndex) => {
              const slot = availabilityByPeriod.get(period.id);
              const isApplicable = slot !== undefined;
              const isPast = day.isoDate < today;
              const beginsLaterShift = periodIndex > 0 && startsShift(periodIndex);

              return (
                <div
                  className={`${styles.slotCell} ${
                    slot?.status === 'UNAVAILABLE' ? styles.occupiedCell : ''
                  } ${isApplicable ? '' : styles.notApplicableCell} ${
                    isPast ? styles.pastCell : ''
                  } ${beginsLaterShift ? styles.shiftBoundary : ''}`}
                  style={{ gridColumn: dayIndex + 2, gridRow: periodIndex + 2 }}
                  key={`cell-${day.isoDate}-${period.id}`}
                  data-applicable={isApplicable}
                  aria-hidden="true"
                />
              );
            });
          })}

          {orderedPeriods.flatMap((period, periodIndex) =>
            dayLayouts.map(({ day, availabilityByPeriod, eventByStartIndex }, dayIndex) => {
              const slot = availabilityByPeriod.get(period.id);
              const event = eventByStartIndex.get(periodIndex);

              if (slot?.status === 'AVAILABLE' && day.isoDate >= today) {
                const accessibleLabel = `${day.name}, ${day.shortDate}, ${period.name}, ${period.startTime} às ${period.endTime}`;
                return (
                  <button
                    className={styles.freeSlot}
                    style={{ gridColumn: dayIndex + 2, gridRow: periodIndex + 2 }}
                    type="button"
                    aria-label={`${accessibleLabel}, livre. Fazer agendamento`}
                    key={`action-${day.isoDate}-${period.id}`}
                    onClick={() => onBookSlot(day.isoDate, period.id)}
                  >
                    <Plus className={styles.slotPlus} size={17} aria-hidden="true" />
                    <span>Agendar</span>
                  </button>
                );
              }

              if (!event) {
                return null;
              }

              const { reservation } = event;
              const isNew = reservation.id === newReservationId;
              return (
                <button
                  className={`${styles.event} ${eventTone(reservation.id)} ${
                    isNew ? styles.newEvent : ''
                  }`}
                  style={{
                    gridColumn: dayIndex + 2,
                    gridRow: `${event.startIndex + 2} / span ${event.rowSpan}`,
                  }}
                  type="button"
                  data-span={event.rowSpan}
                  aria-haspopup="dialog"
                  aria-label={`${day.name}, ${day.shortDate}, horário reservado, ${event.startTime} às ${event.endTime}. Ver detalhes`}
                  key={`${day.isoDate}-${reservation.id}-${event.startIndex}`}
                  onClick={() => openEvent(day, event)}
                >
                  <strong>Reservado</strong>
                  <span>Horário indisponível</span>
                  <small>
                    {event.startTime}–{event.endTime}
                  </small>
                  {isNew ? (
                    <Check className={styles.newEventIcon} size={15} aria-hidden="true" />
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>

      {selectedEvent ? (
        <div
          className={styles.dialogBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEvent();
            }
          }}
        >
          <section
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
          >
            <button
              ref={closeButtonRef}
              className={styles.dialogClose}
              type="button"
              aria-label="Fechar detalhes"
              onClick={closeEvent}
            >
              <X size={20} aria-hidden="true" />
            </button>
            <p>Agenda</p>
            <h2 id={dialogTitleId}>Horário reservado</h2>
            <dl>
              <div>
                <dt>Data</dt>
                <dd>{formatDatePtBr(selectedEvent.day.isoDate)}</dd>
              </div>
              <div>
                <dt>Horário</dt>
                <dd>
                  {selectedEvent.event.startTime}–{selectedEvent.event.endTime}
                </dd>
              </div>
            </dl>
            <Button variant="secondary" fullWidth onClick={closeEvent}>
              Fechar
            </Button>
          </section>
        </div>
      ) : null}
    </>
  );
}
