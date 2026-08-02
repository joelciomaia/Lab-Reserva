import {
  createDefaultLaboratoryAdminConfiguration,
  DEFAULT_RESOURCES,
  DEFAULT_SED_SC_CONFIGURATION,
  isDeferredSetupValidationIssue,
  validateAdminConfiguration,
} from '../../domain/configuration';
import type {
  AdminConfiguration,
  GradeId,
  IsoWeekday,
  LeadTimeUnit,
  RetroactiveConflictPolicy,
} from '../../types';
import { tagLabReservaSpreadsheet, type GoogleDriveFetch } from './googleDrive';
import {
  clearPendingEmptySpreadsheetId,
  getPendingEmptySpreadsheetId,
  getStoredSpreadsheetId,
  storePendingEmptySpreadsheetId,
  storeSpreadsheetId,
  type SpreadsheetIdStorage,
} from './googleStorage';

const GOOGLE_SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export const GOOGLE_SHEET_TITLES = [
  'CONFIGURACOES',
  'LABORATORIOS',
  'TURNOS',
  'DISCIPLINAS',
  'TURMAS',
  'RECURSOS',
  'RESERVAS',
  'CANCELAMENTOS',
] as const;

export type GoogleSheetTitle = (typeof GOOGLE_SHEET_TITLES)[number];
type ConfigurationSheetTitle = Exclude<GoogleSheetTitle, 'RESERVAS' | 'CANCELAMENTOS'>;
type SheetCell = string | number | boolean;
type SheetMatrix = SheetCell[][];

const CONFIGURATION_SHEET_TITLES: readonly ConfigurationSheetTitle[] = [
  'CONFIGURACOES',
  'LABORATORIOS',
  'TURNOS',
  'DISCIPLINAS',
  'TURMAS',
  'RECURSOS',
];

export const RESERVATIONS_HEADER: readonly string[] = [
  'ID',
  'DATA',
  'LABORATORIO_ID',
  'LABORATORIO_NOME',
  'PROFESSOR',
  'DISCIPLINA',
  'TURMA',
  'AULAS_IDS',
  'AULAS_NOMES',
  'OBJETOS_CONHECIMENTO',
  'ITENS_UTILIZADOS',
  'OBSERVACOES',
  'CRIADO_EM',
  'AULAS_HORARIOS',
];

export const CANCELLATIONS_HEADER: readonly string[] = [
  'ID',
  'RESERVA_ID',
  'AULA_ID',
  'AULA_NOME',
  'AULA_HORARIO',
  'DATA',
  'LABORATORIO_ID',
  'CANCELADO_EM',
  'CANCELADO_POR',
  'MOTIVO',
];

interface GoogleApiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface CreateSpreadsheetResponse {
  spreadsheetId?: string;
}

interface SpreadsheetMetadataResponse {
  sheets?: {
    properties?: {
      sheetId?: number;
      title?: string;
      gridProperties?: {
        rowCount?: number;
        columnCount?: number;
      };
    };
  }[];
}

interface SpreadsheetSheetProperties {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

interface BatchGetValuesResponse {
  valueRanges?: {
    range?: string;
    values?: unknown[][];
  }[];
}

export type GoogleSheetsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SyncGoogleSheetsOptions {
  accessToken: string;
  spreadsheetId?: string | null;
  storage?: SpreadsheetIdStorage;
  fetchImplementation?: GoogleSheetsFetch;
  driveFetchImplementation?: GoogleDriveFetch;
}

export interface InitializeEmptyGoogleSheetsWorkspaceOptions {
  accessToken: string;
  previousSpreadsheetId?: string | null;
  storage?: SpreadsheetIdStorage;
  fetchImplementation?: GoogleSheetsFetch;
  driveFetchImplementation?: GoogleDriveFetch;
}

export interface GoogleSheetsWorkspaceResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  created: boolean;
}

export interface GoogleSheetsSyncResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  created: boolean;
  verified: true;
}

export interface GoogleSheetsConfigurationReadResult {
  configuration: AdminConfiguration | null;
  migrationRequired: boolean;
}

export class GoogleSheetsIntegrationError extends Error {
  public readonly code:
    | 'AUTHORIZATION_REQUIRED'
    | 'CREATE_FAILED'
    | 'INVALID_DATA'
    | 'LINK_UNAVAILABLE'
    | 'SYNC_FAILED'
    | 'VERIFICATION_FAILED';

  constructor(
    code:
      | 'AUTHORIZATION_REQUIRED'
      | 'CREATE_FAILED'
      | 'INVALID_DATA'
      | 'LINK_UNAVAILABLE'
      | 'SYNC_FAILED'
      | 'VERIFICATION_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleSheetsIntegrationError';
    this.code = code;
  }
}

function quoteSheetTitle(title: GoogleSheetTitle): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function sheetRange(title: GoogleSheetTitle, range: string): string {
  return `${quoteSheetTitle(title)}!${range}`;
}

function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`;
}

function errorMessageFromUnknown(error: unknown): string | null {
  if (error && typeof error === 'object' && 'error' in error) {
    const payload = error as GoogleApiErrorPayload;
    return payload.error?.message?.trim() ?? null;
  }
  return null;
}

async function requestGoogleApi<T>(
  fetchImplementation: GoogleSheetsFetch,
  accessToken: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
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
    throw new GoogleSheetsIntegrationError(
      'SYNC_FAILED',
      'Não foi possível acessar o Google Sheets. Verifique sua conexão e tente novamente.',
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiMessage = errorMessageFromUnknown(payload);
    if (response.status === 401) {
      throw new GoogleSheetsIntegrationError(
        'AUTHORIZATION_REQUIRED',
        apiMessage
          ? `O Google recusou a autorização: ${apiMessage}`
          : 'A autorização do Google expirou ou não permite editar esta planilha.',
      );
    }
    if (response.status === 403) {
      throw new GoogleSheetsIntegrationError(
        'SYNC_FAILED',
        apiMessage
          ? `O Google Sheets recusou a operação: ${apiMessage}`
          : 'O Google Sheets recusou a operação. Confirme se a API está habilitada e tente novamente.',
      );
    }
    if (response.status === 404) {
      throw new GoogleSheetsIntegrationError(
        'LINK_UNAVAILABLE',
        'A planilha vinculada não foi encontrada. O vínculo local desta fase pode estar desatualizado.',
      );
    }
    throw new GoogleSheetsIntegrationError(
      'SYNC_FAILED',
      apiMessage
        ? `O Google Sheets não concluiu o salvamento: ${apiMessage}`
        : 'O Google Sheets não concluiu o salvamento.',
    );
  }

  return payload as T;
}

export function serializeAdminConfiguration(
  configuration: AdminConfiguration,
): Record<ConfigurationSheetTitle, SheetMatrix> {
  return {
    CONFIGURACOES: [
      ['CHAVE', 'VALOR'],
      ['NOME_ESCOLA', configuration.school.name],
      ['ID_ESCOLA', configuration.school.id],
      ['REVISAO', configuration.revision],
      ['EXIBIR_OBSERVACOES', configuration.bookingForm.showObservations],
      ['SED_SC_ATIVO', configuration.sedSc.enabled],
      ['SED_SC_URL_FORMULARIO', configuration.sedSc.formUrl],
      ['SED_SC_REGIONAL', configuration.sedSc.regionalName],
      ['SED_SC_MUNICIPIO', configuration.sedSc.municipalityName],
      ['SED_SC_NOME_ESCOLA', configuration.sedSc.officialSchoolName],
      ['SED_SC_AREA_PADRAO', configuration.sedSc.defaultArea],
      ['SED_SC_TIPO_ATIVIDADE', configuration.sedSc.defaultActivityType],
    ],
    LABORATORIOS: [
      [
        'ID',
        'NOME',
        'ATIVO',
        'LIMITE_SIMULTANEO',
        'CAPACIDADE_ALUNOS',
        'RESPONSAVEL_NOME',
        'RESPONSAVEL_EMAIL',
        'ANTECEDENCIA_VALOR',
        'ANTECEDENCIA_UNIDADE',
        'PERMITIR_PASSADO',
        'LIMITE_RETROATIVO_DIAS',
        'CONFLITO_RETROATIVO',
        'AVISAR_NOVA_RESERVA',
        'SED_ATIVO',
        'SED_ANTECEDENCIA_MIN',
        'CHAT_ATIVO',
        'CHAT_ESPACO',
        'CHAT_ENVIAR_LINK_SED',
      ],
      ...configuration.laboratories.map((laboratory) => {
        const settings =
          configuration.laboratorySettings.find(
            (candidate) => candidate.laboratoryId === laboratory.id,
          ) ?? createDefaultLaboratoryAdminConfiguration(laboratory.id);
        return [
          laboratory.id,
          laboratory.name,
          laboratory.active,
          settings.maxConcurrentClasses ?? '',
          settings.maxStudentCapacity ?? '',
          settings.responsibleName,
          settings.responsibleEmail,
          settings.minimumLeadTimeValue,
          settings.minimumLeadTimeUnit,
          settings.allowPastBookings,
          settings.pastBookingLimitDays ?? '',
          settings.retroactiveConflictPolicy,
          settings.notifyOnNewBooking,
          settings.sedIntegrationEnabled,
          settings.sedLinkLeadMinutes,
          settings.googleChatEnabled,
          settings.googleChatSpaceName,
          settings.sendSedLinkToChat,
        ];
      }),
    ],
    TURNOS: [
      [
        'ID',
        'NOME',
        'HORA_INICIO',
        'DURACAO_AULA',
        'QUANTIDADE_AULAS',
        'INTERVALO_APOS',
        'DURACAO_INTERVALO',
        'DIAS_SEMANA',
        'ATIVO',
      ],
      ...configuration.shifts
        .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((shift) => [
          shift.id,
          shift.name,
          shift.startTime,
          shift.classDurationMinutes,
          shift.classCount,
          shift.breakAfterClass ?? '',
          shift.breakDurationMinutes,
          shift.activeWeekdays.join(','),
          shift.active,
        ]),
    ],
    DISCIPLINAS: [
      ['ID', 'NOME', 'ATIVO'],
      ...configuration.subjects
        .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((subject) => [subject.id, subject.label, subject.active]),
    ],
    TURMAS: [
      ['ID', 'NOME', 'ETAPA', 'QUANTIDADE_ALUNOS', 'ATIVO'],
      ...configuration.classGroups
        .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((classGroup) => [
          classGroup.id,
          classGroup.label,
          classGroup.gradeId,
          classGroup.studentCount,
          classGroup.active,
        ]),
    ],
    RECURSOS: [
      ['ID', 'NOME', 'ATIVO'],
      ...configuration.resources
        .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
        .map((resource) => [resource.id, resource.label, resource.active]),
    ],
  };
}

const CONFIGURATION_HEADERS = {
  CONFIGURACOES: ['CHAVE', 'VALOR'],
  LABORATORIOS: [
    'ID',
    'NOME',
    'ATIVO',
    'LIMITE_SIMULTANEO',
    'CAPACIDADE_ALUNOS',
    'RESPONSAVEL_NOME',
    'RESPONSAVEL_EMAIL',
    'ANTECEDENCIA_VALOR',
    'ANTECEDENCIA_UNIDADE',
    'PERMITIR_PASSADO',
    'LIMITE_RETROATIVO_DIAS',
    'CONFLITO_RETROATIVO',
    'AVISAR_NOVA_RESERVA',
    'SED_ATIVO',
    'SED_ANTECEDENCIA_MIN',
    'CHAT_ATIVO',
    'CHAT_ESPACO',
    'CHAT_ENVIAR_LINK_SED',
  ],
  TURNOS: [
    'ID',
    'NOME',
    'HORA_INICIO',
    'DURACAO_AULA',
    'QUANTIDADE_AULAS',
    'INTERVALO_APOS',
    'DURACAO_INTERVALO',
    'DIAS_SEMANA',
    'ATIVO',
  ],
  DISCIPLINAS: ['ID', 'NOME', 'ATIVO'],
  TURMAS: ['ID', 'NOME', 'ETAPA', 'QUANTIDADE_ALUNOS', 'ATIVO'],
  RECURSOS: ['ID', 'NOME', 'ATIVO'],
} as const satisfies Record<ConfigurationSheetTitle, readonly string[]>;

const LEGACY_LABORATORIES_HEADER = ['ID', 'NOME', 'ATIVO', 'LIMITE_SIMULTANEO'] as const;

const GRADE_IDS = new Set<GradeId>([
  'high-school-1',
  'high-school-2',
  'high-school-3',
  'eja',
  'other',
]);

function invalidSheetData(message: string): GoogleSheetsIntegrationError {
  return new GoogleSheetsIntegrationError(
    'INVALID_DATA',
    `Não foi possível carregar as configurações da planilha: ${message}`,
  );
}

function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

function readTextCell(value: unknown, location: string): string {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw invalidSheetData(`${location} deve conter um texto.`);
  }

  const text = String(value).trim();
  if (!text) {
    throw invalidSheetData(`${location} não pode ficar vazio.`);
  }
  return text;
}

function readOptionalTextCell(value: unknown, location: string, fallback = ''): string {
  return isBlankCell(value) ? fallback : readTextCell(value, location);
}

function readBooleanCell(value: unknown, location: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || (typeof value === 'string' && value.trim().toLowerCase() === 'true')) {
    return true;
  }
  if (value === 0 || (typeof value === 'string' && value.trim().toLowerCase() === 'false')) {
    return false;
  }
  throw invalidSheetData(`${location} deve ser TRUE ou FALSE.`);
}

function readOptionalBooleanCell(value: unknown, location: string, fallback: boolean): boolean {
  return isBlankCell(value) ? fallback : readBooleanCell(value, location);
}

function readIntegerCell(value: unknown, location: string): number {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^-?\d+$/.test(value.trim())
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(numericValue)) {
    throw invalidSheetData(`${location} deve conter um número inteiro.`);
  }
  return numericValue;
}

function readOptionalIntegerCell(value: unknown, location: string): number | null {
  return isBlankCell(value) ? null : readIntegerCell(value, location);
}

function readIntegerCellWithFallback(value: unknown, location: string, fallback: number): number {
  return isBlankCell(value) ? fallback : readIntegerCell(value, location);
}

function readWeekdaysCell(value: unknown, location: string): IsoWeekday[] {
  if (isBlankCell(value)) {
    return [];
  }

  const weekdays = readTextCell(value, location)
    .split(',')
    .map((weekday) => readIntegerCell(weekday, location));
  if (weekdays.some((weekday) => weekday < 1 || weekday > 7)) {
    throw invalidSheetData(`${location} deve usar números de 1 a 7 separados por vírgula.`);
  }
  return weekdays as IsoWeekday[];
}

function readGradeIdCell(value: unknown, location: string): GradeId {
  const gradeId = readTextCell(value, location);
  if (!GRADE_IDS.has(gradeId as GradeId)) {
    throw invalidSheetData(`${location} contém uma etapa desconhecida (${gradeId}).`);
  }
  return gradeId as GradeId;
}

function readLeadTimeUnitCell(
  value: unknown,
  location: string,
  fallback: LeadTimeUnit,
): LeadTimeUnit {
  if (isBlankCell(value)) {
    return fallback;
  }
  const unit = readTextCell(value, location).toUpperCase();
  if (!['MINUTES', 'HOURS', 'DAYS'].includes(unit)) {
    throw invalidSheetData(`${location} contém uma unidade desconhecida (${unit}).`);
  }
  return unit as LeadTimeUnit;
}

function readRetroactiveConflictPolicyCell(
  value: unknown,
  location: string,
  fallback: RetroactiveConflictPolicy,
): RetroactiveConflictPolicy {
  if (isBlankCell(value)) {
    return fallback;
  }
  const policy = readTextCell(value, location).toUpperCase();
  if (!['WARN', 'BLOCK'].includes(policy)) {
    throw invalidSheetData(`${location} contém uma regra desconhecida (${policy}).`);
  }
  return policy as RetroactiveConflictPolicy;
}

function headerMatches(
  actualHeader: readonly unknown[],
  expectedHeader: readonly string[],
): boolean {
  const hasUnexpectedValue = actualHeader
    .slice(expectedHeader.length)
    .some((cell) => !isBlankCell(cell));
  return (
    !hasUnexpectedValue &&
    expectedHeader.every(
      (heading, index) =>
        typeof actualHeader[index] === 'string' &&
        actualHeader[index].trim().toUpperCase() === heading,
    )
  );
}

function assertSheetHeader(title: ConfigurationSheetTitle, values: unknown[][]): void {
  const expectedHeader = CONFIGURATION_HEADERS[title];
  const actualHeader = values[0] ?? [];
  const matches =
    headerMatches(actualHeader, expectedHeader) ||
    (title === 'LABORATORIOS' && headerMatches(actualHeader, LEGACY_LABORATORIES_HEADER));

  if (!matches) {
    throw invalidSheetData(
      `a aba ${title} não possui o cabeçalho esperado (${expectedHeader.join(' | ')}).`,
    );
  }
}

function dataRows(values: unknown[][]): { row: unknown[]; rowNumber: number }[] {
  return values
    .slice(1)
    .map((row, index) => ({ row, rowNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => !isBlankCell(cell)));
}

function getConfigurationSheetValues(
  response: BatchGetValuesResponse,
  title: ConfigurationSheetTitle,
  requestedTitles: readonly ConfigurationSheetTitle[],
): unknown[][] {
  const index = requestedTitles.indexOf(title);
  if (index < 0) {
    throw invalidSheetData(`a aba ${title} não foi solicitada para leitura.`);
  }
  const values = response.valueRanges?.[index]?.values ?? [];
  assertSheetHeader(title, values);
  return values;
}

async function batchGetConfigurationSheets(
  spreadsheetId: string,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
  titles: readonly ConfigurationSheetTitle[] = CONFIGURATION_SHEET_TITLES,
): Promise<BatchGetValuesResponse> {
  const params = new URLSearchParams({
    majorDimension: 'ROWS',
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  titles.forEach((title) => {
    params.append('ranges', sheetRange(title, 'A:Z'));
  });

  return requestGoogleApi<BatchGetValuesResponse>(
    fetchImplementation,
    accessToken,
    `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
  );
}

async function getExistingSheetTitles(
  spreadsheetId: string,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
): Promise<Set<string>> {
  const fields = encodeURIComponent('sheets.properties(title)');
  const metadata = await requestGoogleApi<SpreadsheetMetadataResponse>(
    fetchImplementation,
    accessToken,
    `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`,
  );

  return new Set(
    (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title)),
  );
}

async function getSpreadsheetSheetProperties(
  spreadsheetId: string,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
): Promise<SpreadsheetSheetProperties[]> {
  const fields = encodeURIComponent(
    'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))',
  );
  const metadata = await requestGoogleApi<SpreadsheetMetadataResponse>(
    fetchImplementation,
    accessToken,
    `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}?fields=${fields}`,
  );

  return (metadata.sheets ?? []).map((sheet) => {
    const properties = sheet.properties;
    if (
      !properties ||
      !Number.isInteger(properties.sheetId) ||
      typeof properties.title !== 'string'
    ) {
      throw new GoogleSheetsIntegrationError(
        'SYNC_FAILED',
        'O Google Sheets retornou metadados incompletos das abas. Tente salvar novamente.',
      );
    }

    return {
      sheetId: properties.sheetId!,
      title: properties.title,
      rowCount: properties.gridProperties?.rowCount ?? 1000,
      columnCount: properties.gridProperties?.columnCount ?? 26,
    };
  });
}

async function createSpreadsheet(
  configuration: AdminConfiguration,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
  storage?: SpreadsheetIdStorage,
): Promise<string> {
  const title = `Lab Reserva - ${configuration.school.name.trim()}`;
  const response = await requestGoogleApi<CreateSpreadsheetResponse>(
    fetchImplementation,
    accessToken,
    GOOGLE_SHEETS_API_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: GOOGLE_SHEET_TITLES.map((sheetTitle) => ({
          properties: { title: sheetTitle },
        })),
      }),
    },
  );

  const spreadsheetId = response.spreadsheetId?.trim();
  if (!spreadsheetId) {
    throw new GoogleSheetsIntegrationError(
      'CREATE_FAILED',
      'O Google criou a planilha sem retornar um identificador válido.',
    );
  }

  // Nesta fase, o ID é um vínculo local temporário. Ele é salvo antes de qualquer
  // escrita para que uma falha posterior não provoque a criação de outra planilha.
  storeSpreadsheetId(spreadsheetId, storage);
  return spreadsheetId;
}

interface ResolvedSpreadsheetLink {
  spreadsheetId: string;
  created: boolean;
}

const SPREADSHEET_CREATION_LOCK = 'lab-reserva-create-configuration-spreadsheet';

function initialSheetHeader(title: GoogleSheetTitle): readonly string[] {
  if (title === 'RESERVAS') {
    return RESERVATIONS_HEADER;
  }
  if (title === 'CANCELAMENTOS') {
    return CANCELLATIONS_HEADER;
  }
  return CONFIGURATION_HEADERS[title];
}

async function createEmptySpreadsheet(
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
  storage?: SpreadsheetIdStorage,
): Promise<string> {
  const response = await requestGoogleApi<CreateSpreadsheetResponse>(
    fetchImplementation,
    accessToken,
    GOOGLE_SHEETS_API_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: 'Lab Reserva - Nova escola' },
        sheets: GOOGLE_SHEET_TITLES.map((title) => ({
          properties: {
            title,
            gridProperties: {
              rowCount: DEFAULT_SHEET_ROW_COUNT,
              columnCount: CONFIGURATION_COLUMN_COUNT,
            },
          },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: toRowData([initialSheetHeader(title)]),
            },
          ],
        })),
      }),
    },
  );

  const spreadsheetId = response.spreadsheetId?.trim();
  if (!spreadsheetId) {
    throw new GoogleSheetsIntegrationError(
      'CREATE_FAILED',
      'O Google criou a planilha sem retornar um identificador válido.',
    );
  }

  // O marcador pendente distingue uma retomada de uma solicitação intencional
  // para criar outra escola.
  storePendingEmptySpreadsheetId(spreadsheetId, storage);
  storeSpreadsheetId(spreadsheetId, storage);
  return spreadsheetId;
}

export async function initializeEmptyGoogleSheetsWorkspace(
  options: InitializeEmptyGoogleSheetsWorkspaceOptions,
): Promise<GoogleSheetsWorkspaceResult> {
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new GoogleSheetsIntegrationError(
      'AUTHORIZATION_REQUIRED',
      'Entre com o Google antes de criar a planilha da escola.',
    );
  }

  const fetchImplementation = options.fetchImplementation ?? window.fetch.bind(window);
  const requestedPreviousId = options.previousSpreadsheetId?.trim();
  let normalizedPreviousId: string | null = null;
  if (requestedPreviousId) {
    normalizedPreviousId = requestedPreviousId;
  }
  const createOnlyWhenStillNeeded = async (): Promise<ResolvedSpreadsheetLink> => {
    const pendingSpreadsheetId = getPendingEmptySpreadsheetId(options.storage);
    if (pendingSpreadsheetId) {
      return { spreadsheetId: pendingSpreadsheetId, created: false };
    }

    const linkedByAnotherTab = getStoredSpreadsheetId(options.storage);
    if (linkedByAnotherTab && linkedByAnotherTab !== normalizedPreviousId) {
      return { spreadsheetId: linkedByAnotherTab, created: false };
    }

    const spreadsheetId = await createEmptySpreadsheet(
      accessToken,
      fetchImplementation,
      options.storage,
    );
    return { spreadsheetId, created: true };
  };

  const result =
    typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request(
          SPREADSHEET_CREATION_LOCK,
          { mode: 'exclusive' },
          createOnlyWhenStillNeeded,
        )
      : await createOnlyWhenStillNeeded();

  storeSpreadsheetId(result.spreadsheetId, options.storage);
  await tagLabReservaSpreadsheet(result.spreadsheetId, {
    accessToken,
    ...(options.driveFetchImplementation
      ? { fetchImplementation: options.driveFetchImplementation }
      : {}),
  });
  clearPendingEmptySpreadsheetId(result.spreadsheetId, options.storage);

  return {
    spreadsheetId: result.spreadsheetId,
    spreadsheetUrl: spreadsheetUrl(result.spreadsheetId),
    created: result.created,
  };
}

async function resolveSpreadsheetLink(
  configuration: AdminConfiguration,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
  providedSpreadsheetId: string | null,
  storage?: SpreadsheetIdStorage,
): Promise<ResolvedSpreadsheetLink> {
  if (providedSpreadsheetId) {
    return { spreadsheetId: providedSpreadsheetId, created: false };
  }

  const createOnlyWhenStillMissing = async (): Promise<ResolvedSpreadsheetLink> => {
    const linkedByAnotherTab = getStoredSpreadsheetId(storage);
    if (linkedByAnotherTab) {
      return { spreadsheetId: linkedByAnotherTab, created: false };
    }

    const spreadsheetId = await createSpreadsheet(
      configuration,
      accessToken,
      fetchImplementation,
      storage,
    );
    return { spreadsheetId, created: true };
  };

  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(
      SPREADSHEET_CREATION_LOCK,
      { mode: 'exclusive' },
      createOnlyWhenStillMissing,
    );
  }

  return createOnlyWhenStillMissing();
}

const CONFIGURATION_COLUMN_COUNT = 26;
const DEFAULT_SHEET_ROW_COUNT = 1000;

function allocateSheetId(usedSheetIds: Set<number>): number {
  let candidate = 0;
  while (usedSheetIds.has(candidate)) {
    candidate += 1;
  }
  usedSheetIds.add(candidate);
  return candidate;
}

function toCellData(value: SheetCell): Record<string, unknown> {
  if (value === '') {
    return {};
  }
  if (typeof value === 'boolean') {
    return { userEnteredValue: { boolValue: value } };
  }
  if (typeof value === 'number') {
    return { userEnteredValue: { numberValue: value } };
  }
  return { userEnteredValue: { stringValue: value } };
}

function toRowData(matrix: readonly (readonly SheetCell[])[]): { values: unknown[] }[] {
  return matrix.map((row) => ({ values: row.map(toCellData) }));
}

async function replaceConfigurationSheetsAtomically(
  spreadsheetId: string,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
  matrices: Record<ConfigurationSheetTitle, SheetMatrix>,
  initializeOperationalSheets: boolean,
  title: string,
): Promise<void> {
  const existingSheets = await getSpreadsheetSheetProperties(
    spreadsheetId,
    accessToken,
    fetchImplementation,
  );
  const sheetsByTitle = new Map(existingSheets.map((sheet) => [sheet.title, sheet]));
  const usedSheetIds = new Set(existingSheets.map((sheet) => sheet.sheetId));
  const missingTitles = GOOGLE_SHEET_TITLES.filter((title) => !sheetsByTitle.has(title));
  const requests: Record<string, unknown>[] = [
    {
      updateSpreadsheetProperties: {
        properties: { title },
        fields: 'title',
      },
    },
  ];

  for (const title of missingTitles) {
    const sheetId = allocateSheetId(usedSheetIds);
    const matrix = CONFIGURATION_SHEET_TITLES.includes(title as ConfigurationSheetTitle)
      ? matrices[title as ConfigurationSheetTitle]
      : null;
    const rowCount = Math.max(DEFAULT_SHEET_ROW_COUNT, matrix?.length ?? 1);
    const columnCount = CONFIGURATION_COLUMN_COUNT;
    requests.push({
      addSheet: {
        properties: {
          sheetId,
          title,
          gridProperties: { rowCount, columnCount },
        },
      },
    });
    sheetsByTitle.set(title, { sheetId, title, rowCount, columnCount });
  }

  for (const title of CONFIGURATION_SHEET_TITLES) {
    const sheet = sheetsByTitle.get(title);
    if (!sheet) {
      throw new GoogleSheetsIntegrationError(
        'SYNC_FAILED',
        `Não foi possível preparar a aba ${title} para o salvamento.`,
      );
    }

    const matrix = matrices[title];
    const rowCount = Math.max(sheet.rowCount, matrix.length);
    const columnCount = Math.max(sheet.columnCount, CONFIGURATION_COLUMN_COUNT);
    const resizedFields: string[] = [];
    const gridProperties: Record<string, number> = {};
    if (rowCount !== sheet.rowCount) {
      gridProperties.rowCount = rowCount;
      resizedFields.push('gridProperties.rowCount');
    }
    if (columnCount !== sheet.columnCount) {
      gridProperties.columnCount = columnCount;
      resizedFields.push('gridProperties.columnCount');
    }
    if (resizedFields.length > 0) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: sheet.sheetId, gridProperties },
          fields: resizedFields.join(','),
        },
      });
    }

    requests.push(
      {
        repeatCell: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: 0,
            startColumnIndex: 0,
            endColumnIndex: CONFIGURATION_COLUMN_COUNT,
          },
          cell: {},
          fields: 'userEnteredValue',
        },
      },
      {
        updateCells: {
          start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: 0 },
          rows: toRowData(matrix),
          fields: 'userEnteredValue',
        },
      },
    );
  }

  const missingTitleSet = new Set(missingTitles);
  const operationalHeaders: readonly [GoogleSheetTitle, readonly string[]][] = [
    ['RESERVAS', RESERVATIONS_HEADER],
    ['CANCELAMENTOS', CANCELLATIONS_HEADER],
  ];
  for (const [title, header] of operationalHeaders) {
    if (!initializeOperationalSheets && !missingTitleSet.has(title)) {
      continue;
    }
    const sheet = sheetsByTitle.get(title);
    if (!sheet) {
      throw new GoogleSheetsIntegrationError(
        'SYNC_FAILED',
        `Não foi possível preparar a aba ${title} para o salvamento.`,
      );
    }
    requests.push({
      updateCells: {
        start: { sheetId: sheet.sheetId, rowIndex: 0, columnIndex: 0 },
        rows: toRowData([header]),
        fields: 'userEnteredValue',
      },
    });
  }

  // O Sheets valida o lote inteiro antes de aplicá-lo: as seis configurações
  // ficam antigas ou novas, nunca parcialmente limpas/escritas.
  await requestGoogleApi<unknown>(
    fetchImplementation,
    accessToken,
    `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({ requests }),
    },
  );
}

function canonicalCell(value: unknown): string {
  if (typeof value === 'boolean') {
    return `boolean:${String(value)}`;
  }
  if (typeof value === 'number') {
    return `number:${String(value)}`;
  }
  if (typeof value === 'string') {
    return `string:${value}`;
  }
  if (value === null || value === undefined) {
    return 'string:';
  }
  return `invalid:${JSON.stringify(value)}`;
}

function canonicalMatrix(matrix: readonly (readonly unknown[])[]): string[][] {
  const rows = matrix.map((row) => {
    const cells = row.map(canonicalCell);
    while (cells.at(-1) === 'string:') {
      cells.pop();
    }
    return cells;
  });
  while (rows.at(-1)?.length === 0) {
    rows.pop();
  }
  return rows;
}

async function verifyConfigurationSheets(
  spreadsheetId: string,
  accessToken: string,
  fetchImplementation: GoogleSheetsFetch,
  expectedMatrices: Record<ConfigurationSheetTitle, SheetMatrix>,
): Promise<void> {
  const response = await batchGetConfigurationSheets(
    spreadsheetId,
    accessToken,
    fetchImplementation,
  );
  const valueRanges = response.valueRanges ?? [];

  for (const [index, title] of CONFIGURATION_SHEET_TITLES.entries()) {
    const actual = canonicalMatrix(valueRanges[index]?.values ?? []);
    const expected = canonicalMatrix(expectedMatrices[title]);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new GoogleSheetsIntegrationError(
        'VERIFICATION_FAILED',
        `A planilha foi atualizada, mas a conferência da aba ${title} encontrou dados diferentes. Tente salvar novamente.`,
      );
    }
  }
}

export async function readAdminConfigurationWithMetadataFromGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  fetchImplementation: GoogleSheetsFetch = window.fetch.bind(window),
): Promise<GoogleSheetsConfigurationReadResult> {
  const normalizedAccessToken = accessToken.trim();
  if (!normalizedAccessToken) {
    throw new GoogleSheetsIntegrationError(
      'AUTHORIZATION_REQUIRED',
      'Entre com o Google antes de carregar as configurações da planilha.',
    );
  }

  const normalizedSpreadsheetId = spreadsheetId.trim();
  if (!normalizedSpreadsheetId) {
    throw new GoogleSheetsIntegrationError(
      'LINK_UNAVAILABLE',
      'Selecione uma planilha de configurações antes de continuar.',
    );
  }

  const existingTitles = await getExistingSheetTitles(
    normalizedSpreadsheetId,
    normalizedAccessToken,
    fetchImplementation,
  );
  const hasResourcesSheet = existingTitles.has('RECURSOS');
  const requestedTitles = hasResourcesSheet
    ? CONFIGURATION_SHEET_TITLES
    : CONFIGURATION_SHEET_TITLES.filter((title) => title !== 'RECURSOS');
  const response = await batchGetConfigurationSheets(
    normalizedSpreadsheetId,
    normalizedAccessToken,
    fetchImplementation,
    requestedTitles,
  );
  const configurationSheetsAreEmpty = requestedTitles.every(
    (title) => dataRows(getConfigurationSheetValues(response, title, requestedTitles)).length === 0,
  );
  if (configurationSheetsAreEmpty) {
    return { configuration: null, migrationRequired: false };
  }

  const configurationValues = getConfigurationSheetValues(
    response,
    'CONFIGURACOES',
    requestedTitles,
  );
  const settings = new Map<string, unknown>();

  dataRows(configurationValues).forEach(({ row, rowNumber }) => {
    const key = readTextCell(row[0], `CONFIGURACOES!A${rowNumber}`).toUpperCase();
    if (settings.has(key)) {
      throw invalidSheetData(`a chave ${key} está repetida na aba CONFIGURACOES.`);
    }
    settings.set(key, isBlankCell(row[1]) ? '' : row[1]);
  });

  const requiredSetting = (key: string): string => {
    const value = settings.get(key);
    if (value === undefined) {
      throw invalidSheetData(`a chave ${key} está ausente na aba CONFIGURACOES.`);
    }
    return readTextCell(value, `CONFIGURACOES (${key})`);
  };
  const hasShowObservationsSetting = settings.has('EXIBIR_OBSERVACOES');
  const showObservations = hasShowObservationsSetting
    ? readBooleanCell(settings.get('EXIBIR_OBSERVACOES'), 'CONFIGURACOES (EXIBIR_OBSERVACOES)')
    : false;
  const sedSettingKeys = [
    'SED_SC_ATIVO',
    'SED_SC_URL_FORMULARIO',
    'SED_SC_REGIONAL',
    'SED_SC_MUNICIPIO',
    'SED_SC_NOME_ESCOLA',
    'SED_SC_AREA_PADRAO',
    'SED_SC_TIPO_ATIVIDADE',
  ] as const;
  const hasSedSettings = sedSettingKeys.every((key) => settings.has(key));
  const sedSc = {
    enabled: readOptionalBooleanCell(
      settings.get('SED_SC_ATIVO'),
      'CONFIGURACOES (SED_SC_ATIVO)',
      DEFAULT_SED_SC_CONFIGURATION.enabled,
    ),
    formUrl: readOptionalTextCell(
      settings.get('SED_SC_URL_FORMULARIO'),
      'CONFIGURACOES (SED_SC_URL_FORMULARIO)',
      DEFAULT_SED_SC_CONFIGURATION.formUrl,
    ),
    regionalName: readOptionalTextCell(
      settings.get('SED_SC_REGIONAL'),
      'CONFIGURACOES (SED_SC_REGIONAL)',
      DEFAULT_SED_SC_CONFIGURATION.regionalName,
    ),
    municipalityName: readOptionalTextCell(
      settings.get('SED_SC_MUNICIPIO'),
      'CONFIGURACOES (SED_SC_MUNICIPIO)',
      DEFAULT_SED_SC_CONFIGURATION.municipalityName,
    ),
    officialSchoolName: readOptionalTextCell(
      settings.get('SED_SC_NOME_ESCOLA'),
      'CONFIGURACOES (SED_SC_NOME_ESCOLA)',
      DEFAULT_SED_SC_CONFIGURATION.officialSchoolName,
    ),
    defaultArea: readOptionalTextCell(
      settings.get('SED_SC_AREA_PADRAO'),
      'CONFIGURACOES (SED_SC_AREA_PADRAO)',
      DEFAULT_SED_SC_CONFIGURATION.defaultArea,
    ),
    defaultActivityType: readOptionalTextCell(
      settings.get('SED_SC_TIPO_ATIVIDADE'),
      'CONFIGURACOES (SED_SC_TIPO_ATIVIDADE)',
      DEFAULT_SED_SC_CONFIGURATION.defaultActivityType,
    ),
  };

  const laboratoryValues = getConfigurationSheetValues(response, 'LABORATORIOS', requestedTitles);
  const hasLaboratorySettingsHeader = headerMatches(
    laboratoryValues[0] ?? [],
    CONFIGURATION_HEADERS.LABORATORIOS,
  );
  const laboratories = dataRows(laboratoryValues).map(({ row, rowNumber }) => ({
    id: readTextCell(row[0], `LABORATORIOS!A${rowNumber} (ID)`),
    name: readTextCell(row[1], `LABORATORIOS!B${rowNumber} (NOME)`),
    active: readBooleanCell(row[2], `LABORATORIOS!C${rowNumber} (ATIVO)`),
  }));
  const laboratorySettings = dataRows(laboratoryValues).map(({ row, rowNumber }, index) => {
    const laboratory = laboratories[index]!;
    const defaults = createDefaultLaboratoryAdminConfiguration(laboratory.id);
    const maxConcurrentClasses = hasLaboratorySettingsHeader
      ? readOptionalIntegerCell(row[3], `LABORATORIOS!D${rowNumber} (LIMITE_SIMULTANEO)`)
      : readIntegerCell(row[3], `LABORATORIOS!D${rowNumber} (LIMITE_SIMULTANEO)`);
    if (maxConcurrentClasses !== null && maxConcurrentClasses < 1) {
      throw invalidSheetData(
        `LABORATORIOS!D${rowNumber} (LIMITE_SIMULTANEO) deve ser maior que zero.`,
      );
    }

    return {
      laboratoryId: laboratory.id,
      responsibleName: readOptionalTextCell(
        row[5],
        `LABORATORIOS!F${rowNumber} (RESPONSAVEL_NOME)`,
        defaults.responsibleName,
      ),
      responsibleEmail: readOptionalTextCell(
        row[6],
        `LABORATORIOS!G${rowNumber} (RESPONSAVEL_EMAIL)`,
        defaults.responsibleEmail,
      ),
      maxConcurrentClasses,
      maxStudentCapacity: readOptionalIntegerCell(
        row[4],
        `LABORATORIOS!E${rowNumber} (CAPACIDADE_ALUNOS)`,
      ),
      minimumLeadTimeValue: readIntegerCellWithFallback(
        row[7],
        `LABORATORIOS!H${rowNumber} (ANTECEDENCIA_VALOR)`,
        defaults.minimumLeadTimeValue,
      ),
      minimumLeadTimeUnit: readLeadTimeUnitCell(
        row[8],
        `LABORATORIOS!I${rowNumber} (ANTECEDENCIA_UNIDADE)`,
        defaults.minimumLeadTimeUnit,
      ),
      allowPastBookings: readOptionalBooleanCell(
        row[9],
        `LABORATORIOS!J${rowNumber} (PERMITIR_PASSADO)`,
        defaults.allowPastBookings,
      ),
      pastBookingLimitDays: hasLaboratorySettingsHeader
        ? readOptionalIntegerCell(row[10], `LABORATORIOS!K${rowNumber} (LIMITE_RETROATIVO_DIAS)`)
        : defaults.pastBookingLimitDays,
      retroactiveConflictPolicy: readRetroactiveConflictPolicyCell(
        row[11],
        `LABORATORIOS!L${rowNumber} (CONFLITO_RETROATIVO)`,
        defaults.retroactiveConflictPolicy,
      ),
      notifyOnNewBooking: readOptionalBooleanCell(
        row[12],
        `LABORATORIOS!M${rowNumber} (AVISAR_NOVA_RESERVA)`,
        defaults.notifyOnNewBooking,
      ),
      sedIntegrationEnabled: readOptionalBooleanCell(
        row[13],
        `LABORATORIOS!N${rowNumber} (SED_ATIVO)`,
        defaults.sedIntegrationEnabled,
      ),
      sedLinkLeadMinutes: readIntegerCellWithFallback(
        row[14],
        `LABORATORIOS!O${rowNumber} (SED_ANTECEDENCIA_MIN)`,
        defaults.sedLinkLeadMinutes,
      ),
      googleChatEnabled: readOptionalBooleanCell(
        row[15],
        `LABORATORIOS!P${rowNumber} (CHAT_ATIVO)`,
        defaults.googleChatEnabled,
      ),
      googleChatSpaceName: readOptionalTextCell(
        row[16],
        `LABORATORIOS!Q${rowNumber} (CHAT_ESPACO)`,
        defaults.googleChatSpaceName,
      ),
      sendSedLinkToChat: readOptionalBooleanCell(
        row[17],
        `LABORATORIOS!R${rowNumber} (CHAT_ENVIAR_LINK_SED)`,
        defaults.sendSedLinkToChat,
      ),
    };
  });

  const shiftValues = getConfigurationSheetValues(response, 'TURNOS', requestedTitles);
  const shifts = dataRows(shiftValues).map(({ row, rowNumber }, index) => ({
    id: readTextCell(row[0], `TURNOS!A${rowNumber} (ID)`),
    name: readTextCell(row[1], `TURNOS!B${rowNumber} (NOME)`),
    order: index + 1,
    startTime: readTextCell(row[2], `TURNOS!C${rowNumber} (HORA_INICIO)`),
    classDurationMinutes: readIntegerCell(row[3], `TURNOS!D${rowNumber} (DURACAO_AULA)`),
    classCount: readIntegerCell(row[4], `TURNOS!E${rowNumber} (QUANTIDADE_AULAS)`),
    breakAfterClass: readOptionalIntegerCell(row[5], `TURNOS!F${rowNumber} (INTERVALO_APOS)`),
    breakDurationMinutes: readIntegerCell(row[6], `TURNOS!G${rowNumber} (DURACAO_INTERVALO)`),
    activeWeekdays: readWeekdaysCell(row[7], `TURNOS!H${rowNumber} (DIAS_SEMANA)`),
    active: readBooleanCell(row[8], `TURNOS!I${rowNumber} (ATIVO)`),
  }));

  const subjectValues = getConfigurationSheetValues(response, 'DISCIPLINAS', requestedTitles);
  const subjects = dataRows(subjectValues).map(({ row, rowNumber }, index) => ({
    id: readTextCell(row[0], `DISCIPLINAS!A${rowNumber} (ID)`),
    label: readTextCell(row[1], `DISCIPLINAS!B${rowNumber} (NOME)`),
    order: index + 1,
    active: readBooleanCell(row[2], `DISCIPLINAS!C${rowNumber} (ATIVO)`),
  }));

  const classGroupValues = getConfigurationSheetValues(response, 'TURMAS', requestedTitles);
  const classGroups = dataRows(classGroupValues).map(({ row, rowNumber }, index) => ({
    id: readTextCell(row[0], `TURMAS!A${rowNumber} (ID)`),
    label: readTextCell(row[1], `TURMAS!B${rowNumber} (NOME)`),
    gradeId: readGradeIdCell(row[2], `TURMAS!C${rowNumber} (ETAPA)`),
    studentCount: readIntegerCell(row[3], `TURMAS!D${rowNumber} (QUANTIDADE_ALUNOS)`),
    order: index + 1,
    active: readBooleanCell(row[4], `TURMAS!E${rowNumber} (ATIVO)`),
  }));

  const resources = hasResourcesSheet
    ? dataRows(getConfigurationSheetValues(response, 'RECURSOS', requestedTitles)).map(
        ({ row, rowNumber }, index) => ({
          id: readTextCell(row[0], `RECURSOS!A${rowNumber} (ID)`),
          label: readTextCell(row[1], `RECURSOS!B${rowNumber} (NOME)`),
          order: index + 1,
          active: readBooleanCell(row[2], `RECURSOS!C${rowNumber} (ATIVO)`),
        }),
      )
    : DEFAULT_RESOURCES.map((resource) => ({ ...resource }));

  const configuration: AdminConfiguration = {
    revision: requiredSetting('REVISAO'),
    school: {
      id: requiredSetting('ID_ESCOLA'),
      name: requiredSetting('NOME_ESCOLA'),
    },
    laboratories,
    shifts,
    subjects,
    classGroups,
    resources,
    bookingForm: {
      showObservations,
    },
    laboratorySettings,
    sedSc,
  };
  const validationIssues = validateAdminConfiguration(configuration).filter(
    (issue) => !isDeferredSetupValidationIssue(issue),
  );
  if (validationIssues.length > 0) {
    const details = validationIssues
      .slice(0, 3)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join(' ');
    const additionalIssueCount = validationIssues.length - 3;
    throw invalidSheetData(
      additionalIssueCount > 0 ? `${details} E mais ${additionalIssueCount} problema(s).` : details,
    );
  }

  return {
    configuration,
    migrationRequired:
      !hasResourcesSheet ||
      !hasShowObservationsSetting ||
      !hasSedSettings ||
      !hasLaboratorySettingsHeader,
  };
}

export async function readAdminConfigurationFromGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  fetchImplementation: GoogleSheetsFetch = window.fetch.bind(window),
): Promise<AdminConfiguration | null> {
  const result = await readAdminConfigurationWithMetadataFromGoogleSheets(
    accessToken,
    spreadsheetId,
    fetchImplementation,
  );
  return result.configuration;
}

export async function syncAdminConfigurationToGoogleSheets(
  configuration: AdminConfiguration,
  options: SyncGoogleSheetsOptions,
): Promise<GoogleSheetsSyncResult> {
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new GoogleSheetsIntegrationError(
      'AUTHORIZATION_REQUIRED',
      'Entre com o Google antes de salvar as configurações na planilha.',
    );
  }

  const fetchImplementation = options.fetchImplementation ?? window.fetch.bind(window);
  const providedSpreadsheetId = options.spreadsheetId?.trim();
  const normalizedProvidedSpreadsheetId =
    providedSpreadsheetId && providedSpreadsheetId.length > 0 ? providedSpreadsheetId : null;
  const { spreadsheetId, created } = await resolveSpreadsheetLink(
    configuration,
    accessToken,
    fetchImplementation,
    normalizedProvidedSpreadsheetId,
    options.storage,
  );
  await tagLabReservaSpreadsheet(spreadsheetId, {
    accessToken,
    ...(options.driveFetchImplementation
      ? { fetchImplementation: options.driveFetchImplementation }
      : {}),
  });
  const matrices = serializeAdminConfiguration(configuration);

  await replaceConfigurationSheetsAtomically(
    spreadsheetId,
    accessToken,
    fetchImplementation,
    matrices,
    created,
    `Lab Reserva - ${configuration.school.name.trim()}`,
  );
  await verifyConfigurationSheets(spreadsheetId, accessToken, fetchImplementation, matrices);

  return {
    spreadsheetId,
    spreadsheetUrl: spreadsheetUrl(spreadsheetId),
    created,
    verified: true,
  };
}
