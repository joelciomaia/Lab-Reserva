import { addDays, addWeeks, format, isWeekend, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const WEEKDAY_NAMES = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] as const;

export interface WeekDay {
  date: Date;
  isoDate: string;
  name: (typeof WEEKDAY_NAMES)[number];
  shortDate: string;
}

export function getCurrentAgendaReferenceDate(currentDate: Date): Date {
  if (!isWeekend(currentDate)) {
    return new Date(currentDate);
  }

  return addWeeks(startOfWeek(currentDate, { weekStartsOn: 1 }), 1);
}

export function getSchoolWeek(referenceDate: Date): WeekDay[] {
  const monday = startOfWeek(referenceDate, { weekStartsOn: 1 });

  return WEEKDAY_NAMES.map((name, index) => {
    const date = addDays(monday, index);
    return {
      date,
      isoDate: format(date, 'yyyy-MM-dd'),
      name,
      shortDate: format(date, 'dd/MM'),
    };
  });
}

export function formatWeekRange(referenceDate: Date): string {
  const days = getSchoolWeek(referenceDate);
  const firstDay = days[0]!.date;
  const lastDay = days[4]!.date;

  if (firstDay.getMonth() === lastDay.getMonth()) {
    return `${format(firstDay, 'd')} a ${format(lastDay, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
  }

  return `${format(firstDay, "d 'de' MMMM", { locale: ptBR })} a ${format(lastDay, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
}
