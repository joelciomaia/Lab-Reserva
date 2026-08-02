import type {
  AppErrorCode,
  AvailabilityRequest,
  AvailabilityResponse,
  BackendClient,
  BootstrapData,
  BootstrapParams,
  CreateReservationRequest,
  Reservation,
} from '../types';
import { BackendError } from '../types';

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

export interface AppsScriptBackendOptions {
  fetchImplementation?: typeof window.fetch;
}

export class AppsScriptBackend implements BackendClient {
  private readonly endpoint: string;
  private readonly fetchImplementation: typeof window.fetch;

  constructor(endpoint: string, options: AppsScriptBackendOptions = {}) {
    this.endpoint = normalizeEndpoint(endpoint);
    this.fetchImplementation = options.fetchImplementation ?? window.fetch.bind(window);
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

    if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'A integração com o Google Sheets retornou uma resposta inválida.',
      );
    }

    const envelope = payload as unknown as ApiEnvelope<T>;
    if (!response.ok || !envelope.ok) {
      throw normalizeApiError(envelope.ok ? { ok: false } : envelope);
    }

    return envelope.data;
  }

  private async get<T>(parameters: Record<string, string | undefined>): Promise<T> {
    const url = new URL(this.endpoint);
    Object.entries(parameters).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value);
      }
    });
    url.searchParams.set('_', String(Date.now()));

    try {
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
        'Não foi possível acessar a agenda no Google Sheets.',
      );
    }
  }

  private async post<T>(body: unknown): Promise<T> {
    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        // text/plain evita preflight CORS no Web App do Apps Script.
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
        'Não foi possível salvar o agendamento no Google Sheets.',
      );
    }
  }

  getBootstrapData(params: BootstrapParams = {}): Promise<BootstrapData> {
    return this.get<BootstrapData>({
      action: 'bootstrap',
      lab: params.preselectedLaboratoryId,
    });
  }

  async getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse> {
    const response = await this.get<AvailabilityResponse>({
      action: 'availability',
      laboratoryId: request.laboratoryId,
      date: request.date,
    });

    return {
      ...response,
      periods: response.periods.map(({ reservation, ...period }) => ({
        ...period,
        ...(reservation ? { reservation: { id: reservation.id } } : {}),
      })),
    };
  }

  createReservation(request: CreateReservationRequest): Promise<Reservation> {
    return this.post<Reservation>({ action: 'createReservation', request });
  }
}

export class UnconfiguredBackend implements BackendClient {
  private unavailable(): BackendError {
    return new BackendError(
      'BACKEND_UNAVAILABLE',
      'A agenda real ainda não foi conectada ao Google Sheets. Entre como laboratorista para concluir a configuração.',
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
