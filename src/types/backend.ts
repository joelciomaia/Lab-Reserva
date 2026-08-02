import type { Laboratory } from './laboratory';
import type { CreateReservationRequest, Reservation } from './reservation';
import type { AvailabilityRequest, AvailabilityResponse, ClassPeriod } from './schedule';
import type { School } from './school';
import type {
  AdminConfiguration,
  BookingFormConfiguration,
  ConfiguredClassGroup,
  ConfiguredResource,
  ConfiguredSubject,
  SaveAdminConfigurationRequest,
} from './configuration';

export interface BootstrapParams {
  preselectedLaboratoryId?: string;
}

export interface BootstrapData {
  school: School;
  laboratories: Laboratory[];
  periods: ClassPeriod[];
  classGroups: ConfiguredClassGroup[];
  subjects: ConfiguredSubject[];
  resources: ConfiguredResource[];
  bookingForm: BookingFormConfiguration;
  configurationRevision: string;
  /** SHA-256 público usado para provar qual planilha alimenta o Web App. */
  sourceSpreadsheetFingerprint: string;
  preselectedLaboratoryId?: string;
}

export interface BackendClient {
  getBootstrapData(params?: BootstrapParams): Promise<BootstrapData>;
  getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse>;
  createReservation(request: CreateReservationRequest): Promise<Reservation>;
}

/**
 * Projeção administrativa usada somente por implementações locais de teste.
 * Em produção, a configuração é lida e salva diretamente pelo provider do
 * Google Sheets, sem expor operações administrativas na API pública.
 */
export interface AdminConfigurationClient {
  getAdminConfiguration(): Promise<AdminConfiguration>;
  saveAdminConfiguration(request: SaveAdminConfigurationRequest): Promise<AdminConfiguration>;
}

export type { AvailabilityRequest, AvailabilityResponse, CreateReservationRequest, Reservation };
