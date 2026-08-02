export interface Reservation {
  id: string;
  date: string;
  laboratoryId: string;
  laboratoryName: string;
  teacherName: string;
  classGroup: string;
  subject: string;
  periodIds: string[];
  periodLabels: string[];
  periodTimes?: string[];
  knowledgeObjects: string;
  itemsUsed: string;
  notes: string;
  createdAt: string;
}

export type ReservationStatus = 'CONFIRMED' | 'PARTIALLY_CANCELLED' | 'CANCELLED';

export interface ReservationCancellation {
  id: string;
  reservationId: string;
  periodId: string;
  periodLabel: string;
  cancelledAt: string;
  cancelledBy: string;
  reason: string;
}

export interface ManagedReservation extends Reservation {
  status: ReservationStatus;
  activePeriodIds: string[];
  cancelledPeriodIds: string[];
  periodTimes: string[];
  cancellations: ReservationCancellation[];
}

export interface CancelReservationPeriodsRequest {
  reservationId: string;
  periodIds: string[];
  cancelledBy: string;
  reason: string;
}

export interface CreateReservationRequest {
  /** Opcional apenas para compatibilidade com o backend legado de uma escola. */
  schoolId?: string;
  laboratoryId: string;
  teacherName: string;
  subject: string;
  classGroup: string;
  date: string;
  periodIds: string[];
  knowledgeObjects: string;
  itemsUsed: string;
  notes: string;
}
