const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface TimeRange {
  startTime: string;
  endTime: string;
}

export function isValidTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

export function timeToMinutes(value: string): number {
  if (!isValidTime(value)) {
    throw new RangeError('Use um horário válido no formato HH:mm.');
  }

  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(3, 5));
  return hours * 60 + minutes;
}

export function isValidTimeRange(range: TimeRange): boolean {
  return (
    isValidTime(range.startTime) &&
    isValidTime(range.endTime) &&
    timeToMinutes(range.startTime) < timeToMinutes(range.endTime)
  );
}

function assertValidTimeRange(range: TimeRange): void {
  if (!isValidTimeRange(range)) {
    throw new RangeError(
      'O período deve possuir horários válidos e o início deve anteceder o fim.',
    );
  }
}

export function periodsOverlap(left: TimeRange, right: TimeRange): boolean {
  assertValidTimeRange(left);
  assertValidTimeRange(right);

  const leftStart = timeToMinutes(left.startTime);
  const leftEnd = timeToMinutes(left.endTime);
  const rightStart = timeToMinutes(right.startTime);
  const rightEnd = timeToMinutes(right.endTime);

  return leftStart < rightEnd && rightStart < leftEnd;
}

export function hasOverlappingPeriods(periods: readonly TimeRange[]): boolean {
  const periodsInMinutes = periods.map((period) => {
    assertValidTimeRange(period);

    return {
      start: timeToMinutes(period.startTime),
      end: timeToMinutes(period.endTime),
    };
  });

  const sortedPeriods = periodsInMinutes.toSorted((left, right) => left.start - right.start);

  let latestEnd = -1;

  for (const period of sortedPeriods) {
    if (period.start < latestEnd) {
      return true;
    }

    latestEnd = Math.max(latestEnd, period.end);
  }

  return false;
}
