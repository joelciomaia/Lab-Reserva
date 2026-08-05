import { RESERVATIONS_HEADER } from './googleSheets';

const GOOGLE_SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

export const GOOGLE_RESERVATIONS_SHEET_TITLE = 'RESERVAS';
export const GOOGLE_CANCELLATIONS_SHEET_TITLE = 'CANCELAMENTOS';

export const GOOGLE_RESERVATIONS_HEADER = [...RESERVATIONS_HEADER] as const;

export const GOOGLE_CANCELLATIONS_HEADER = [
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
] as const;

const RESERVATION_CORE_HEADERS = ['ID', 'DATA', 'LABORATORIO_ID', 'AULAS_IDS'] as const;
const CANCELLATION_CORE_HEADERS = ['ID', 'RESERVA_ID', 'AULA_ID'] as const;

export type GoogleReservationStatus = 'CONFIRMED' | 'PARTIALLY_CANCELLED' | 'CANCELLED';

export interface GoogleReservationCancellation {
  id: string;
  reservationId: string;
  periodId: string;
  periodLabel: string;
  periodTime: string;
  date: string;
  laboratoryId: string;
  cancelledAt: string;
  cancelledBy: string;
  reason: string;
}

export interface GoogleReservation {
  id: string;
  date: string;
  laboratoryId: string;
  laboratoryName: string;
  teacherName: string;
  classGroup: string;
  subject: string;
  periodIds: string[];
  periodLabels: string[];
  periodTimes: string[];
  activePeriodIds: string[];
  cancelledPeriodIds: string[];
  knowledgeObjects: string;
  itemsUsed: string;
  notes: string;
  createdAt: string;
  status: GoogleReservationStatus;
  cancellations: GoogleReservationCancellation[];
}

export type GoogleReservationsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface GoogleReservationsRequestOptions {
  accessToken: string;
  spreadsheetId: string;
  fetchImplementation?: GoogleReservationsFetch;
}

export interface EnsureGoogleReservationsSchemaResult {
  createdSheetTitles: string[];
  reservationsHeader: string[];
  cancellationsHeader: string[];
}

export interface CancelGoogleReservationPeriodsRequest {
  reservationId: string;
  periodIds: string[];
  cancelledBy: string;
  reason?: string;
  cancelledAt?: string;
}

export interface CancelGoogleReservationPeriodsOptions extends GoogleReservationsRequestOptions {
  createCancellationId?: () => string;
}

export interface CancelGoogleReservationPeriodsResult {
  reservation: GoogleReservation;
  appendedCancellations: GoogleReservationCancellation[];
}

export type GoogleReservationsIntegrationErrorCode =
  | 'AUTHORIZATION_REQUIRED'
  | 'LINK_UNAVAILABLE'
  | 'INVALID_SCHEMA'
  | 'INVALID_DATA'
  | 'RESERVATION_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'API_ERROR';

export class GoogleReservationsIntegrationError extends Error {
  readonly code: GoogleReservationsIntegrationErrorCode;
  readonly status: number | null;

  constructor(
    code: GoogleReservationsIntegrationErrorCode,
    message: string,
    status: number | null = null,
  ) {
    super(message);
    this.name = 'GoogleReservationsIntegrationError';
    this.code = code;
    this.status = status;
  }
}

interface SpreadsheetMetadataResponse {
  sheets?: {
    properties?: {
      title?: string;
    };
  }[];
}

interface BatchGetValuesResponse {
  valueRanges?: {
    values?: unknown[][];
  }[];
}

interface NormalizedRequestOptions {
  accessToken: string;
  spreadsheetId: string;
  fetchImplementation: GoogleReservationsFetch;
}

interface HeaderWrite {
  range: string;
  values: string[][];
}

interface ReservationBase {
  id: string;
  date: string;
  laboratoryId: string;
  laboratoryName: string;
  teacherName: string;
  classGroup: string;
  subject: string;
  periodIds: string[];
  periodLabels: string[];
  periodTimes: string[];
  knowledgeObjects: string;
  itemsUsed: string;
  notes: string;
  createdAt: string;
  storedStatus: GoogleReservationStatus;
  storedCancelledPeriodIds: string[];
  lastCancelledAt: string;
  lastCancelledBy: string;
  lastCancellationReason: string;
}

function resolveFetch(fetchImplementation?: GoogleReservationsFetch): GoogleReservationsFetch {
  if (fetchImplementation) {
    return fetchImplementation;
  }
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch.bind(window);
  }
  if (typeof fetch === 'function') {
    return fetch;
  }
  throw new GoogleReservationsIntegrationError(
    'API_ERROR',
    'O Google Sheets não está disponível neste ambiente.',
  );
}

function normalizeOptions(options: GoogleReservationsRequestOptions): NormalizedRequestOptions {
  const accessToken = options.accessToken.trim();
  if (!accessToken) {
    throw new GoogleReservationsIntegrationError(
      'AUTHORIZATION_REQUIRED',
      'Entre com o Google antes de acessar os agendamentos.',
    );
  }

  const spreadsheetId = options.spreadsheetId.trim();
  if (!spreadsheetId) {
    throw new GoogleReservationsIntegrationError(
      'LINK_UNAVAILABLE',
      'Selecione a planilha da escola antes de acessar os agendamentos.',
    );
  }

  return {
    accessToken,
    spreadsheetId,
    fetchImplementation: resolveFetch(options.fetchImplementation),
  };
}

async function requestGoogleApi<T>(
  options: NormalizedRequestOptions,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await options.fetchImplementation(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new GoogleReservationsIntegrationError(
      'API_ERROR',
      'Não foi possível acessar os agendamentos no Google Sheets.',
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) {
      throw new GoogleReservationsIntegrationError(
        'AUTHORIZATION_REQUIRED',
        'A autorização do Google expirou. Entre novamente para continuar.',
        response.status,
      );
    }
    throw new GoogleReservationsIntegrationError(
      'API_ERROR',
      'O Google Sheets recusou a operação com os agendamentos.',
      response.status,
    );
  }

  return payload as T;
}

function normalizeHeader(value: unknown): string {
  return cellText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  return '';
}

function isBlankRow(row: readonly unknown[]): boolean {
  return row.every((cell) => cellText(cell) === '');
}

function createHeaderIndex(header: readonly unknown[], sheetTitle: string): Map<string, number> {
  const index = new Map<string, number>();
  header.forEach((cell, cellIndex) => {
    const normalized = normalizeHeader(cell);
    if (!normalized) {
      return;
    }
    if (index.has(normalized)) {
      throw new GoogleReservationsIntegrationError(
        'INVALID_SCHEMA',
        `A aba ${sheetTitle} possui a coluna ${cellText(cell)} repetida.`,
      );
    }
    index.set(normalized, cellIndex);
  });
  return index;
}

function assertCoreHeaders(
  header: readonly unknown[],
  requiredHeaders: readonly string[],
  sheetTitle: string,
): Map<string, number> {
  const index = createHeaderIndex(header, sheetTitle);
  const missingHeaders = requiredHeaders.filter((headerName) => !index.has(headerName));
  if (missingHeaders.length > 0) {
    throw new GoogleReservationsIntegrationError(
      'INVALID_SCHEMA',
      `A aba ${sheetTitle} não possui as colunas obrigatórias: ${missingHeaders.join(', ')}.`,
    );
  }
  return index;
}

function columnName(columnNumber: number): string {
  let current = columnNumber;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function quoteSheetTitle(title: string): string {
  return `'${title.replaceAll("'", "''")}'`;
}

function planHeaderWrites(
  title: string,
  currentHeader: readonly unknown[],
  completeHeader: readonly string[],
  coreHeaders: readonly string[],
): { header: string[]; writes: HeaderWrite[] } {
  const trimmedHeader = [...currentHeader.map(cellText)];
  while (trimmedHeader.at(-1) === '') {
    trimmedHeader.pop();
  }

  if (trimmedHeader.length === 0) {
    return {
      header: [...completeHeader],
      writes: [
        {
          range: `${quoteSheetTitle(title)}!A1`,
          values: [[...completeHeader]],
        },
      ],
    };
  }

  const currentIndex = assertCoreHeaders(trimmedHeader, coreHeaders, title);
  const writes: HeaderWrite[] = [];
  const completedHeader = [...trimmedHeader];

  completeHeader.forEach((headerName) => {
    const normalized = normalizeHeader(headerName);
    if (currentIndex.has(normalized)) {
      return;
    }
    completedHeader.push(headerName);
    currentIndex.set(normalized, completedHeader.length - 1);
    writes.push({
      range: `${quoteSheetTitle(title)}!${columnName(completedHeader.length)}1`,
      values: [[headerName]],
    });
  });

  return { header: completedHeader, writes };
}

function batchGetUrl(spreadsheetId: string, ranges: readonly string[]): string {
  const params = new URLSearchParams({ majorDimension: 'ROWS' });
  ranges.forEach((range) => params.append('ranges', range));
  return `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`;
}

async function ensureSchema(
  options: NormalizedRequestOptions,
): Promise<EnsureGoogleReservationsSchemaResult> {
  const metadata = await requestGoogleApi<SpreadsheetMetadataResponse>(
    options,
    `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(options.spreadsheetId)}?fields=sheets.properties(title)`,
  );
  const existingTitles = new Set(
    (metadata.sheets ?? [])
      .map((sheet) => sheet.properties?.title?.trim())
      .filter((title): title is string => Boolean(title)),
  );
  const requiredTitles = [GOOGLE_RESERVATIONS_SHEET_TITLE, GOOGLE_CANCELLATIONS_SHEET_TITLE];
  const createdSheetTitles = requiredTitles.filter((title) => !existingTitles.has(title));

  if (createdSheetTitles.length > 0) {
    await requestGoogleApi<unknown>(
      options,
      `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(options.spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: createdSheetTitles.map((title) => ({
            addSheet: { properties: { title } },
          })),
        }),
      },
    );
  }

  const headerResponse = await requestGoogleApi<BatchGetValuesResponse>(
    options,
    batchGetUrl(options.spreadsheetId, [
      `${quoteSheetTitle(GOOGLE_RESERVATIONS_SHEET_TITLE)}!A1:ZZ1`,
      `${quoteSheetTitle(GOOGLE_CANCELLATIONS_SHEET_TITLE)}!A1:ZZ1`,
    ]),
  );
  const reservationHeader = headerResponse.valueRanges?.[0]?.values?.[0] ?? [];
  const cancellationHeader = headerResponse.valueRanges?.[1]?.values?.[0] ?? [];
  const reservationPlan = planHeaderWrites(
    GOOGLE_RESERVATIONS_SHEET_TITLE,
    reservationHeader,
    GOOGLE_RESERVATIONS_HEADER,
    RESERVATION_CORE_HEADERS,
  );
  const cancellationPlan = planHeaderWrites(
    GOOGLE_CANCELLATIONS_SHEET_TITLE,
    cancellationHeader,
    GOOGLE_CANCELLATIONS_HEADER,
    CANCELLATION_CORE_HEADERS,
  );
  const writes = [...reservationPlan.writes, ...cancellationPlan.writes];

  if (writes.length > 0) {
    await requestGoogleApi<unknown>(
      options,
      `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(options.spreadsheetId)}/values:batchUpdate`,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: writes.map((write) => ({
            range: write.range,
            majorDimension: 'ROWS',
            values: write.values,
          })),
        }),
      },
    );
  }

  return {
    createdSheetTitles,
    reservationsHeader: reservationPlan.header,
    cancellationsHeader: cancellationPlan.header,
  };
}

export async function ensureGoogleReservationsSchema(
  options: GoogleReservationsRequestOptions,
): Promise<EnsureGoogleReservationsSchemaResult> {
  return ensureSchema(normalizeOptions(options));
}

function getCell(
  row: readonly unknown[],
  headerIndex: ReadonlyMap<string, number>,
  headerName: string,
): string {
  const cellIndex = headerIndex.get(normalizeHeader(headerName));
  return cellIndex === undefined ? '' : cellText(row[cellIndex]);
}

function getRequiredCell(
  row: readonly unknown[],
  headerIndex: ReadonlyMap<string, number>,
  headerName: string,
  sheetTitle: string,
  rowNumber: number,
): string {
  const value = getCell(row, headerIndex, headerName);
  if (!value) {
    throw new GoogleReservationsIntegrationError(
      'INVALID_DATA',
      `A célula ${sheetTitle}!${headerName} da linha ${rowNumber} está vazia.`,
    );
  }
  return value;
}

function parseListCell(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map(cellText).filter(Boolean);
      }
    } catch {
      // Planilhas legadas usam texto delimitado; a leitura continua abaixo.
    }
  }

  const delimiter = trimmed.includes(';')
    ? /\s*;\s*/
    : trimmed.includes('\n')
      ? /\s*\r?\n\s*/
      : trimmed.includes('|')
        ? /\s*\|\s*/
        : /\s*,\s*/;
  return trimmed
    .split(delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function parseReservationRows(values: readonly (readonly unknown[])[]): ReservationBase[] {
  const header = values[0];
  if (!header || isBlankRow(header)) {
    return [];
  }
  const headerIndex = assertCoreHeaders(
    header,
    RESERVATION_CORE_HEADERS,
    GOOGLE_RESERVATIONS_SHEET_TITLE,
  );
  const seenIds = new Set<string>();

  return values.slice(1).flatMap((row, rowIndex) => {
    if (isBlankRow(row)) {
      return [];
    }
    const rowNumber = rowIndex + 2;
    const id = getRequiredCell(row, headerIndex, 'ID', GOOGLE_RESERVATIONS_SHEET_TITLE, rowNumber);
    if (seenIds.has(id)) {
      throw new GoogleReservationsIntegrationError(
        'INVALID_DATA',
        `A reserva ${id} está repetida na aba ${GOOGLE_RESERVATIONS_SHEET_TITLE}.`,
      );
    }
    seenIds.add(id);

    const periodIds = unique(parseListCell(getCell(row, headerIndex, 'AULAS_IDS')));
    if (periodIds.length === 0) {
      throw new GoogleReservationsIntegrationError(
        'INVALID_DATA',
        `A reserva ${id} não possui aulas válidas.`,
      );
    }

    return [
      {
        id,
        date: getRequiredCell(row, headerIndex, 'DATA', GOOGLE_RESERVATIONS_SHEET_TITLE, rowNumber),
        laboratoryId: getRequiredCell(
          row,
          headerIndex,
          'LABORATORIO_ID',
          GOOGLE_RESERVATIONS_SHEET_TITLE,
          rowNumber,
        ),
        laboratoryName: getCell(row, headerIndex, 'LABORATORIO_NOME'),
        teacherName: getCell(row, headerIndex, 'PROFESSOR'),
        subject: getCell(row, headerIndex, 'DISCIPLINA'),
        classGroup: getCell(row, headerIndex, 'TURMA'),
        periodIds,
        periodLabels: parseListCell(getCell(row, headerIndex, 'AULAS_NOMES')),
        periodTimes: parseListCell(getCell(row, headerIndex, 'AULAS_HORARIOS')),
        knowledgeObjects: getCell(row, headerIndex, 'OBJETOS_CONHECIMENTO'),
        itemsUsed: getCell(row, headerIndex, 'ITENS_UTILIZADOS'),
        notes: getCell(row, headerIndex, 'OBSERVACOES'),
        createdAt: getCell(row, headerIndex, 'CRIADO_EM'),
        storedStatus:
          (getCell(row, headerIndex, 'STATUS') as GoogleReservationStatus) || 'CONFIRMED',
        storedCancelledPeriodIds: unique(
          parseListCell(getCell(row, headerIndex, 'AULAS_CANCELADAS_IDS')),
        ),
        lastCancelledAt: getCell(row, headerIndex, 'CANCELADO_EM'),
        lastCancelledBy: getCell(row, headerIndex, 'CANCELADO_POR'),
        lastCancellationReason: getCell(row, headerIndex, 'MOTIVO_CANCELAMENTO'),
      },
    ];
  });
}

function parseCancellationRows(
  values: readonly (readonly unknown[])[],
): GoogleReservationCancellation[] {
  const header = values[0];
  if (!header || isBlankRow(header)) {
    return [];
  }
  const headerIndex = assertCoreHeaders(
    header,
    CANCELLATION_CORE_HEADERS,
    GOOGLE_CANCELLATIONS_SHEET_TITLE,
  );

  return values.slice(1).flatMap((row, rowIndex) => {
    if (isBlankRow(row)) {
      return [];
    }
    const rowNumber = rowIndex + 2;
    return [
      {
        id: getRequiredCell(row, headerIndex, 'ID', GOOGLE_CANCELLATIONS_SHEET_TITLE, rowNumber),
        reservationId: getRequiredCell(
          row,
          headerIndex,
          'RESERVA_ID',
          GOOGLE_CANCELLATIONS_SHEET_TITLE,
          rowNumber,
        ),
        periodId: getRequiredCell(
          row,
          headerIndex,
          'AULA_ID',
          GOOGLE_CANCELLATIONS_SHEET_TITLE,
          rowNumber,
        ),
        periodLabel: getCell(row, headerIndex, 'AULA_NOME'),
        periodTime: getCell(row, headerIndex, 'AULA_HORARIO'),
        date: getCell(row, headerIndex, 'DATA'),
        laboratoryId: getCell(row, headerIndex, 'LABORATORIO_ID'),
        cancelledAt: getCell(row, headerIndex, 'CANCELADO_EM'),
        cancelledBy: getCell(row, headerIndex, 'CANCELADO_POR'),
        reason: getCell(row, headerIndex, 'MOTIVO'),
      },
    ];
  });
}

function deriveReservation(
  reservation: ReservationBase,
  allCancellations: readonly GoogleReservationCancellation[],
): GoogleReservation {
  const periodIdSet = new Set(reservation.periodIds);
  const cancellations = allCancellations.filter(
    (cancellation) =>
      cancellation.reservationId === reservation.id && periodIdSet.has(cancellation.periodId),
  );
  const cancelledSet = new Set([
    ...reservation.storedCancelledPeriodIds,
    ...cancellations.map((cancellation) => cancellation.periodId),
  ]);
  if (reservation.storedStatus === 'CANCELLED' && cancelledSet.size === 0) {
    reservation.periodIds.forEach((periodId) => cancelledSet.add(periodId));
  }
  const cancelledPeriodIds = reservation.periodIds.filter((periodId) => cancelledSet.has(periodId));
  const activePeriodIds = reservation.periodIds.filter((periodId) => !cancelledSet.has(periodId));
  const status: GoogleReservationStatus =
    activePeriodIds.length === 0
      ? 'CANCELLED'
      : cancelledPeriodIds.length > 0
        ? 'PARTIALLY_CANCELLED'
        : 'CONFIRMED';

  return {
    ...reservation,
    activePeriodIds,
    cancelledPeriodIds,
    status,
    cancellations,
  };
}

export function parseGoogleReservations(
  reservationValues: readonly (readonly unknown[])[],
  cancellationValues: readonly (readonly unknown[])[],
): GoogleReservation[] {
  const reservations = parseReservationRows(reservationValues);
  const cancellations = parseCancellationRows(cancellationValues);
  return reservations.map((reservation) => deriveReservation(reservation, cancellations));
}

async function listReservations(options: NormalizedRequestOptions): Promise<GoogleReservation[]> {
  await ensureSchema(options);
  const values = await requestGoogleApi<BatchGetValuesResponse>(
    options,
    batchGetUrl(options.spreadsheetId, [
      `${quoteSheetTitle(GOOGLE_RESERVATIONS_SHEET_TITLE)}!A:ZZ`,
      `${quoteSheetTitle(GOOGLE_CANCELLATIONS_SHEET_TITLE)}!A:ZZ`,
    ]),
  );

  return parseGoogleReservations(
    values.valueRanges?.[0]?.values ?? [],
    values.valueRanges?.[1]?.values ?? [],
  );
}

export async function listGoogleReservations(
  options: GoogleReservationsRequestOptions,
): Promise<GoogleReservation[]> {
  return listReservations(normalizeOptions(options));
}

function defaultCancellationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `CANCEL-${crypto.randomUUID()}`;
  }
  return `CANCEL-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeCancelledAt(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new GoogleReservationsIntegrationError(
      'VALIDATION_ERROR',
      'A data do cancelamento não é válida.',
    );
  }
  return normalized;
}

function createUpdatedReservation(
  reservation: GoogleReservation,
  appendedCancellations: readonly GoogleReservationCancellation[],
): GoogleReservation {
  const base: ReservationBase = {
    id: reservation.id,
    date: reservation.date,
    laboratoryId: reservation.laboratoryId,
    laboratoryName: reservation.laboratoryName,
    teacherName: reservation.teacherName,
    classGroup: reservation.classGroup,
    subject: reservation.subject,
    periodIds: reservation.periodIds,
    periodLabels: reservation.periodLabels,
    periodTimes: reservation.periodTimes,
    knowledgeObjects: reservation.knowledgeObjects,
    itemsUsed: reservation.itemsUsed,
    notes: reservation.notes,
    createdAt: reservation.createdAt,
    storedStatus: reservation.status,
    storedCancelledPeriodIds: reservation.cancelledPeriodIds,
    lastCancelledAt: reservation.cancellations.at(-1)?.cancelledAt ?? '',
    lastCancelledBy: reservation.cancellations.at(-1)?.cancelledBy ?? '',
    lastCancellationReason: reservation.cancellations.at(-1)?.reason ?? '',
  };
  return deriveReservation(base, [...reservation.cancellations, ...appendedCancellations]);
}

export async function cancelGoogleReservationPeriods(
  request: CancelGoogleReservationPeriodsRequest,
  options: CancelGoogleReservationPeriodsOptions,
): Promise<CancelGoogleReservationPeriodsResult> {
  const normalizedOptions = normalizeOptions(options);
  const reservationId = request.reservationId.trim();
  const requestedPeriodIds = unique(
    request.periodIds.map((periodId) => periodId.trim()).filter(Boolean),
  );
  const cancelledBy = request.cancelledBy.trim();

  if (!reservationId || requestedPeriodIds.length === 0 || !cancelledBy) {
    throw new GoogleReservationsIntegrationError(
      'VALIDATION_ERROR',
      'Informe a reserva, as aulas e o responsável pelo cancelamento.',
    );
  }

  const schema = await ensureSchema(normalizedOptions);
  const values = await requestGoogleApi<BatchGetValuesResponse>(
    normalizedOptions,
    batchGetUrl(normalizedOptions.spreadsheetId, [
      `${quoteSheetTitle(GOOGLE_RESERVATIONS_SHEET_TITLE)}!A:ZZ`,
      `${quoteSheetTitle(GOOGLE_CANCELLATIONS_SHEET_TITLE)}!A:ZZ`,
    ]),
  );
  const reservationValues = values.valueRanges?.[0]?.values ?? [];
  const cancellationValues = values.valueRanges?.[1]?.values ?? [];
  const reservations = parseGoogleReservations(reservationValues, cancellationValues);
  const reservation = reservations.find((candidate) => candidate.id === reservationId);
  if (!reservation) {
    throw new GoogleReservationsIntegrationError(
      'RESERVATION_NOT_FOUND',
      'O agendamento não foi encontrado.',
    );
  }

  const reservationPeriodIds = new Set(reservation.periodIds);
  const invalidPeriodIds = requestedPeriodIds.filter(
    (periodId) => !reservationPeriodIds.has(periodId),
  );
  if (invalidPeriodIds.length > 0) {
    throw new GoogleReservationsIntegrationError(
      'VALIDATION_ERROR',
      `As aulas ${invalidPeriodIds.join(', ')} não pertencem a este agendamento.`,
    );
  }

  const activePeriodIds = new Set(reservation.activePeriodIds);
  const periodIdsToAppend = requestedPeriodIds.filter((periodId) => activePeriodIds.has(periodId));
  if (periodIdsToAppend.length === 0) {
    return { reservation, appendedCancellations: [] };
  }

  const cancelledAt = normalizeCancelledAt(request.cancelledAt);
  const reason = request.reason?.trim() ?? '';
  const createCancellationId = options.createCancellationId ?? defaultCancellationId;
  const generatedIds = new Set<string>();
  const appendedCancellations = periodIdsToAppend.map((periodId, index) => {
    const periodIndex = reservation.periodIds.indexOf(periodId);
    const generatedId = createCancellationId().trim();
    const id =
      generatedId && !generatedIds.has(generatedId)
        ? generatedId
        : `${generatedId || 'CANCEL'}-${index + 1}`;
    generatedIds.add(id);
    return {
      id,
      reservationId: reservation.id,
      periodId,
      periodLabel: reservation.periodLabels[periodIndex] ?? '',
      periodTime: reservation.periodTimes[periodIndex] ?? '',
      date: reservation.date,
      laboratoryId: reservation.laboratoryId,
      cancelledAt,
      cancelledBy,
      reason,
    };
  });

  const reservationHeader = reservationValues[0] ?? schema.reservationsHeader;
  const reservationHeaderIndex = createHeaderIndex(
    reservationHeader,
    GOOGLE_RESERVATIONS_SHEET_TITLE,
  );
  const reservationRowIndex = reservationValues.slice(1).findIndex(
    (row) => getCell(row, reservationHeaderIndex, 'ID') === reservation.id,
  );
  if (reservationRowIndex < 0) {
    throw new GoogleReservationsIntegrationError(
      'RESERVATION_NOT_FOUND',
      'O agendamento não foi encontrado na planilha.',
    );
  }
  const reservationRowNumber = reservationRowIndex + 2;
  const updatedCancelledPeriodIds = unique([
    ...reservation.cancelledPeriodIds,
    ...periodIdsToAppend,
  ]);
  const updatedStatus: GoogleReservationStatus =
    updatedCancelledPeriodIds.length === reservation.periodIds.length
      ? 'CANCELLED'
      : 'PARTIALLY_CANCELLED';
  const stateValues: Readonly<Record<string, string>> = {
    STATUS: updatedStatus,
    AULAS_CANCELADAS_IDS: JSON.stringify(updatedCancelledPeriodIds),
    CANCELADO_EM: cancelledAt,
    CANCELADO_POR: cancelledBy,
    MOTIVO_CANCELAMENTO: reason,
  };
  const updateData = Object.entries(stateValues).map(([headerName, value]) => {
    const columnIndex = reservationHeaderIndex.get(normalizeHeader(headerName));
    if (columnIndex === undefined) {
      throw new GoogleReservationsIntegrationError(
        'INVALID_SCHEMA',
        `A aba ${GOOGLE_RESERVATIONS_SHEET_TITLE} não possui a coluna ${headerName}.`,
      );
    }
    return {
      range: `${quoteSheetTitle(GOOGLE_RESERVATIONS_SHEET_TITLE)}!${columnName(columnIndex + 1)}${reservationRowNumber}`,
      majorDimension: 'ROWS',
      values: [[value]],
    };
  });
  const firstCancellationRow = Math.max(2, cancellationValues.length + 1);
  const lastCancellationRow = firstCancellationRow + appendedCancellations.length - 1;
  updateData.push({
    range: `${quoteSheetTitle(GOOGLE_CANCELLATIONS_SHEET_TITLE)}!A${firstCancellationRow}:J${lastCancellationRow}`,
    majorDimension: 'ROWS',
    values: appendedCancellations.map((cancellation) => [
      cancellation.id,
      cancellation.reservationId,
      cancellation.periodId,
      cancellation.periodLabel,
      cancellation.periodTime,
      cancellation.date,
      cancellation.laboratoryId,
      cancellation.cancelledAt,
      cancellation.cancelledBy,
      cancellation.reason,
    ]),
  });
  await requestGoogleApi<unknown>(
    normalizedOptions,
    `${GOOGLE_SHEETS_API_URL}/${encodeURIComponent(normalizedOptions.spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: updateData }),
    },
  );

  return {
    reservation: createUpdatedReservation(reservation, appendedCancellations),
    appendedCancellations,
  };
}
