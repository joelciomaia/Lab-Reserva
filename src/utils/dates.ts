import { addDays, format, isAfter, isBefore, isValid, parse } from 'date-fns';

const ISO_DATE_FORMAT = 'yyyy-MM-dd';
const DISPLAY_DATE_FORMAT = 'dd/MM/yyyy';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PARSE_REFERENCE_DATE = new Date(2000, 0, 1);

export type ReservationDateError =
  'INVALID_DATE' | 'PAST_DATE' | 'OUTSIDE_SCHOOL_YEAR' | 'MAX_ADVANCE_EXCEEDED' | 'BLOCKED_DATE';

export interface ReservationDateConstraints {
  today: string;
  schoolYearStart: string;
  schoolYearEnd: string;
  maxAdvanceDays?: number;
  blockedDates?: readonly string[];
}

export type DateValidationResult = { valid: true } | { valid: false; code: ReservationDateError };

function parseIsoDate(value: string): Date | null {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const parsedDate = parse(value, ISO_DATE_FORMAT, PARSE_REFERENCE_DATE);

  if (!isValid(parsedDate) || format(parsedDate, ISO_DATE_FORMAT) !== value) {
    return null;
  }

  return parsedDate;
}

function parseConstraintDate(value: string, fieldName: string): Date {
  const parsedDate = parseIsoDate(value);

  if (!parsedDate) {
    throw new RangeError(`${fieldName} deve ser uma data válida no formato AAAA-MM-DD.`);
  }

  return parsedDate;
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && parseIsoDate(value) !== null;
}

export function formatIsoDate(date: Date): string {
  if (!isValid(date)) {
    throw new RangeError('Não é possível formatar uma data inválida.');
  }

  return format(date, ISO_DATE_FORMAT);
}

export function formatDatePtBr(value: string, fallback = '—'): string {
  const parsedDate = parseIsoDate(value);

  return parsedDate ? format(parsedDate, DISPLAY_DATE_FORMAT) : fallback;
}

export function validateReservationDate(
  value: string,
  constraints: ReservationDateConstraints,
): DateValidationResult {
  const reservationDate = parseIsoDate(value);

  if (!reservationDate) {
    return { valid: false, code: 'INVALID_DATE' };
  }

  const today = parseConstraintDate(constraints.today, 'today');
  const schoolYearStart = parseConstraintDate(constraints.schoolYearStart, 'schoolYearStart');
  const schoolYearEnd = parseConstraintDate(constraints.schoolYearEnd, 'schoolYearEnd');

  if (isAfter(schoolYearStart, schoolYearEnd)) {
    throw new RangeError('schoolYearStart não pode ser posterior a schoolYearEnd.');
  }

  if (isBefore(reservationDate, today)) {
    return { valid: false, code: 'PAST_DATE' };
  }

  if (isBefore(reservationDate, schoolYearStart) || isAfter(reservationDate, schoolYearEnd)) {
    return { valid: false, code: 'OUTSIDE_SCHOOL_YEAR' };
  }

  if (constraints.maxAdvanceDays !== undefined) {
    if (!Number.isInteger(constraints.maxAdvanceDays) || constraints.maxAdvanceDays < 0) {
      throw new RangeError('maxAdvanceDays deve ser um inteiro não negativo.');
    }

    const lastAllowedDate = addDays(today, constraints.maxAdvanceDays);

    if (isAfter(reservationDate, lastAllowedDate)) {
      return { valid: false, code: 'MAX_ADVANCE_EXCEEDED' };
    }
  }

  if (constraints.blockedDates?.includes(value)) {
    return { valid: false, code: 'BLOCKED_DATE' };
  }

  return { valid: true };
}
