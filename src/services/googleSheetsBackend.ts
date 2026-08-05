import type {
  AvailabilityRequest,
  AvailabilityResponse,
  BackendClient,
  BootstrapData,
  BootstrapParams,
  CreateReservationRequest,
  Reservation,
} from '../types';
import { BackendError } from '../types';
import {
  createClassPeriods,
  createDefaultLaboratoryAdminConfiguration,
  DEFAULT_BOOKING_FORM_CONFIGURATION,
  DEFAULT_CLASS_GROUPS,
  DEFAULT_RESOURCES,
  DEFAULT_SED_SC_CONFIGURATION,
  DEFAULT_SHIFTS,
  DEFAULT_SUBJECTS,
} from '../domain/configuration';
import { sortClassPeriods } from '../domain/periods';
import { isValidIsoDate } from '../utils/dates';
import { readAdminConfigurationWithMetadataFromGoogleSheets } from '../integrations/google/googleSheets';
import { listGoogleReservations } from '../integrations/google/googleReservations';
import type {
  AdminConfiguration,
  ClassPeriod,
  Laboratory,
  School,
  ShiftConfiguration,
} from '../types';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createDefaultSchool(name: string): School {
  return { id: `SCHOOL-${Date.now().toString(36)}`, name };
}

function createDefaultPeriods(shifts: ShiftConfiguration[]): ClassPeriod[] {
  return createClassPeriods(shifts).map((period, index) => ({ ...period, id: `P${String(index + 1).padStart(2, '0')}` }));
}

function createDefaultLaboratories(): Laboratory[] {
  return [
    { id: 'LAB01', name: 'Laboratório principal', active: true },
  ];
}

function createDefaultConfiguration(schoolName: string): AdminConfiguration {
  const school = createDefaultSchool(schoolName);
  const laboratories = createDefaultLaboratories();
  const shifts = [...structuredClone(DEFAULT_SHIFTS)] as ShiftConfiguration[];
  const classGroups = [...structuredClone(DEFAULT_CLASS_GROUPS)] as Array<import('../types').ConfiguredClassGroup>;
  const subjects = [...structuredClone(DEFAULT_SUBJECTS)] as Array<import('../types').ConfiguredSubject>;
  const resources = [...structuredClone(DEFAULT_RESOURCES)] as Array<import('../types').ConfiguredResource>;
  return {
    revision: 'configuration-1',
    school,
    laboratories,
    shifts,
    classGroups,
    subjects,
    resources,
    bookingForm: structuredClone(DEFAULT_BOOKING_FORM_CONFIGURATION),
    laboratorySettings: laboratories.map((laboratory) => createDefaultLaboratoryAdminConfiguration(laboratory.id)),
    sedSc: structuredClone(DEFAULT_SED_SC_CONFIGURATION),
  };
}

export class GoogleSheetsBackend implements BackendClient {
  private readonly accessToken: string;
  private readonly spreadsheetId: string;

  constructor(accessToken: string, spreadsheetId: string) {
    this.accessToken = accessToken.trim();
    this.spreadsheetId = spreadsheetId.trim();
  }

  async getBootstrapData(params: BootstrapParams = {}): Promise<BootstrapData> {
    if (!this.accessToken || !this.spreadsheetId) {
      throw new BackendError('BACKEND_UNAVAILABLE', 'A agenda ainda não está disponível neste endereço.');
    }

    const configuration = await readAdminConfigurationWithMetadataFromGoogleSheets(
      this.accessToken,
      this.spreadsheetId,
      window.fetch.bind(window),
    );

    const resolvedConfiguration = configuration.configuration ?? createDefaultConfiguration('Escola');
    const shifts = resolvedConfiguration.shifts;
    const periods = createDefaultPeriods(shifts);
    const requestedLaboratory = resolvedConfiguration.laboratories.some(
      (laboratory) => laboratory.id === params.preselectedLaboratoryId && laboratory.active,
    )
      ? params.preselectedLaboratoryId
      : undefined;

    const result: BootstrapData = {
      school: clone(resolvedConfiguration.school),
      laboratories: clone(resolvedConfiguration.laboratories.filter((laboratory) => laboratory.active)),
      periods: clone(sortClassPeriods(periods.filter((period) => period.active))),
      classGroups: clone(
        resolvedConfiguration.classGroups
          .filter((classGroup) => classGroup.active)
          .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      ),
      subjects: clone(
        resolvedConfiguration.subjects
          .filter((subject) => subject.active)
          .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      ),
      resources: clone(
        resolvedConfiguration.resources
          .filter((resource) => resource.active)
          .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      ),
      bookingForm: clone(resolvedConfiguration.bookingForm),
      configurationRevision: resolvedConfiguration.revision,
      sourceSpreadsheetFingerprint: 'google-sheets',
    };

    if (requestedLaboratory) {
      result.preselectedLaboratoryId = requestedLaboratory;
    }

    return result;
  }

  async getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse> {
    if (!isValidIsoDate(request.date)) {
      throw new BackendError('VALIDATION_ERROR', 'A data informada é inválida.');
    }

    const reservations = await listGoogleReservations({
      accessToken: this.accessToken,
      spreadsheetId: this.spreadsheetId,
    });

    reservations.filter(
      (reservation) => reservation.date === request.date && reservation.laboratoryId === request.laboratoryId,
    );

    return {
      laboratoryId: request.laboratoryId,
      date: request.date,
      periods: [],
    };
  }

  async createReservation(request: CreateReservationRequest): Promise<Reservation> {
    const reservation = await this.createReservationInGoogleSheets(request);
    return reservation;
  }

  private async createReservationInGoogleSheets(request: CreateReservationRequest): Promise<Reservation> {
    const reservationId = `RES-${Date.now().toString(36)}`;
    const createdAt = new Date().toISOString();
    const configuration = await readAdminConfigurationWithMetadataFromGoogleSheets(
      this.accessToken,
      this.spreadsheetId,
      window.fetch.bind(window),
    );
    const resolvedConfiguration = configuration.configuration ?? createDefaultConfiguration('Escola');
    const laboratory = resolvedConfiguration.laboratories.find((candidate) => candidate.id === request.laboratoryId);
    if (!laboratory) {
      throw new BackendError('LABORATORY_NOT_FOUND', 'O laboratório informado não foi encontrado.');
    }

    const reservation: Reservation = {
      id: reservationId,
      date: request.date,
      laboratoryId: request.laboratoryId,
      laboratoryName: laboratory.name,
      teacherName: request.teacherName,
      classGroup: request.classGroup,
      subject: request.subject,
      periodIds: request.periodIds,
      periodLabels: request.periodIds,
      knowledgeObjects: request.knowledgeObjects,
      itemsUsed: request.itemsUsed,
      notes: request.notes,
      createdAt,
    };

    const rows = [
      reservation.id,
      reservation.date,
      reservation.laboratoryId,
      reservation.laboratoryName,
      reservation.teacherName,
      reservation.classGroup,
      reservation.subject,
      reservation.periodIds.join(','),
      reservation.periodLabels.join(','),
      reservation.knowledgeObjects,
      reservation.itemsUsed,
      reservation.notes,
      reservation.createdAt,
      reservation.periodIds.join(','),
    ];

    const body = {
      majorDimension: 'ROWS',
      values: [rows],
    };

    const response = await window.fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent('RESERVAS!A:Z')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new BackendError('BACKEND_UNAVAILABLE', 'Não foi possível salvar o agendamento.');
    }

    return reservation;
  }
}
