import type { Laboratory } from './laboratory';
import type { CreateReservationRequest, Reservation } from './reservation';
import type { Resource } from './resource';
import type { AvailabilityRequest, AvailabilityResponse, ClassPeriod, Shift } from './schedule';
import type { ReservationRules, School, SchoolNotice } from './school';
import type { CurrentUser, Teacher } from './user';

export interface BootstrapParams {
  preselectedLaboratoryId?: string;
}

export interface BootstrapData {
  setupCompleted: boolean;
  school: School;
  laboratories: Laboratory[];
  resources: Resource[];
  shifts: Shift[];
  periods: ClassPeriod[];
  reservationRules: ReservationRules;
  notices: SchoolNotice[];
  currentUser?: CurrentUser;
  preselectedLaboratoryId?: string;
}

export interface AdminData {
  school: School;
  laboratories: Laboratory[];
  resources: Resource[];
  teachers: Teacher[];
  activeReservations: number;
  pendingCalendarSynchronizations: number;
}

export interface InitialSetupData {
  school: School;
  laboratories: Laboratory[];
  resources: Resource[];
  teachers: Teacher[];
  shifts: Shift[];
  periods: ClassPeriod[];
  reservationRules: ReservationRules;
}

export interface BackendClient {
  getBootstrapData(params?: BootstrapParams): Promise<BootstrapData>;
  getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse>;
  createReservation(request: CreateReservationRequest): Promise<Reservation>;
  cancelReservation(reservationId: string): Promise<void>;
  getReservation(reservationId: string): Promise<Reservation>;
  getMyReservations(userId?: string): Promise<Reservation[]>;
  getAdminData(): Promise<AdminData>;
  saveInitialSetup(data: InitialSetupData): Promise<void>;
}

export type { AvailabilityRequest, AvailabilityResponse, CreateReservationRequest, Reservation };
