import type { ClassPeriod, PeriodAvailability, PeriodReservationSummary } from '../../types';
import { areConsecutiveClassPeriods, sortClassPeriods } from '../../domain/periods';

export interface CalendarEventBlock {
  reservation: PeriodReservationSummary;
  startIndex: number;
  rowSpan: number;
  periodIds: string[];
  startTime: string;
  endTime: string;
  lane: number;
  laneCount: number;
}

export function sortPeriods(periods: readonly ClassPeriod[]): ClassPeriod[] {
  return sortClassPeriods(periods);
}

function reservationsForPeriod(period: PeriodAvailability | undefined): PeriodReservationSummary[] {
  if (period?.reservations?.length) {
    return period.reservations;
  }

  return period?.reservation ? [period.reservation] : [];
}

function containsReservation(
  period: PeriodAvailability | undefined,
  reservationId: string,
): PeriodReservationSummary | undefined {
  return reservationsForPeriod(period).find((reservation) => reservation.id === reservationId);
}

function eventsOverlap(left: CalendarEventBlock, right: CalendarEventBlock): boolean {
  const leftEnd = left.startIndex + left.rowSpan;
  const rightEnd = right.startIndex + right.rowSpan;
  return left.startIndex < rightEnd && right.startIndex < leftEnd;
}

function assignEventLanes(events: CalendarEventBlock[]): CalendarEventBlock[] {
  const ordered = events.toSorted(
    (left, right) =>
      left.startIndex - right.startIndex ||
      right.rowSpan - left.rowSpan ||
      left.reservation.id.localeCompare(right.reservation.id),
  );
  const laneEndIndexes: number[] = [];

  for (const event of ordered) {
    const reusableLane = laneEndIndexes.findIndex((endIndex) => endIndex <= event.startIndex);
    const lane = reusableLane >= 0 ? reusableLane : laneEndIndexes.length;
    event.lane = lane;
    laneEndIndexes[lane] = event.startIndex + event.rowSpan;
  }

  return ordered.map((event) => {
    const overlappingEvents = ordered.filter((candidate) => eventsOverlap(event, candidate));
    const laneCount = Math.max(1, ...overlappingEvents.map((candidate) => candidate.lane + 1));
    return { ...event, laneCount };
  });
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
    const reservations = reservationsForPeriod(availabilityByPeriod.get(period.id));

    for (const reservation of reservations) {
      const previousPeriod = orderedPeriods[index - 1];
      const continuesPrevious =
        areConsecutiveClassPeriods(previousPeriod, period) &&
        Boolean(
          previousPeriod &&
            containsReservation(availabilityByPeriod.get(previousPeriod.id), reservation.id),
        );
      if (continuesPrevious) {
        continue;
      }

      const periodIds = [period.id];
      let lastPeriod = period;
      let nextIndex = index + 1;

      while (nextIndex < orderedPeriods.length) {
        const nextPeriod = orderedPeriods[nextIndex]!;
        if (
          !containsReservation(availabilityByPeriod.get(nextPeriod.id), reservation.id) ||
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
        lane: 0,
        laneCount: 1,
      });
    }
  }

  return assignEventLanes(events);
}
