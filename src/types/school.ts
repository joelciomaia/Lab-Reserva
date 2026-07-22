export interface School {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  institutionalEmail: string;
  academicYear: number;
  timeZone: string;
}

export interface SchoolNotice {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'warning';
}

export interface ReservationRules {
  preventConflicts: boolean;
  allowSharing: boolean;
  validateCapacity: boolean;
  allowRecurrence: boolean;
  minimumAdvanceHours: number;
  maximumAdvanceDays: number;
  allowCancellation: boolean;
  cancellationDeadlineHours: number;
  requireIdentification: boolean;
}
