import type { Laboratory } from './laboratory';
import type { IsoWeekday } from './schedule';
import type { School } from './school';

export type GradeId = 'high-school-1' | 'high-school-2' | 'high-school-3' | 'eja' | 'other';

export interface ConfiguredSubject {
  id: string;
  label: string;
  order: number;
  active: boolean;
}

export interface ConfiguredClassGroup {
  id: string;
  label: string;
  gradeId: GradeId;
  studentCount: number;
  order: number;
  active: boolean;
}

export interface ConfiguredResource {
  id: string;
  label: string;
  order: number;
  active: boolean;
}

export interface BookingFormConfiguration {
  showObservations: boolean;
}

export type LeadTimeUnit = 'MINUTES' | 'HOURS' | 'DAYS';
export type RetroactiveConflictPolicy = 'WARN' | 'BLOCK';

export interface LaboratoryAdminConfiguration {
  laboratoryId: string;
  responsibleName: string;
  responsibleEmail: string;
  maxConcurrentClasses: number | null;
  maxStudentCapacity: number | null;
  minimumLeadTimeValue: number;
  minimumLeadTimeUnit: LeadTimeUnit;
  allowPastBookings: boolean;
  pastBookingLimitDays: number | null;
  retroactiveConflictPolicy: RetroactiveConflictPolicy;
  notifyOnNewBooking: boolean;
  sedIntegrationEnabled: boolean;
  sedLinkLeadMinutes: number;
  googleChatEnabled: boolean;
  googleChatSpaceName: string;
  sendSedLinkToChat: boolean;
}

export interface SedScConfiguration {
  enabled: boolean;
  formUrl: string;
  regionalName: string;
  municipalityName: string;
  officialSchoolName: string;
  defaultArea: string;
  defaultActivityType: string;
}

export interface ShiftConfiguration {
  id: string;
  name: string;
  order: number;
  startTime: string;
  classDurationMinutes: number;
  classCount: number;
  breakAfterClass: number | null;
  breakDurationMinutes: number;
  activeWeekdays: IsoWeekday[];
  active: boolean;
}

export interface AdminConfiguration {
  revision: string;
  school: School;
  laboratories: Laboratory[];
  shifts: ShiftConfiguration[];
  classGroups: ConfiguredClassGroup[];
  subjects: ConfiguredSubject[];
  resources: ConfiguredResource[];
  bookingForm: BookingFormConfiguration;
  laboratorySettings: LaboratoryAdminConfiguration[];
  sedSc: SedScConfiguration;
}

export type AdminConfigurationDraft = Omit<AdminConfiguration, 'revision'>;

export interface SaveAdminConfigurationRequest {
  expectedRevision: string;
  configuration: AdminConfigurationDraft;
}
