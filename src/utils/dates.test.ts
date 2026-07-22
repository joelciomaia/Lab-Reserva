import { describe, expect, it } from 'vitest';

import {
  formatDatePtBr,
  formatIsoDate,
  isValidIsoDate,
  validateReservationDate,
  type ReservationDateConstraints,
} from './dates';

const baseConstraints: ReservationDateConstraints = {
  today: '2026-07-22',
  schoolYearStart: '2026-02-02',
  schoolYearEnd: '2026-12-18',
};

describe('isValidIsoDate', () => {
  it('accepts a real leap-day date', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it.each(['2025-02-29', '2026-13-01', '2026-04-31', '22/07/2026'])(
    'rejects invalid date %s',
    (value) => {
      expect(isValidIsoDate(value)).toBe(false);
    },
  );

  it('rejects non-string values', () => {
    expect(isValidIsoDate(null)).toBe(false);
    expect(isValidIsoDate(20260722)).toBe(false);
  });
});

describe('date formatting', () => {
  it('formats a local Date as an ISO calendar date', () => {
    expect(formatIsoDate(new Date(2026, 6, 22, 23, 59))).toBe('2026-07-22');
  });

  it('throws when asked to format an invalid Date', () => {
    expect(() => formatIsoDate(new Date(Number.NaN))).toThrow(RangeError);
  });

  it('formats an ISO date for Brazilian Portuguese display', () => {
    expect(formatDatePtBr('2026-07-22')).toBe('22/07/2026');
  });

  it('uses the provided fallback for an invalid date', () => {
    expect(formatDatePtBr('2026-02-30', 'Data inválida')).toBe('Data inválida');
  });
});

describe('validateReservationDate', () => {
  it('rejects malformed or impossible dates', () => {
    expect(validateReservationDate('2026-02-30', baseConstraints)).toEqual({
      valid: false,
      code: 'INVALID_DATE',
    });
  });

  it('accepts today', () => {
    expect(validateReservationDate('2026-07-22', baseConstraints)).toEqual({
      valid: true,
    });
  });

  it('rejects a past date', () => {
    expect(validateReservationDate('2026-07-21', baseConstraints)).toEqual({
      valid: false,
      code: 'PAST_DATE',
    });
  });

  it.each(['2026-02-01', '2026-12-19'])('rejects date %s outside the school year', (value) => {
    const constraints = { ...baseConstraints, today: '2026-01-01' };

    expect(validateReservationDate(value, constraints)).toEqual({
      valid: false,
      code: 'OUTSIDE_SCHOOL_YEAR',
    });
  });

  it('accepts the exact maximum advance boundary', () => {
    const constraints = { ...baseConstraints, maxAdvanceDays: 30 };

    expect(validateReservationDate('2026-08-21', constraints)).toEqual({
      valid: true,
    });
  });

  it('rejects the day after the maximum advance boundary', () => {
    const constraints = { ...baseConstraints, maxAdvanceDays: 30 };

    expect(validateReservationDate('2026-08-22', constraints)).toEqual({
      valid: false,
      code: 'MAX_ADVANCE_EXCEEDED',
    });
  });

  it('rejects a blocked date', () => {
    const constraints = {
      ...baseConstraints,
      blockedDates: ['2026-08-03'],
    };

    expect(validateReservationDate('2026-08-03', constraints)).toEqual({
      valid: false,
      code: 'BLOCKED_DATE',
    });
  });

  it('rejects invalid constraint configuration', () => {
    expect(() =>
      validateReservationDate('2026-07-22', {
        ...baseConstraints,
        maxAdvanceDays: -1,
      }),
    ).toThrow(RangeError);

    expect(() =>
      validateReservationDate('2026-07-22', {
        ...baseConstraints,
        schoolYearStart: '2026-12-19',
      }),
    ).toThrow(RangeError);
  });
});
