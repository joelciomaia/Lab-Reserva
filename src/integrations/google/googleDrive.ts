const GOOGLE_DRIVE_FILES_API_URL = 'https://www.googleapis.com/drive/v3/files';
const GOOGLE_SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';

/**
 * Propriedades privadas do aplicativo usadas para reencontrar somente as
 * planilhas que o próprio Lab Reserva criou ou adotou.
 */
export const LAB_RESERVA_SPREADSHEET_APP_PROPERTIES = {
  type: 'lab-reserva-config',
  version: '1',
} as const;

interface GoogleDriveFilePayload {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
  appProperties?: Record<string, string>;
}

interface GoogleDriveFileListPayload {
  nextPageToken?: string;
  files?: GoogleDriveFilePayload[];
}

interface GoogleDrivePermissionPayload {
  id?: string;
  type?: string;
  role?: string;
  emailAddress?: string;
  deleted?: boolean;
}

interface GoogleDrivePermissionListPayload {
  nextPageToken?: string;
  permissions?: GoogleDrivePermissionPayload[];
}

export type GoogleDriveFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GoogleDriveRequestOptions {
  accessToken: string;
  fetchImplementation?: GoogleDriveFetch;
}

export interface LabReservaSpreadsheet {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
  appProperties: Record<string, string>;
}

export interface SpreadsheetWriterAccessResult {
  permissionId: string;
  writerEmail: string;
  role: 'writer' | 'owner';
  action: 'existing' | 'updated' | 'created';
}

export type GoogleDriveIntegrationErrorCode =
  | 'AUTHORIZATION_REQUIRED'
  | 'FILE_UNAVAILABLE'
  | 'DRIVE_API_ERROR'
  | 'INVALID_ARGUMENT'
  | 'INVALID_RESPONSE'
  | 'SHARING_FORBIDDEN';

export class GoogleDriveIntegrationError extends Error {
  public readonly code: GoogleDriveIntegrationErrorCode;
  public readonly status: number | null;

  constructor(
    code: GoogleDriveIntegrationErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'GoogleDriveIntegrationError';
    this.code = code;
    this.status = status;
  }
}

function requireAccessToken(accessToken: string): string {
  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    throw new GoogleDriveIntegrationError(
      'AUTHORIZATION_REQUIRED',
      'Entre com o Google para localizar as planilhas do Lab Reserva.',
    );
  }
  return normalizedToken;
}

function resolveFetch(fetchImplementation?: GoogleDriveFetch): GoogleDriveFetch {
  if (fetchImplementation) {
    return fetchImplementation;
  }
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch.bind(window);
  }
  if (typeof fetch === 'function') {
    return fetch;
  }
  throw new GoogleDriveIntegrationError(
    'DRIVE_API_ERROR',
    'O Google Drive não está disponível neste ambiente.',
  );
}

async function requestDriveApi<T>(
  url: string,
  accessToken: string,
  fetchImplementation: GoogleDriveFetch,
  init: RequestInit = {},
  forbiddenError?: {
    code: GoogleDriveIntegrationErrorCode;
    message: string;
  },
): Promise<{ found: true; payload: T } | { found: false }> {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new GoogleDriveIntegrationError(
      'DRIVE_API_ERROR',
      'Não foi possível acessar o Google Drive. Verifique sua conexão e tente novamente.',
    );
  }

  if (response.status === 404) {
    return { found: false };
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new GoogleDriveIntegrationError(
        'AUTHORIZATION_REQUIRED',
        'A autorização do Google expirou. Entre novamente para continuar.',
        response.status,
      );
    }
    if (response.status === 403) {
      throw new GoogleDriveIntegrationError(
        forbiddenError?.code ?? 'DRIVE_API_ERROR',
        forbiddenError?.message ??
          'O Google Drive recusou a operação. Entre novamente e, se o problema continuar, avise o responsável pelo aplicativo.',
        response.status,
      );
    }
    throw new GoogleDriveIntegrationError(
      'DRIVE_API_ERROR',
      'O Google Drive não conseguiu concluir a operação. Tente novamente.',
      response.status,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (payload === null || typeof payload !== 'object') {
    throw new GoogleDriveIntegrationError(
      'INVALID_RESPONSE',
      'O Google Drive retornou uma resposta inválida.',
      response.status,
    );
  }

  return { found: true, payload: payload as T };
}

function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}

function nonEmptyString(value: string | undefined, fallback: string): string {
  const normalizedValue = value?.trim();
  return normalizedValue === undefined || normalizedValue === '' ? fallback : normalizedValue;
}

function normalizeSpreadsheet(payload: GoogleDriveFilePayload): LabReservaSpreadsheet | null {
  const id = payload.id?.trim();
  if (!id || payload.mimeType !== GOOGLE_SPREADSHEET_MIME_TYPE) {
    return null;
  }

  return {
    id,
    name: nonEmptyString(payload.name, 'Planilha do laboratório'),
    modifiedTime: payload.modifiedTime?.trim() ?? '',
    webViewLink: nonEmptyString(payload.webViewLink, spreadsheetUrl(id)),
    appProperties: { ...payload.appProperties },
  };
}

function isLabReservaSpreadsheet(spreadsheet: LabReservaSpreadsheet): boolean {
  return (
    spreadsheet.appProperties.type === LAB_RESERVA_SPREADSHEET_APP_PROPERTIES.type &&
    spreadsheet.appProperties.version === LAB_RESERVA_SPREADSHEET_APP_PROPERTIES.version
  );
}

function fileFields(): string {
  return 'id,name,mimeType,modifiedTime,webViewLink,appProperties';
}

const SPREADSHEET_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WRITER_PERMISSION_FIELDS = 'id,type,role,emailAddress,deleted';
const SHARING_FORBIDDEN_ERROR = {
  code: 'SHARING_FORBIDDEN',
  message:
    'A política de compartilhamento do Google Workspace bloqueou o acesso da conta do backend. Peça ao administrador do domínio para autorizar esse compartilhamento.',
} as const;

function requireSpreadsheetId(spreadsheetId: string): string {
  const normalizedId = spreadsheetId.trim();
  if (!SPREADSHEET_ID_PATTERN.test(normalizedId)) {
    throw new GoogleDriveIntegrationError(
      'INVALID_ARGUMENT',
      'Informe um identificador válido da planilha antes de compartilhar o acesso.',
    );
  }
  return normalizedId;
}

function requireWriterEmail(writerEmail: string): string {
  const normalizedEmail = writerEmail.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new GoogleDriveIntegrationError(
      'INVALID_ARGUMENT',
      'Informe um e-mail válido para a conta do backend.',
    );
  }
  return normalizedEmail;
}

function requirePermissionId(permission: GoogleDrivePermissionPayload): string {
  const permissionId = permission.id?.trim();
  if (!permissionId) {
    throw new GoogleDriveIntegrationError(
      'INVALID_RESPONSE',
      'O Google Drive não informou o identificador da permissão de compartilhamento.',
    );
  }
  return permissionId;
}

async function listSpreadsheetPermissions(
  spreadsheetId: string,
  accessToken: string,
  fetchImplementation: GoogleDriveFetch,
): Promise<GoogleDrivePermissionPayload[]> {
  const permissions: GoogleDrivePermissionPayload[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      fields: `nextPageToken,permissions(${WRITER_PERMISSION_FIELDS})`,
      pageSize: '100',
      supportsAllDrives: 'true',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const result = await requestDriveApi<GoogleDrivePermissionListPayload>(
      `${GOOGLE_DRIVE_FILES_API_URL}/${encodeURIComponent(spreadsheetId)}/permissions?${params.toString()}`,
      accessToken,
      fetchImplementation,
      {},
      SHARING_FORBIDDEN_ERROR,
    );
    if (!result.found) {
      throw new GoogleDriveIntegrationError(
        'FILE_UNAVAILABLE',
        'A planilha que seria compartilhada não está mais acessível.',
        404,
      );
    }
    if (result.payload.permissions !== undefined && !Array.isArray(result.payload.permissions)) {
      throw new GoogleDriveIntegrationError(
        'INVALID_RESPONSE',
        'O Google Drive retornou uma lista de permissões inválida.',
      );
    }
    permissions.push(...(result.payload.permissions ?? []));

    const normalizedNextPageToken = result.payload.nextPageToken?.trim() ?? '';
    if (normalizedNextPageToken && seenPageTokens.has(normalizedNextPageToken)) {
      throw new GoogleDriveIntegrationError(
        'INVALID_RESPONSE',
        'O Google Drive repetiu uma página ao consultar as permissões da planilha.',
      );
    }
    if (normalizedNextPageToken) {
      seenPageTokens.add(normalizedNextPageToken);
    }
    pageToken = normalizedNextPageToken || null;
  } while (pageToken);

  return permissions;
}

/**
 * Garante acesso de escrita para uma conta fixa do backend sem criar permissões
 * duplicadas em novas tentativas de provisionamento.
 */
export async function ensureSpreadsheetWriterAccess(
  spreadsheetId: string,
  writerEmail: string,
  options: GoogleDriveRequestOptions,
): Promise<SpreadsheetWriterAccessResult> {
  const normalizedId = requireSpreadsheetId(spreadsheetId);
  const normalizedEmail = requireWriterEmail(writerEmail);
  const accessToken = requireAccessToken(options.accessToken);
  const fetchImplementation = resolveFetch(options.fetchImplementation);
  const permissions = await listSpreadsheetPermissions(
    normalizedId,
    accessToken,
    fetchImplementation,
  );
  const matchingPermissions = permissions.filter(
    (permission) =>
      permission.deleted !== true &&
      (permission.type === 'user' || permission.type === 'group') &&
      permission.emailAddress?.trim().toLowerCase() === normalizedEmail,
  );
  const existingWriter = matchingPermissions.find(
    (permission) => permission.role === 'writer' || permission.role === 'owner',
  );

  if (existingWriter) {
    return {
      permissionId: requirePermissionId(existingWriter),
      writerEmail: normalizedEmail,
      role: existingWriter.role === 'owner' ? 'owner' : 'writer',
      action: 'existing',
    };
  }

  const upgradablePermission = matchingPermissions.find(
    (permission) => permission.role === 'reader' || permission.role === 'commenter',
  );
  if (upgradablePermission) {
    const permissionId = requirePermissionId(upgradablePermission);
    const params = new URLSearchParams({
      fields: WRITER_PERMISSION_FIELDS,
      supportsAllDrives: 'true',
    });
    const result = await requestDriveApi<GoogleDrivePermissionPayload>(
      `${GOOGLE_DRIVE_FILES_API_URL}/${encodeURIComponent(normalizedId)}/permissions/${encodeURIComponent(permissionId)}?${params.toString()}`,
      accessToken,
      fetchImplementation,
      {
        method: 'PATCH',
        body: JSON.stringify({ role: 'writer' }),
      },
      SHARING_FORBIDDEN_ERROR,
    );
    if (!result.found) {
      throw new GoogleDriveIntegrationError(
        'FILE_UNAVAILABLE',
        'A permissão da conta do backend não está mais disponível.',
        404,
      );
    }
    return {
      permissionId,
      writerEmail: normalizedEmail,
      role: 'writer',
      action: 'updated',
    };
  }

  if (matchingPermissions.length > 0) {
    throw new GoogleDriveIntegrationError(
      'INVALID_RESPONSE',
      'A conta do backend possui uma permissão incompatível que não pode ser atualizada automaticamente.',
    );
  }

  const params = new URLSearchParams({
    fields: WRITER_PERMISSION_FIELDS,
    sendNotificationEmail: 'false',
    supportsAllDrives: 'true',
  });
  const result = await requestDriveApi<GoogleDrivePermissionPayload>(
    `${GOOGLE_DRIVE_FILES_API_URL}/${encodeURIComponent(normalizedId)}/permissions?${params.toString()}`,
    accessToken,
    fetchImplementation,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'user',
        role: 'writer',
        emailAddress: normalizedEmail,
      }),
    },
    SHARING_FORBIDDEN_ERROR,
  );
  if (!result.found) {
    throw new GoogleDriveIntegrationError(
      'FILE_UNAVAILABLE',
      'A planilha que seria compartilhada não está mais acessível.',
      404,
    );
  }

  return {
    permissionId: requirePermissionId(result.payload),
    writerEmail: normalizedEmail,
    role: 'writer',
    action: 'created',
  };
}

/**
 * Marca uma planilha recém-criada para que ela possa ser reencontrada em
 * outro dispositivo sem depender do localStorage.
 */
export async function tagLabReservaSpreadsheet(
  spreadsheetId: string,
  options: GoogleDriveRequestOptions,
): Promise<LabReservaSpreadsheet> {
  const normalizedId = spreadsheetId.trim();
  if (!normalizedId) {
    throw new GoogleDriveIntegrationError(
      'FILE_UNAVAILABLE',
      'A planilha criada não possui um identificador válido.',
    );
  }

  const accessToken = requireAccessToken(options.accessToken);
  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: 'true',
  });
  const result = await requestDriveApi<GoogleDriveFilePayload>(
    `${GOOGLE_DRIVE_FILES_API_URL}/${encodeURIComponent(normalizedId)}?${params.toString()}`,
    accessToken,
    resolveFetch(options.fetchImplementation),
    {
      method: 'PATCH',
      body: JSON.stringify({
        appProperties: LAB_RESERVA_SPREADSHEET_APP_PROPERTIES,
      }),
    },
  );

  if (!result.found) {
    throw new GoogleDriveIntegrationError(
      'FILE_UNAVAILABLE',
      'A planilha criada não está acessível nesta conta Google.',
      404,
    );
  }

  const spreadsheet = normalizeSpreadsheet(result.payload);
  if (!spreadsheet) {
    throw new GoogleDriveIntegrationError(
      'INVALID_RESPONSE',
      'O Google Drive não confirmou a planilha criada.',
    );
  }
  return spreadsheet;
}

/**
 * Confere se o vínculo local ainda aponta para uma planilha acessível pela
 * conta atual. Um 404 é tratado como vínculo ausente, não como falha geral.
 */
export async function getAccessibleSpreadsheet(
  spreadsheetId: string,
  options: GoogleDriveRequestOptions,
): Promise<LabReservaSpreadsheet | null> {
  const normalizedId = spreadsheetId.trim();
  if (!normalizedId) {
    return null;
  }

  const accessToken = requireAccessToken(options.accessToken);
  const params = new URLSearchParams({
    fields: fileFields(),
    supportsAllDrives: 'true',
  });
  const result = await requestDriveApi<GoogleDriveFilePayload>(
    `${GOOGLE_DRIVE_FILES_API_URL}/${encodeURIComponent(normalizedId)}?${params.toString()}`,
    accessToken,
    resolveFetch(options.fetchImplementation),
  );

  return result.found ? normalizeSpreadsheet(result.payload) : null;
}

function driveQuery(): string {
  const { type, version } = LAB_RESERVA_SPREADSHEET_APP_PROPERTIES;
  return [
    'trashed = false',
    `mimeType = '${GOOGLE_SPREADSHEET_MIME_TYPE}'`,
    `appProperties has { key='type' and value='${type}' }`,
    `appProperties has { key='version' and value='${version}' }`,
  ].join(' and ');
}

/**
 * Lista todas as planilhas de configuração visíveis ao aplicativo. A busca
 * usa apenas appProperties e, portanto, não examina o restante do Drive.
 */
export async function listLabReservaSpreadsheets(
  options: GoogleDriveRequestOptions,
): Promise<LabReservaSpreadsheet[]> {
  const accessToken = requireAccessToken(options.accessToken);
  const fetchImplementation = resolveFetch(options.fetchImplementation);
  const spreadsheets: LabReservaSpreadsheet[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | null = null;

  do {
    const params = new URLSearchParams({
      q: driveQuery(),
      spaces: 'drive',
      orderBy: 'modifiedTime desc',
      pageSize: '100',
      fields: `nextPageToken,files(${fileFields()})`,
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    });
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const result = await requestDriveApi<GoogleDriveFileListPayload>(
      `${GOOGLE_DRIVE_FILES_API_URL}?${params.toString()}`,
      accessToken,
      fetchImplementation,
    );
    if (!result.found) {
      throw new GoogleDriveIntegrationError(
        'DRIVE_API_ERROR',
        'O Google Drive não conseguiu listar as planilhas do Lab Reserva.',
        404,
      );
    }

    for (const payload of result.payload.files ?? []) {
      const spreadsheet = normalizeSpreadsheet(payload);
      if (spreadsheet && isLabReservaSpreadsheet(spreadsheet)) {
        spreadsheets.push(spreadsheet);
      }
    }

    const normalizedNextPageToken = result.payload.nextPageToken?.trim();
    const nextPageToken =
      normalizedNextPageToken === undefined || normalizedNextPageToken === ''
        ? null
        : normalizedNextPageToken;
    if (nextPageToken && seenPageTokens.has(nextPageToken)) {
      throw new GoogleDriveIntegrationError(
        'INVALID_RESPONSE',
        'O Google Drive repetiu uma página ao listar as planilhas.',
      );
    }
    if (nextPageToken) {
      seenPageTokens.add(nextPageToken);
    }
    pageToken = nextPageToken;
  } while (pageToken);

  return spreadsheets.toSorted(
    (left, right) =>
      right.modifiedTime.localeCompare(left.modifiedTime) ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );
}
