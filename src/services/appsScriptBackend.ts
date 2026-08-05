import type {
  AppErrorCode,
  AvailabilityRequest,
  AvailabilityResponse,
  BackendClient,
  BootstrapData,
  BootstrapParams,
  CreateReservationRequest,
  PeriodAvailability,
  PeriodReservationSummary,
  Reservation,
} from '../types';
import { BackendError } from '../types';
import {
  callAppsScriptViaForm,
  type AppsScriptEnvelope,
} from './appsScriptFormTransport';

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

interface AgendaSnapshotResponse {
  bootstrap: BootstrapData;
  availability: AvailabilityResponse[];
}

interface AvailabilityWaiter {
  resolve: (response: AvailabilityResponse) => void;
  reject: (error: unknown) => void;
}

interface PendingAvailabilityBatch {
  schoolId: string;
  laboratoryId: string;
  dates: Set<string>;
  waitersByDate: Map<string, AvailabilityWaiter[]>;
  timerId: number;
}

const APP_ERROR_CODES = new Set<AppErrorCode>([
  'VALIDATION_ERROR',
  'LABORATORY_NOT_FOUND',
  'TIME_CONFLICT',
  'CONFIGURATION_CONFLICT',
  'BACKEND_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

function normalizeEndpoint(value: string): string {
  const endpoint = value.trim();
  if (!endpoint) {
    throw new BackendError(
      'BACKEND_UNAVAILABLE',
      'A agenda real ainda não foi conectada ao Google Sheets.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new BackendError(
      'BACKEND_UNAVAILABLE',
      'A URL da integração com o Google Sheets é inválida.',
    );
  }

  const isGoogleAppsScript =
    parsed.protocol === 'https:' &&
    parsed.hostname === 'script.google.com' &&
    /^\/macros\/s\/[^/]+\/exec\/?$/.test(parsed.pathname);
  const isLocalDevelopment =
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname);

  if (!isGoogleAppsScript && !isLocalDevelopment) {
    throw new BackendError(
      'BACKEND_UNAVAILABLE',
      'Use uma URL publicada do Google Apps Script para conectar a agenda.',
    );
  }

  return parsed.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requirePublicSchoolId(value: string | undefined): string {
  const schoolId = value?.trim();
  if (!schoolId || schoolId.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(schoolId)) {
    throw new BackendError(
      'VALIDATION_ERROR',
      'Este link da agenda está incompleto. Solicite ao laboratório um novo link ou QR Code.',
    );
  }
  return schoolId;
}

function normalizeApiError(failure: ApiFailure): BackendError {
  const candidateCode = failure.error?.code;
  let code: AppErrorCode = 'INTERNAL_ERROR';
  if (typeof candidateCode === 'string') {
    if (APP_ERROR_CODES.has(candidateCode as AppErrorCode)) {
      code = candidateCode as AppErrorCode;
    } else if (['BAD_REQUEST', 'PAYLOAD_TOO_LARGE', 'UNKNOWN_ACTION'].includes(candidateCode)) {
      code = 'VALIDATION_ERROR';
    } else if (
      [
        'CONFIGURATION_ERROR',
        'DATA_INTEGRITY_ERROR',
        'SPREADSHEET_UNAVAILABLE',
        'LOCK_TIMEOUT',
      ].includes(candidateCode)
    ) {
      code = 'BACKEND_UNAVAILABLE';
    }
  }
  const message =
    typeof failure.error?.message === 'string' && failure.error.message.trim()
      ? failure.error.message
      : 'Não foi possível concluir a operação na agenda.';

  return new BackendError(code, message, failure.error?.details);
}

function normalizeReservationSummary(
  reservation: PeriodReservationSummary,
): PeriodReservationSummary {
  return {
    id: reservation.id,
    ...(reservation.teacherName ? { teacherName: reservation.teacherName } : {}),
    ...(reservation.subject ? { subject: reservation.subject } : {}),
    ...(reservation.classGroup ? { classGroup: reservation.classGroup } : {}),
  };
}

function normalizePeriodAvailability(period: PeriodAvailability): PeriodAvailability {
  const reservations = period.reservations?.length
    ? period.reservations.map(normalizeReservationSummary)
    : period.reservation
      ? [normalizeReservationSummary(period.reservation)]
      : [];
  const firstReservation = reservations[0];

  return {
    ...period,
    ...(firstReservation ? { reservation: firstReservation } : {}),
    reservations,
    reservationCount: period.reservationCount ?? reservations.length,
  };
}

function normalizeAvailabilityResponse(response: AvailabilityResponse): AvailabilityResponse {
  return {
    ...response,
    periods: response.periods.map(normalizePeriodAvailability),
  };
}

export interface AppsScriptBackendOptions {
  fetchImplementation?: typeof window.fetch;
}

export class AppsScriptBackend implements BackendClient {
  private readonly endpoint: string;
  private readonly fetchImplementation: typeof window.fetch | undefined;
  private readonly pendingAvailabilityBatches = new Map<string, PendingAvailabilityBatch>();
  private readonly initialAvailability = new Map<string, AvailabilityResponse>();

  constructor(endpoint: string, options: AppsScriptBackendOptions = {}) {
    this.endpoint = normalizeEndpoint(endpoint);
    this.fetchImplementation = options.fetchImplementation;
  }

  private readPayload<T>(payload: unknown, responseOk = true): T {
    if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'A integração com o Google Sheets retornou uma resposta inválida.',
      );
    }

    const envelope = payload as unknown as ApiEnvelope<T>;
    if (!responseOk || !envelope.ok) {
      throw normalizeApiError(envelope.ok ? { ok: false } : envelope);
    }

    return envelope.data;
  }

  private async readEnvelope<T>(response: Response): Promise<T> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'A integração com o Google Sheets retornou uma resposta inválida.',
      );
    }

    return this.readPayload<T>(payload, response.ok);
  }

  private async callThroughForm<T>(payload: Record<string, unknown>): Promise<T> {
    const envelope: AppsScriptEnvelope<T> = await callAppsScriptViaForm<T>(this.endpoint, payload);
    return this.readPayload<T>(envelope);
  }

  private async get<T>(parameters: Record<string, string | undefined>): Promise<T> {
    try {
      if (!this.fetchImplementation) {
        return await this.callThroughForm<T>(parameters);
      }

      const url = new URL(this.endpoint);
      Object.entries(parameters).forEach(([key, value]) => {
        if (value) {
          url.searchParams.set(key, value);
        }
      });
      url.searchParams.set('_', String(Date.now()));

      const response = await this.fetchImplementation(url, {
        method: 'GET',
        cache: 'no-store',
        redirect: 'follow',
      });
      return await this.readEnvelope<T>(response);
    } catch (error: unknown) {
      if (error instanceof BackendError) {
        throw error;
      }
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Não foi possível acessar a agenda no Google Sheets.',
      );
    }
  }

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    try {
      if (!this.fetchImplementation) {
        return await this.callThroughForm<T>(body);
      }

      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        // text/plain evita preflight CORS no Web App do Apps Script durante os testes e proxies.
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
      });
      return await this.readEnvelope<T>(response);
    } catch (error: unknown) {
      if (error instanceof BackendError) {
        throw error;
      }
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Não foi possível salvar o agendamento no Google Sheets.',
      );
    }
  }

  private availabilityKey(schoolId: string, laboratoryId: string, date: string): string {
    return `${schoolId}\u0000${laboratoryId}\u0000${date}`;
  }

  private availabilityBatchKey(schoolId: string, laboratoryId: string): string {
    return `${schoolId}\u0000${laboratoryId}`;
  }

  private async fetchAvailabilityBatch(
    schoolId: string,
    laboratoryId: string,
    dates: string[],
  ): Promise<AvailabilityResponse[]> {
    if (dates.length === 1) {
      const response = await this.get<AvailabilityResponse>({
        action: 'availability',
        school: schoolId,
        laboratoryId,
        date: dates[0],
      });
      return [normalizeAvailabilityResponse(response)];
    }

    const responses = await this.get<AvailabilityResponse[]>({
      action: 'weekAvailability',
      school: schoolId,
      laboratoryId,
      dates: dates.join(','),
    });
    return responses.map(normalizeAvailabilityResponse);
  }

  private async flushAvailabilityBatch(batchKey: string): Promise<void> {
    const batch = this.pendingAvailabilityBatches.get(batchKey);
    if (!batch) {
      return;
    }
    this.pendingAvailabilityBatches.delete(batchKey);

    const dates = [...batch.dates].sort();
    try {
      const responses = await this.fetchAvailabilityBatch(
        batch.schoolId,
        batch.laboratoryId,
        dates,
      );
      const responseByDate = new Map(responses.map((response) => [response.date, response]));

      dates.forEach((date) => {
        const response = responseByDate.get(date);
        const waiters = batch.waitersByDate.get(date) ?? [];
        if (!response) {
          const error = new BackendError(
            'BACKEND_UNAVAILABLE',
            'A agenda não retornou todos os dias solicitados.',
          );
          waiters.forEach(({ reject }) => reject(error));
          return;
        }
        waiters.forEach(({ resolve }) => resolve(response));
      });
    } catch (error: unknown) {
      batch.waitersByDate.forEach((waiters) => {
        waiters.forEach(({ reject }) => reject(error));
      });
    }
  }

  async getBootstrapData(params: BootstrapParams = {}): Promise<BootstrapData> {
    const schoolId = requirePublicSchoolId(params.schoolId);
    const initial = params.initialAvailability;

    if (!initial || initial.dates.length === 0) {
      return this.get<BootstrapData>({
        action: 'bootstrap',
        school: schoolId,
        lab: params.preselectedLaboratoryId,
      });
    }

    const snapshot = await this.get<AgendaSnapshotResponse>({
      action: 'agendaSnapshot',
      school: schoolId,
      laboratoryId: initial.laboratoryId,
      dates: initial.dates.join(','),
    });
    snapshot.availability.map(normalizeAvailabilityResponse).forEach((response) => {
      this.initialAvailability.set(
        this.availabilityKey(schoolId, response.laboratoryId, response.date),
        response,
      );
    });
    return snapshot.bootstrap;
  }

  getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse> {
    const schoolId = requirePublicSchoolId(request.schoolId);
    const initialKey = this.availabilityKey(schoolId, request.laboratoryId, request.date);
    const initialResponse = this.initialAvailability.get(initialKey);
    if (initialResponse) {
      this.initialAvailability.delete(initialKey);
      return Promise.resolve(initialResponse);
    }

    return new Promise<AvailabilityResponse>((resolve, reject) => {
      const batchKey = this.availabilityBatchKey(schoolId, request.laboratoryId);
      const existingBatch = this.pendingAvailabilityBatches.get(batchKey);
      const batch =
        existingBatch ??
        {
          schoolId,
          laboratoryId: request.laboratoryId,
          dates: new Set<string>(),
          waitersByDate: new Map<string, AvailabilityWaiter[]>(),
          timerId: window.setTimeout(() => {
            void this.flushAvailabilityBatch(batchKey);
          }, 0),
        };

      batch.dates.add(request.date);
      const waiters = batch.waitersByDate.get(request.date) ?? [];
      waiters.push({ resolve, reject });
      batch.waitersByDate.set(request.date, waiters);

      if (!existingBatch) {
        this.pendingAvailabilityBatches.set(batchKey, batch);
      }
    });
  }

  async createReservation(request: CreateReservationRequest): Promise<Reservation> {
    const { schoolId, ...reservationRequest } = request;
    const normalizedSchoolId = requirePublicSchoolId(schoolId);
    return this.post<Reservation>({
      action: 'createReservation',
      school: normalizedSchoolId,
      request: reservationRequest,
    });
  }
}

export class UnconfiguredBackend implements BackendClient {
  private unavailable(): BackendError {
    return new BackendError(
      'BACKEND_UNAVAILABLE',
      'A agenda ainda não está disponível neste endereço. Avise o responsável pela implantação.',
    );
  }

  getBootstrapData(): Promise<BootstrapData> {
    return Promise.reject(this.unavailable());
  }

  getAvailability(): Promise<AvailabilityResponse> {
    return Promise.reject(this.unavailable());
  }

  createReservation(): Promise<Reservation> {
    return Promise.reject(this.unavailable());
  }
}
