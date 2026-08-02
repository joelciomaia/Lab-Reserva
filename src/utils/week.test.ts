import { describe, expect, it } from 'vitest';
import { getCurrentAgendaReferenceDate, getSchoolWeek } from './week';

function firstDisplayedDay(currentDate: Date): string {
  return getSchoolWeek(getCurrentAgendaReferenceDate(currentDate))[0]!.isoDate;
}

describe('semana inicial da agenda', () => {
  it('mantém a semana vigente de segunda a sexta', () => {
    expect(firstDisplayedDay(new Date(2026, 6, 20, 12))).toBe('2026-07-20');
    expect(firstDisplayedDay(new Date(2026, 6, 24, 23, 59))).toBe('2026-07-20');
  });

  it('avança para a próxima semana no sábado', () => {
    expect(firstDisplayedDay(new Date(2026, 6, 25, 0, 0))).toBe('2026-07-27');
  });

  it('avança para a próxima semana no domingo', () => {
    expect(firstDisplayedDay(new Date(2026, 6, 26, 23, 59))).toBe('2026-07-27');
  });

  it('avança corretamente quando o fim de semana cruza o ano', () => {
    expect(firstDisplayedDay(new Date(2023, 11, 30, 12))).toBe('2024-01-01');
  });
});
