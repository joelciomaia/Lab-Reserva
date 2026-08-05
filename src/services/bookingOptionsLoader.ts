import type {
  BookingFormConfiguration,
  ConfiguredClassGroup,
  ConfiguredResource,
  ConfiguredSubject,
} from '../types';
import { BackendError } from '../types';
import {
  callAppsScriptViaForm,
  type AppsScriptEnvelope,
} from './appsScriptFormTransport';

export interface BookingOptionsData {
  classGroups: ConfiguredClassGroup[];
  subjects: ConfiguredSubject[];
  resources: ConfiguredResource[];
  bookingForm: BookingFormConfiguration;
}

const pendingRequests = new Map<string, Promise<BookingOptionsData>>();

function endpoint(): string {
  const value = import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL?.trim();
  if (!value) {
    throw new BackendError(
      'BACKEND_UNAVAILABLE',
      'A agenda real ainda não foi conectada ao Google Sheets.',
    );
  }
  return value;
}

function schoolId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(normalized)) {
    throw new BackendError('VALIDATION_ERROR', 'O identificador público da escola é inválido.');
  }
  return normalized;
}

function readEnvelope(envelope: AppsScriptEnvelope<BookingOptionsData>): BookingOptionsData {
  if (!envelope.ok) {
    throw new BackendError(
      'BACKEND_UNAVAILABLE',
      typeof envelope.error?.message === 'string' && envelope.error.message.trim()
        ? envelope.error.message
        : 'Não foi possível carregar as opções do formulário.',
      envelope.error?.details,
    );
  }

  const data = envelope.data;
  if (
    !Array.isArray(data.subjects) ||
    !Array.isArray(data.classGroups) ||
    !Array.isArray(data.resources) ||
    !data.bookingForm ||
    typeof data.bookingForm.showObservations !== 'boolean'
  ) {
    throw new BackendError(
      'BACKEND_UNAVAILABLE',
      'As opções do formulário retornaram em um formato inválido.',
    );
  }

  return data;
}

/**
 * Busca somente disciplinas, turmas, recursos e regras do formulário.
 * Requisições simultâneas da mesma escola compartilham a mesma Promise, mas o
 * resultado não permanece em cache depois que a leitura termina.
 */
export function loadBookingOptions(publicSchoolId: string): Promise<BookingOptionsData> {
  const normalizedSchoolId = schoolId(publicSchoolId);
  const existing = pendingRequests.get(normalizedSchoolId);
  if (existing) {
    return existing;
  }

  const request = callAppsScriptViaForm<BookingOptionsData>(endpoint(), {
    action: 'bookingOptions',
    school: normalizedSchoolId,
  })
    .then(readEnvelope)
    .finally(() => {
      pendingRequests.delete(normalizedSchoolId);
    });

  pendingRequests.set(normalizedSchoolId, request);
  return request;
}
