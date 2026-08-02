import { ensureSpreadsheetWriterAccess } from '../integrations/google/googleDrive';
import { verifySpreadsheetBinding } from './spreadsheetBinding';

interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error?: {
    message?: unknown;
  };
}

type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

interface ServiceInfo {
  backendAccountEmail: string;
}

interface RegistrationResult {
  schoolId: string;
  sourceSpreadsheetFingerprint: string;
}

export interface ProvisionSchoolWorkspaceRequest {
  accessToken: string;
  spreadsheetId: string;
  schoolId: string;
  revision: string;
}

export interface ProvisionSchoolWorkspaceOptions {
  appsScriptUrl?: string;
  expectedBackendAccountEmail?: string;
  fetchImplementation?: typeof window.fetch;
}

export interface ProvisionedSchoolWorkspace {
  schoolId: string;
  spreadsheetId: string;
}

export class SchoolProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchoolProvisioningError';
  }
}

function configuredEndpoint(providedEndpoint?: string): string {
  const endpoint = (providedEndpoint ?? import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL)?.trim();
  if (!endpoint) {
    throw new SchoolProvisioningError(
      'O acesso público da agenda ainda não foi configurado nesta implantação.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new SchoolProvisioningError('O endereço do serviço público da agenda é inválido.');
  }

  const isGoogleAppsScript =
    parsed.protocol === 'https:' &&
    parsed.hostname === 'script.google.com' &&
    /^\/macros\/s\/[^/]+\/exec\/?$/.test(parsed.pathname);
  const isLocalDevelopment =
    ['http:', 'https:'].includes(parsed.protocol) &&
    ['localhost', '127.0.0.1'].includes(parsed.hostname);

  if (!isGoogleAppsScript && !isLocalDevelopment) {
    throw new SchoolProvisioningError('O serviço público configurado para a agenda é inválido.');
  }

  return parsed.toString();
}

function resolveFetch(fetchImplementation?: typeof window.fetch): typeof window.fetch {
  if (fetchImplementation) {
    return fetchImplementation;
  }
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch.bind(window);
  }
  if (typeof fetch === 'function') {
    return fetch;
  }
  throw new SchoolProvisioningError('A conexão com o serviço público não está disponível.');
}

function configuredBackendAccountEmail(providedEmail?: string): string {
  const email = (providedEmail ?? import.meta.env.VITE_GOOGLE_APPS_SCRIPT_ACCOUNT_EMAIL)
    ?.trim()
    .toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SchoolProvisioningError(
      'A conta central do serviço público ainda não foi configurada nesta implantação.',
    );
  }
  return email;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('ok' in payload)) {
    throw new SchoolProvisioningError('O serviço público retornou uma resposta inválida.');
  }

  const envelope = payload as ApiEnvelope<T>;
  if (!response.ok || !envelope.ok) {
    const providedMessage = envelope.ok ? undefined : envelope.error?.message;
    throw new SchoolProvisioningError(
      typeof providedMessage === 'string' && providedMessage.trim()
        ? providedMessage
        : 'Não foi possível preparar o acesso público desta escola.',
    );
  }

  return envelope.data;
}

async function getServiceInfo(
  endpoint: string,
  fetchImplementation: typeof window.fetch,
): Promise<ServiceInfo> {
  const url = new URL(endpoint);
  url.searchParams.set('action', 'serviceInfo');
  url.searchParams.set('_', String(Date.now()));

  const response = await fetchImplementation(url, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'follow',
  });
  const result = await readEnvelope<ServiceInfo>(response);
  const backendAccountEmail = result.backendAccountEmail?.trim().toLocaleLowerCase();
  if (!backendAccountEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backendAccountEmail)) {
    throw new SchoolProvisioningError(
      'O serviço público não informou uma conta válida para vincular a planilha.',
    );
  }
  return { backendAccountEmail };
}

async function registerSchool(
  endpoint: string,
  request: Omit<ProvisionSchoolWorkspaceRequest, 'accessToken'>,
  fetchImplementation: typeof window.fetch,
): Promise<RegistrationResult> {
  const response = await fetchImplementation(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ action: 'registerSchool', request }),
    redirect: 'follow',
  });
  return readEnvelope<RegistrationResult>(response);
}

export async function provisionSchoolWorkspace(
  request: ProvisionSchoolWorkspaceRequest,
  options: ProvisionSchoolWorkspaceOptions = {},
): Promise<ProvisionedSchoolWorkspace> {
  const spreadsheetId = request.spreadsheetId.trim();
  const schoolId = request.schoolId.trim();
  const revision = request.revision.trim();
  if (!request.accessToken.trim() || !spreadsheetId || !schoolId || !revision) {
    throw new SchoolProvisioningError(
      'A escola ainda não possui todos os dados necessários para liberar o acesso público.',
    );
  }

  const endpoint = configuredEndpoint(options.appsScriptUrl);
  const expectedBackendAccountEmail = configuredBackendAccountEmail(
    options.expectedBackendAccountEmail,
  );
  const fetchImplementation = resolveFetch(options.fetchImplementation);
  const { backendAccountEmail } = await getServiceInfo(endpoint, fetchImplementation);
  if (backendAccountEmail !== expectedBackendAccountEmail) {
    throw new SchoolProvisioningError(
      'O serviço público não corresponde à conta central configurada para esta implantação.',
    );
  }

  await ensureSpreadsheetWriterAccess(spreadsheetId, backendAccountEmail, {
    accessToken: request.accessToken,
    fetchImplementation,
  });

  const registration = await registerSchool(
    endpoint,
    { spreadsheetId, schoolId, revision },
    fetchImplementation,
  );
  const bindingMatches = await verifySpreadsheetBinding(
    spreadsheetId,
    registration.sourceSpreadsheetFingerprint,
  );
  if (registration.schoolId !== schoolId || !bindingMatches) {
    throw new SchoolProvisioningError(
      'O serviço público não confirmou o vínculo com a planilha desta escola.',
    );
  }

  return { schoolId, spreadsheetId };
}
