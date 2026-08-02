import type { ClassPeriod } from '../types';
import { getIsoWeekday } from '../utils/dates';

export function sortClassPeriods(periods: readonly ClassPeriod[]): ClassPeriod[] {
  return periods.toSorted(
    (left, right) =>
      left.shiftOrder - right.shiftOrder ||
      left.order - right.order ||
      left.startTime.localeCompare(right.startTime) ||
      left.id.localeCompare(right.id),
  );
}

export function areConsecutiveClassPeriods(
  left: ClassPeriod | undefined,
  right: ClassPeriod | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }

  return left.shiftId === right.shiftId && left.endTime === right.startTime;
}

export function getApplicableClassPeriods(
  periods: readonly ClassPeriod[],
  isoDate: string,
): ClassPeriod[] {
  const isoWeekday = getIsoWeekday(isoDate);

  if (isoWeekday === null) {
    throw new RangeError('A data deve estar no formato AAAA-MM-DD.');
  }

  return sortClassPeriods(
    periods.filter(
      (period) =>
        period.active &&
        (period.activeWeekdays === undefined || period.activeWeekdays.includes(isoWeekday)),
    ),
  );
}
