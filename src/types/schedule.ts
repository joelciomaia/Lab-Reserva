export interface Shift {
  id: string;
  name: string;
  order: number;
  active: boolean;
}

export interface ClassPeriod {
  id: string;
  shiftId: string;
  classNumber: number;
  name: string;
  startTime: string;
  endTime: string;
  order: number;
  active: boolean;
}

export type AvailabilityStatus = 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';

export interface PeriodAvailability {
  periodId: string;
  label: string;
  startTime: string;
  endTime: string;
  status: AvailabilityStatus;
  occupiedCapacity: number;
  availableCapacity: number;
  activeReservations: number;
}

export interface AvailabilityRequest {
  laboratoryId: string;
  date: string;
}

export interface AvailabilityResponse {
  date: string;
  laboratoryId: string;
  periods: PeriodAvailability[];
}
