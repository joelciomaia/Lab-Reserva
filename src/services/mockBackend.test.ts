import { describe, expect, it } from 'vitest';

import type { ClassPeriod, CreateReservationRequest } from '../types';
import { getSchoolWeek } from '../utils/week';
import { MockBackend } from './mockBackend';

const createRequest = (
  overrides: Partial<CreateReservationRequest> = {},
): CreateReservationRequest => ({
  laboratoryId: 'LAB02',
  teacherName: 'Professora Joana Alves',
  subject: 'Ciências',
  classGroup: '7º A',
  date: '2026-09-10',
  periodIds: ['P01'],
  knowledgeObjects: 'Investigação científica',
  itemsUsed: 'Kits de robótica',
  notes: 'Organizar os grupos antes da aula.',
  ...overrides,
});

const injectedShifts = [
  { id: 'SHEET-MORNING', name: 'Manhã', order: 1, startMinutes: 7 * 60 },
  { id: 'SHEET-AFTERNOON', name: 'Tarde', order: 2, startMinutes: 13 * 60 },
  { id: 'SHEET-NIGHT', name: 'Noite', order: 3, startMinutes: 18 * 60 },
] as const;

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createInjectedPeriods(): ClassPeriod[] {
  return injectedShifts.flatMap((shift) =>
    Array.from({ length: 6 }, (_, index) => {
      const classNumber = index + 1;
      const startMinutes = shift.startMinutes + index * 45;

      return {
        id: `${shift.id}-CLASS-${classNumber}`,
        shiftId: shift.id,
        shiftName: shift.name,
        shiftOrder: shift.order,
        classNumber,
        name: `${classNumber}ª aula`,
        startTime: formatTime(startMinutes),
        endTime: formatTime(startMinutes + 45),
        order: classNumber,
        active: true,
      };
    }),
  );
}

function createWeekdayAwarePeriods(): ClassPeriod[] {
  return createInjectedPeriods().map((period) =>
    period.shiftId === 'SHEET-NIGHT' ? { ...period, activeWeekdays: [3] as const } : period,
  );
}

describe('MockBackend bootstrap', () => {
  it('preselects the laboratory received through the lab query parameter', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const webAppLink = new URL('https://script.google.com/macros/s/DEPLOYMENT_ID/exec?lab=LAB02');
    const laboratoryId = webAppLink.searchParams.get('lab');

    expect(laboratoryId).toBe('LAB02');

    const bootstrap = await backend.getBootstrapData({
      preselectedLaboratoryId: laboratoryId!,
    });

    expect(bootstrap.preselectedLaboratoryId).toBe('LAB02');
    expect(bootstrap.laboratories).toContainEqual(
      expect.objectContaining({ id: 'LAB02', active: true }),
    );
  });

  it('does not preselect a laboratory that is absent from the active catalog', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    const bootstrap = await backend.getBootstrapData({
      preselectedLaboratoryId: 'LAB404',
    });

    expect(bootstrap).not.toHaveProperty('preselectedLaboratoryId');
  });

  it('provides the demo catalog with five classes in each of three shifts', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const bootstrap = await backend.getBootstrapData();
    const periodsByShift = bootstrap.periods.reduce((groups, period) => {
      const shiftPeriods = groups.get(period.shiftName) ?? [];
      shiftPeriods.push(period);
      groups.set(period.shiftName, shiftPeriods);
      return groups;
    }, new Map<string, ClassPeriod[]>());

    expect(bootstrap.periods).toHaveLength(15);
    expect([...periodsByShift.keys()]).toEqual(['Manhã', 'Tarde', 'Noite']);
    expect(periodsByShift.get('Manhã')).toHaveLength(5);
    expect(periodsByShift.get('Tarde')).toHaveLength(5);
    expect(periodsByShift.get('Noite')).toHaveLength(5);
    expect(
      [...periodsByShift.values()].map((shiftPeriods) =>
        shiftPeriods.map((period) => period.classNumber),
      ),
    ).toEqual([
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
      [1, 2, 3, 4, 5],
    ]);
  });
});

describe('MockBackend injected period catalog', () => {
  const activePeriods = createInjectedPeriods();
  const inactivePeriod: ClassPeriod = {
    id: 'SHEET-NIGHT-ARCHIVED',
    shiftId: 'SHEET-NIGHT',
    shiftName: 'Noite',
    shiftOrder: 3,
    classNumber: 7,
    name: '7ª aula',
    startTime: '22:30',
    endTime: '23:15',
    order: 7,
    active: false,
  };

  it('returns the exact 18 active periods from three injected shifts', async () => {
    const backend = new MockBackend({
      latencyMs: 0,
      periods: [...activePeriods, inactivePeriod],
    });

    const bootstrap = await backend.getBootstrapData();
    const availability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: '2026-10-20',
    });

    expect(activePeriods).toHaveLength(18);
    expect(bootstrap.periods).toEqual(activePeriods);
    expect(availability.periods).toEqual(
      activePeriods.map((period) => ({
        periodId: period.id,
        shiftId: period.shiftId,
        shiftName: period.shiftName,
        shiftOrder: period.shiftOrder,
        classNumber: period.classNumber,
        label: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        status: 'AVAILABLE',
      })),
    );
  });

  it('omits an inactive period and rejects it when creating a reservation', async () => {
    const backend = new MockBackend({
      latencyMs: 0,
      periods: [...activePeriods, inactivePeriod],
    });

    const bootstrap = await backend.getBootstrapData();
    const availability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: '2026-10-20',
    });

    expect(bootstrap.periods.some((period) => period.id === inactivePeriod.id)).toBe(false);
    expect(availability.periods.some((period) => period.periodId === inactivePeriod.id)).toBe(
      false,
    );
    await expect(
      backend.createReservation(
        createRequest({
          date: '2026-10-20',
          periodIds: [inactivePeriod.id],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Selecione pelo menos uma aula válida.',
    });
  });

  it('creates and occupies a reservation using arbitrary IDs from the night shift', async () => {
    const backend = new MockBackend({ latencyMs: 0, periods: activePeriods });
    const periodIds = ['SHEET-NIGHT-CLASS-5', 'SHEET-NIGHT-CLASS-6'];

    const reservation = await backend.createReservation(
      createRequest({
        date: '2026-10-20',
        periodIds,
      }),
    );
    const availability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: '2026-10-20',
    });
    const occupiedPeriods = availability.periods.filter((period) =>
      periodIds.includes(period.periodId),
    );

    expect(reservation).toMatchObject({
      periodIds,
      periodLabels: ['5ª aula', '6ª aula'],
    });
    expect(occupiedPeriods.map((period) => period.reservation?.id)).toEqual([
      reservation.id,
      reservation.id,
    ]);
  });
});

describe('MockBackend weekday-specific shifts', () => {
  const futureWeek = getSchoolWeek(new Date(2099, 0, 5));
  const monday = futureWeek[0]!.isoDate;
  const wednesday = futureWeek[2]!.isoDate;
  const periods = createWeekdayAwarePeriods();
  const nightPeriodId = 'SHEET-NIGHT-CLASS-1';

  it('shows the Wednesday-only night shift on Wednesday but not on Monday', async () => {
    const backend = new MockBackend({
      latencyMs: 0,
      periods,
      initialReservations: [],
    });

    const bootstrap = await backend.getBootstrapData();
    const mondayAvailability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: monday,
    });
    const wednesdayAvailability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: wednesday,
    });

    expect(bootstrap.periods).toHaveLength(18);
    expect(mondayAvailability.periods).toHaveLength(12);
    expect(mondayAvailability.periods.some((period) => period.shiftId === 'SHEET-NIGHT')).toBe(
      false,
    );
    expect(wednesdayAvailability.periods).toHaveLength(18);
    expect(
      wednesdayAvailability.periods.filter((period) => period.shiftId === 'SHEET-NIGHT'),
    ).toHaveLength(6);
  });

  it('rejects the Wednesday-only night period on Monday', async () => {
    const backend = new MockBackend({
      latencyMs: 0,
      periods,
      initialReservations: [],
    });

    await expect(
      backend.createReservation(
        createRequest({
          date: monday,
          periodIds: [nightPeriodId],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Selecione pelo menos uma aula válida.',
    });
  });

  it('rejects invalid dates in availability and reservation requests', async () => {
    const backend = new MockBackend({
      latencyMs: 0,
      periods,
      initialReservations: [],
    });

    await expect(
      backend.getAvailability({
        laboratoryId: 'LAB02',
        date: '2099-02-30',
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Informe uma data válida.',
    });
    await expect(
      backend.createReservation(
        createRequest({
          date: 'data-inválida',
          periodIds: [nightPeriodId],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Informe uma data válida.',
    });
  });
});

describe('MockBackend reservation occupancy', () => {
  const currentWeek = getSchoolWeek(new Date());

  it.each([
    {
      description: 'one morning period',
      date: currentWeek[0]!.isoDate,
      periodIds: ['P01'],
    },
    {
      description: 'two consecutive morning periods',
      date: currentWeek[1]!.isoDate,
      periodIds: ['P01', 'P02'],
    },
    {
      description: 'three consecutive morning periods',
      date: currentWeek[2]!.isoDate,
      periodIds: ['P01', 'P02', 'P03'],
    },
    {
      description: 'two consecutive afternoon periods',
      date: currentWeek[3]!.isoDate,
      periodIds: ['P06', 'P07'],
    },
  ])('exposes the simulated $description block with one reservation id', async (scenario) => {
    const backend = new MockBackend({ latencyMs: 0 });

    const availability = await backend.getAvailability({
      laboratoryId: 'LAB01',
      date: scenario.date,
    });
    const occupiedPeriods = availability.periods.filter(
      (period) => period.status === 'UNAVAILABLE',
    );

    expect(occupiedPeriods.map((period) => period.periodId)).toEqual(scenario.periodIds);
    expect(new Set(occupiedPeriods.map((period) => period.reservation?.id)).size).toBe(1);
    occupiedPeriods.forEach((period, index) => {
      expect(period.periodId).toBe(scenario.periodIds[index]);
      expect(period.status).toBe('UNAVAILABLE');
      expect(period.reservation?.id).toBeTruthy();
      expect(Object.keys(period.reservation ?? {})).toEqual(['id']);
    });
  });

  it('marks every period from a newly created reservation as unavailable', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const request = createRequest({ periodIds: ['P01', 'P02'] });

    const availabilityBefore = await backend.getAvailability({
      laboratoryId: request.laboratoryId,
      date: request.date,
    });
    expect(
      availabilityBefore.periods.filter((period) => request.periodIds.includes(period.periodId)),
    ).toEqual([
      expect.objectContaining({ periodId: 'P01', status: 'AVAILABLE' }),
      expect.objectContaining({ periodId: 'P02', status: 'AVAILABLE' }),
    ]);

    const reservation = await backend.createReservation(request);
    const availabilityAfter = await backend.getAvailability({
      laboratoryId: request.laboratoryId,
      date: request.date,
    });

    expect(reservation).toMatchObject({
      laboratoryId: 'LAB02',
      teacherName: 'Professora Joana Alves',
      subject: 'Ciências',
      classGroup: '7º A',
      date: '2026-09-10',
      periodIds: ['P01', 'P02'],
      periodLabels: ['1ª aula', '2ª aula'],
      knowledgeObjects: 'Investigação científica',
      itemsUsed: 'Kits de robótica',
      notes: 'Organizar os grupos antes da aula.',
    });
    expect(
      availabilityAfter.periods.filter((period) => request.periodIds.includes(period.periodId)),
    ).toEqual([
      expect.objectContaining({
        periodId: 'P01',
        status: 'UNAVAILABLE',
        reservation: {
          id: reservation.id,
        },
      }),
      expect.objectContaining({
        periodId: 'P02',
        status: 'UNAVAILABLE',
        reservation: {
          id: reservation.id,
        },
      }),
    ]);
  });

  it('keeps an equal period available on another date and in another laboratory', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const request = createRequest();

    await backend.createReservation(request);

    const anotherDate = await backend.getAvailability({
      laboratoryId: request.laboratoryId,
      date: '2026-09-11',
    });
    const anotherLaboratory = await backend.getAvailability({
      laboratoryId: 'LAB03',
      date: request.date,
    });

    expect(anotherDate.periods.find((period) => period.periodId === 'P01')).toMatchObject({
      status: 'AVAILABLE',
    });
    expect(anotherLaboratory.periods.find((period) => period.periodId === 'P01')).toMatchObject({
      status: 'AVAILABLE',
    });
  });
});

describe('MockBackend conflict prevention', () => {
  it('rejects a second reservation for the same laboratory, date, and period', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const firstRequest = createRequest();

    const firstReservation = await backend.createReservation(firstRequest);

    await expect(
      backend.createReservation(
        createRequest({
          teacherName: 'Professor Carlos Lima',
          classGroup: '8º B',
          subject: 'Tecnologia',
        }),
      ),
    ).rejects.toMatchObject({
      code: 'TIME_CONFLICT',
      message: 'Um dos horários selecionados não está mais disponível.',
    });

    const availability = await backend.getAvailability({
      laboratoryId: firstRequest.laboratoryId,
      date: firstRequest.date,
    });
    const occupiedPeriod = availability.periods.find((period) => period.periodId === 'P01');
    expect(occupiedPeriod?.status).toBe('UNAVAILABLE');
    expect(occupiedPeriod?.reservation?.id).toBe(firstReservation.id);
  });

  it('does not occupy the other requested periods when one of them conflicts', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    await backend.createReservation(createRequest({ periodIds: ['P01'] }));

    await expect(
      backend.createReservation(createRequest({ periodIds: ['P01', 'P02'] })),
    ).rejects.toMatchObject({ code: 'TIME_CONFLICT' });

    const availability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: '2026-09-10',
    });
    expect(availability.periods.find((period) => period.periodId === 'P02')).toMatchObject({
      status: 'AVAILABLE',
    });
  });
});
