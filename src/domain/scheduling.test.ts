import { describe, expect, it } from 'vitest';

import {
  hasOverlappingPeriods,
  isValidTime,
  isValidTimeRange,
  periodsOverlap,
  timeToMinutes,
  type TimeRange,
} from './scheduling';

describe('time helpers', () => {
  it.each(['00:00', '08:05', '23:59'])('accepts valid time %s', (value) => {
    expect(isValidTime(value)).toBe(true);
  });

  it.each(['24:00', '08:60', '8:00', '08h00', '', null])('rejects invalid time %j', (value) => {
    expect(isValidTime(value)).toBe(false);
  });

  it('converts a time to minutes since midnight', () => {
    expect(timeToMinutes('08:30')).toBe(510);
  });

  it('throws when converting an invalid time', () => {
    expect(() => timeToMinutes('24:00')).toThrow(RangeError);
  });
});

describe('isValidTimeRange', () => {
  it('accepts a period whose start precedes its end', () => {
    expect(isValidTimeRange({ startTime: '08:00', endTime: '08:50' })).toBe(true);
  });

  it.each([
    { startTime: '08:00', endTime: '08:00' },
    { startTime: '09:00', endTime: '08:00' },
    { startTime: '25:00', endTime: '26:00' },
  ])('rejects invalid range $startTime-$endTime', (range) => {
    expect(isValidTimeRange(range)).toBe(false);
  });
});

describe('periodsOverlap', () => {
  const firstPeriod = { startTime: '08:00', endTime: '08:50' };

  it.each([
    { startTime: '08:30', endTime: '09:20' },
    { startTime: '07:30', endTime: '08:20' },
    { startTime: '08:10', endTime: '08:40' },
    { startTime: '08:00', endTime: '08:50' },
  ])('detects overlap with $startTime-$endTime', (secondPeriod) => {
    expect(periodsOverlap(firstPeriod, secondPeriod)).toBe(true);
  });

  it('does not treat adjacent periods as overlapping', () => {
    expect(
      periodsOverlap(firstPeriod, {
        startTime: '08:50',
        endTime: '09:40',
      }),
    ).toBe(false);
  });

  it('does not report separated periods as overlapping', () => {
    expect(
      periodsOverlap(firstPeriod, {
        startTime: '10:00',
        endTime: '10:50',
      }),
    ).toBe(false);
  });

  it('throws for an invalid range', () => {
    expect(() =>
      periodsOverlap(firstPeriod, {
        startTime: '09:00',
        endTime: '08:00',
      }),
    ).toThrow(RangeError);
  });
});

describe('hasOverlappingPeriods', () => {
  it('detects overlap regardless of input order', () => {
    expect(
      hasOverlappingPeriods([
        { startTime: '10:00', endTime: '10:50' },
        { startTime: '08:30', endTime: '09:20' },
        { startTime: '08:00', endTime: '08:50' },
      ]),
    ).toBe(true);
  });

  it('accepts adjacent periods', () => {
    expect(
      hasOverlappingPeriods([
        { startTime: '08:00', endTime: '08:50' },
        { startTime: '08:50', endTime: '09:40' },
        { startTime: '09:40', endTime: '10:30' },
      ]),
    ).toBe(false);
  });

  it('does not mutate the received array', () => {
    const periods: TimeRange[] = [
      { startTime: '10:00', endTime: '10:50' },
      { startTime: '08:00', endTime: '08:50' },
    ];
    const snapshot = structuredClone(periods);

    hasOverlappingPeriods(periods);

    expect(periods).toEqual(snapshot);
  });

  it('throws when one period is invalid', () => {
    expect(() =>
      hasOverlappingPeriods([
        { startTime: '08:00', endTime: '08:50' },
        { startTime: '09:00', endTime: '09:00' },
      ]),
    ).toThrow(RangeError);
  });
});
