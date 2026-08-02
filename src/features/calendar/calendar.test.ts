import { describe, expect, it } from 'vitest';
import type { ClassPeriod, PeriodAvailability } from '../../types';
import { buildCalendarEvents, sortPeriods } from './calendar';

const periods: ClassPeriod[] = [
  {
    id: 'P02',
    shiftId: 'MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 2,
    name: '2ª aula',
    startTime: '08:15',
    endTime: '09:00',
    order: 2,
    active: true,
  },
  {
    id: 'P01',
    shiftId: 'MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 1,
    name: '1ª aula',
    startTime: '07:30',
    endTime: '08:15',
    order: 1,
    active: true,
  },
  {
    id: 'P03',
    shiftId: 'MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 3,
    name: '3ª aula',
    startTime: '09:15',
    endTime: '10:00',
    order: 3,
    active: true,
  },
];

function availability(
  reservationIds: Record<string, string | undefined>,
  sourcePeriods: readonly ClassPeriod[] = periods,
): PeriodAvailability[] {
  return sourcePeriods.map((period) => {
    const reservationId = reservationIds[period.id];
    return {
      periodId: period.id,
      shiftId: period.shiftId,
      shiftName: period.shiftName,
      shiftOrder: period.shiftOrder,
      classNumber: period.classNumber,
      label: period.name,
      startTime: period.startTime,
      endTime: period.endTime,
      status: reservationId ? 'UNAVAILABLE' : 'AVAILABLE',
      ...(reservationId
        ? {
            reservation: {
              id: reservationId,
            },
          }
        : {}),
    };
  });
}

const threeShiftPeriods: ClassPeriod[] = [
  {
    id: 'AFTERNOON-BETA',
    shiftId: 'AFTERNOON',
    shiftName: 'Tarde',
    shiftOrder: 2,
    classNumber: 2,
    name: '2ª aula',
    startTime: '09:15',
    endTime: '10:00',
    order: 2,
    active: true,
  },
  {
    id: 'NIGHT-OMEGA',
    shiftId: 'NIGHT',
    shiftName: 'Noite',
    shiftOrder: 3,
    classNumber: 2,
    name: '2ª aula',
    startTime: '10:45',
    endTime: '11:30',
    order: 2,
    active: true,
  },
  {
    id: 'MORNING-ALPHA',
    shiftId: 'MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 1,
    name: '1ª aula',
    startTime: '07:00',
    endTime: '07:45',
    order: 1,
    active: true,
  },
  {
    id: 'NIGHT-ALPHA',
    shiftId: 'NIGHT',
    shiftName: 'Noite',
    shiftOrder: 3,
    classNumber: 1,
    name: '1ª aula',
    startTime: '10:00',
    endTime: '10:45',
    order: 1,
    active: true,
  },
  {
    id: 'MORNING-OMEGA',
    shiftId: 'MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 2,
    name: '2ª aula',
    startTime: '07:45',
    endTime: '08:30',
    order: 2,
    active: true,
  },
  {
    id: 'AFTERNOON-ALPHA',
    shiftId: 'AFTERNOON',
    shiftName: 'Tarde',
    shiftOrder: 2,
    classNumber: 1,
    name: '1ª aula',
    startTime: '08:30',
    endTime: '09:15',
    order: 1,
    active: true,
  },
];

describe('buildCalendarEvents', () => {
  it('mescla aulas adjacentes e contínuas da mesma reserva', () => {
    const events = buildCalendarEvents(periods, availability({ P01: 'R1', P02: 'R1' }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      startIndex: 0,
      rowSpan: 2,
      periodIds: ['P01', 'P02'],
      startTime: '07:30',
      endTime: '09:00',
    });
  });

  it('não mescla IDs diferentes ou períodos separados por intervalo', () => {
    const events = buildCalendarEvents(periods, availability({ P01: 'R1', P02: 'R2', P03: 'R2' }));

    expect(events.map(({ reservation, rowSpan }) => [reservation.id, rowSpan])).toEqual([
      ['R1', 1],
      ['R2', 1],
      ['R2', 1],
    ]);
  });

  it('não mescla a mesma reserva quando existe uma aula livre entre os períodos', () => {
    const events = buildCalendarEvents(periods, availability({ P01: 'R1', P03: 'R1' }));

    expect(events).toHaveLength(2);
    expect(events.map(({ startIndex, rowSpan }) => [startIndex, rowSpan])).toEqual([
      [0, 1],
      [2, 1],
    ]);
  });

  it('não cria evento sem resumo de reserva', () => {
    const unavailableWithoutReservation = availability({}).map((period) =>
      period.periodId === 'P01' ? { ...period, status: 'UNAVAILABLE' as const } : period,
    );

    expect(buildCalendarEvents(periods, unavailableWithoutReservation)).toEqual([]);
  });

  it('segue a ordem canônica dos períodos mesmo com entrada fora de ordem', () => {
    const events = buildCalendarEvents(periods, availability({ P01: 'R1' }));

    expect(events[0]).toMatchObject({ startIndex: 0, periodIds: ['P01'] });
  });

  it('ordena IDs arbitrários por turno e pela ordem da aula', () => {
    expect(sortPeriods(threeShiftPeriods).map((period) => period.id)).toEqual([
      'MORNING-ALPHA',
      'MORNING-OMEGA',
      'AFTERNOON-ALPHA',
      'AFTERNOON-BETA',
      'NIGHT-ALPHA',
      'NIGHT-OMEGA',
    ]);
  });

  it('não mescla a mesma reserva entre três turnos com horários contíguos', () => {
    const reservationIds = Object.fromEntries(
      threeShiftPeriods.map((period) => [period.id, 'R-CROSS-SHIFT']),
    );

    const events = buildCalendarEvents(
      threeShiftPeriods,
      availability(reservationIds, threeShiftPeriods),
    );

    expect(
      events.map(({ startIndex, rowSpan, periodIds, startTime, endTime }) => ({
        startIndex,
        rowSpan,
        periodIds,
        startTime,
        endTime,
      })),
    ).toEqual([
      {
        startIndex: 0,
        rowSpan: 2,
        periodIds: ['MORNING-ALPHA', 'MORNING-OMEGA'],
        startTime: '07:00',
        endTime: '08:30',
      },
      {
        startIndex: 2,
        rowSpan: 2,
        periodIds: ['AFTERNOON-ALPHA', 'AFTERNOON-BETA'],
        startTime: '08:30',
        endTime: '10:00',
      },
      {
        startIndex: 4,
        rowSpan: 2,
        periodIds: ['NIGHT-ALPHA', 'NIGHT-OMEGA'],
        startTime: '10:00',
        endTime: '11:30',
      },
    ]);
  });
});
