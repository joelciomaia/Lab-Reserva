import type { ReservationResource } from './resource';

export type ReservationStatus = 'ACTIVE' | 'CANCELLED' | 'COMPLETED';
export type CalendarSyncStatus = 'SYNCED' | 'PENDING' | 'DISABLED';

export interface Reservation {
  id: string;
  recurrenceGroupId?: string;
  status: ReservationStatus;
  date: string;
  laboratoryId: string;
  laboratoryName: string;
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  classGroup: string;
  subject: string;
  purpose: string;
  studentCount: number;
  periodIds: string[];
  periodLabels: string[];
  resources: ReservationResource[];
  notes: string;
  createdAt: string;
  calendarStatus: CalendarSyncStatus;
}

export interface CreateReservationRequest {
  teacherId: string;
  teacherEmail: string;
  laboratoryId: string;
  date: string;
  classGroup: string;
  subject: string;
  purpose: string;
  studentCount: number;
  periodIds: string[];
  resources: { resourceId: string; quantity: number }[];
  notes: string;
}
