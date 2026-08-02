export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ClassPeriod {
  id: string;
  shiftId: string;
  shiftName: string;
  shiftOrder: number;
  classNumber: number;
  name: string;
  startTime: string;
  endTime: string;
  order: number;
  active: boolean;
  /**
   * Dias ISO em que a aula existe (1 = segunda, 7 = domingo).
   * Quando omitido, o período é aplicável a todos os dias.
   */
  activeWeekdays?: readonly IsoWeekday[];
}

export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

export interface PeriodReservationSummary {
  id: string;
}

export interface PeriodAvailability {
  periodId: string;
  shiftId: string;
  shiftName: string;
  shiftOrder: number;
  classNumber: number;
  label: string;
  startTime: string;
  endTime: string;
  status: AvailabilityStatus;
  reservation?: PeriodReservationSummary;
}

export interface AvailabilityRequest {
  /** Opcional apenas para compatibilidade com o backend legado de uma escola. */
  schoolId?: string;
  laboratoryId: string;
  date: string;
}

export interface AvailabilityResponse {
  date: string;
  laboratoryId: string;
  periods: PeriodAvailability[];
}
