import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityResponse, ClassPeriod } from '../../types';
import { getSchoolWeek } from '../../utils/week';
import { WeeklyCalendar } from './WeeklyCalendar';

const shifts = [
  { id: 'MORNING', name: 'Manhã', order: 1, startMinutes: 7 * 60 },
  { id: 'AFTERNOON', name: 'Tarde', order: 2, startMinutes: 13 * 60 },
  { id: 'NIGHT', name: 'Noite', order: 3, startMinutes: 18 * 60 },
] as const;

function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function createDensePeriods(): ClassPeriod[] {
  return shifts.flatMap((shift) =>
    Array.from({ length: 6 }, (_, index) => {
      const classNumber = index + 1;
      const startMinutes = shift.startMinutes + index * 45;

      return {
        id: `${shift.id}-${classNumber}`,
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

describe('WeeklyCalendar dynamic period density', () => {
  it('shows a clear state when no active class period is configured', () => {
    render(
      <WeeklyCalendar
        days={getSchoolWeek(new Date(2099, 0, 5))}
        periods={[]}
        availability={[]}
        laboratoryName="Laboratório sem aulas"
        onBookSlot={vi.fn()}
      />,
    );

    expect(screen.getByText('Nenhuma aula foi configurada para esta escola.')).toBeInTheDocument();
  });

  it.each([
    [5, 'comfortable'],
    [6, 'regular'],
    [12, 'compact'],
    [18, 'dense'],
  ] as const)('uses %s configured periods in %s mode', (periodCount, density) => {
    render(
      <WeeklyCalendar
        days={getSchoolWeek(new Date(2099, 0, 5))}
        periods={createDensePeriods().slice(0, periodCount)}
        availability={[]}
        laboratoryName={`Laboratório com ${periodCount} aulas`}
        onBookSlot={vi.fn()}
      />,
    );

    const region = screen.getByRole('region', {
      name: `Agenda semanal de Laboratório com ${periodCount} aulas`,
    });
    const grid = region.querySelector('[data-period-count]');

    expect(grid).toHaveAttribute('data-density', density);
    expect(grid).toHaveAttribute('data-period-count', String(periodCount));
  });

  it('exposes dense mode and the exact count for 18 periods from three shifts', () => {
    const periods = createDensePeriods();

    render(
      <WeeklyCalendar
        days={getSchoolWeek(new Date(2099, 0, 5))}
        periods={periods}
        availability={[]}
        laboratoryName="Laboratório de teste"
        onBookSlot={vi.fn()}
      />,
    );

    const region = screen.getByRole('region', {
      name: 'Agenda semanal de Laboratório de teste',
    });
    const grid = region.querySelector('[data-period-count]');

    expect(periods).toHaveLength(18);
    expect(grid).toHaveAttribute('data-density', 'dense');
    expect(grid).toHaveAttribute('data-period-count', '18');
    expect(within(region).getByText('Manhã')).toBeInTheDocument();
    expect(within(region).getByText('Tarde')).toBeInTheDocument();
    expect(within(region).getByText('Noite')).toBeInTheDocument();
  });

  it('shows a weekday-only shift without treating the other days as reserved', () => {
    const days = getSchoolWeek(new Date(2099, 0, 5));
    const allPeriods = createDensePeriods();
    const periods = [allPeriods[0]!, allPeriods[12]!];
    const availability: AvailabilityResponse[] = days.map((day, dayIndex) => ({
      date: day.isoDate,
      laboratoryId: 'LAB02',
      periods: [
        {
          periodId: periods[0]!.id,
          shiftId: periods[0]!.shiftId,
          shiftName: periods[0]!.shiftName,
          shiftOrder: periods[0]!.shiftOrder,
          classNumber: periods[0]!.classNumber,
          label: periods[0]!.name,
          startTime: periods[0]!.startTime,
          endTime: periods[0]!.endTime,
          status: 'AVAILABLE',
        },
        ...(dayIndex === 2
          ? [
              {
                periodId: periods[1]!.id,
                shiftId: periods[1]!.shiftId,
                shiftName: periods[1]!.shiftName,
                shiftOrder: periods[1]!.shiftOrder,
                classNumber: periods[1]!.classNumber,
                label: periods[1]!.name,
                startTime: periods[1]!.startTime,
                endTime: periods[1]!.endTime,
                status: 'AVAILABLE' as const,
              },
            ]
          : []),
      ],
    }));

    render(
      <WeeklyCalendar
        days={days}
        periods={periods}
        availability={availability}
        laboratoryName="Laboratório com noite na quarta"
        onBookSlot={vi.fn()}
      />,
    );

    const region = screen.getByRole('region', {
      name: 'Agenda semanal de Laboratório com noite na quarta',
    });
    const grid = region.querySelector('[data-period-count]');

    expect(grid).toHaveAttribute('data-period-count', '2');
    expect(region.querySelectorAll('[data-applicable="true"]')).toHaveLength(6);
    expect(region.querySelectorAll('[data-applicable="false"]')).toHaveLength(4);
    expect(within(region).getByText('Noite')).toBeInTheDocument();
  });
});
