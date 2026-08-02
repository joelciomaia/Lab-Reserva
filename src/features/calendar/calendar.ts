import type { ClassPeriod, PeriodAvailability, PeriodReservationSummary } from '../../types';
import { areConsecutiveClassPeriods, sortClassPeriods } from '../../domain/periods';

export interface CalendarEventBlock {
  reservation: PeriodReservationSummary;
  startIndex: number;
  rowSpan: number;
  periodIds: string[];
  startTime: string;
  endTime: string;
}

export function sortPeriods(periods: readonly ClassPeriod[]): ClassPeriod[] {
  return sortClassPeriods(periods);
}

export function buildCalendarEvents(
  periods: readonly ClassPeriod[],
  availability: readonly PeriodAvailability[],
): CalendarEventBlock[] {
  const orderedPeriods = sortPeriods(periods);
  const availabilityByPeriod = new Map(availability.map((item) => [item.periodId, item]));
  const events: CalendarEventBlock[] = [];

  for (let index = 0; index < orderedPeriods.length; index += 1) {
    const period = orderedPeriods[index]!;
    const reservation = availabilityByPeriod.get(period.id)?.reservation;
    if (!reservation) {
      continue;
    }

    const previousPeriod = orderedPeriods[index - 1];
    const previousReservation = previousPeriod
      ? availabilityByPeriod.get(previousPeriod.id)?.reservation
      : undefined;
    const continuesPrevious =
      areConsecutiveClassPeriods(previousPeriod, period) &&
      previousReservation?.id === reservation.id;
    if (continuesPrevious) {
      continue;
    }

    const periodIds = [period.id];
    let lastPeriod = period;
    let nextIndex = index + 1;

    while (nextIndex < orderedPeriods.length) {
      const nextPeriod = orderedPeriods[nextIndex]!;
      const nextReservation = availabilityByPeriod.get(nextPeriod.id)?.reservation;
      if (
        nextReservation?.id !== reservation.id ||
        !areConsecutiveClassPeriods(lastPeriod, nextPeriod)
      ) {
        break;
      }

      periodIds.push(nextPeriod.id);
      lastPeriod = nextPeriod;
      nextIndex += 1;
    }

    events.push({
      reservation,
      startIndex: index,
      rowSpan: periodIds.length,
      periodIds,
      startTime: period.startTime,
      endTime: lastPeriod.endTime,
    });
  }

  return events;
}
