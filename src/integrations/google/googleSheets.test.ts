import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminConfiguration } from '../../types';

const driveMocks = vi.hoisted(() => ({
  tagLabReservaSpreadsheet: vi.fn(),
}));

vi.mock('./googleDrive', () => ({
  tagLabReservaSpreadsheet: driveMocks.tagLabReservaSpreadsheet,
}));

import {
  CANCELLATIONS_HEADER,
  GOOGLE_SHEET_TITLES,
  GoogleSheetsIntegrationError,
  RESERVATIONS_HEADER,
  initializeEmptyGoogleSheetsWorkspace,
  readAdminConfigurationFromGoogleSheets,
  readAdminConfigurationWithMetadataFromGoogleSheets,
  serializeAdminConfiguration,
  syncAdminConfigurationToGoogleSheets,
  type GoogleSheetsFetch,
} from './googleSheets';
import {
  createDefaultLaboratoryAdminConfiguration,
  DEFAULT_RESOURCES,
  DEFAULT_SED_SC_CONFIGURATION,
} from '../../domain/configuration';
import { getPendingEmptySpreadsheetId, GOOGLE_SPREADSHEET_STORAGE_KEY } from './googleStorage';

const configuration: AdminConfiguration = {
  revision: 'configuration-7',
  school: { id: 'school-1', name: 'Escola Horizonte' },
  laboratories: [
    { id: 'lab-1', name: 'Informática', active: true },
    { id: 'lab-2', name: 'Ciências', active: false },
  ],
  shifts: [
    {
      id: 'afternoon',
      name: 'Tarde',
      order: 2,
      startTime: '13:15',
      classDurationMinutes: 45,
      classCount: 5,
      breakAfterClass: 3,
      breakDurationMinutes: 15,
      activeWeekdays: [1, 3, 5],
      active: true,
    },
    {
      id: 'morning',
      name: 'Manhã',
      order: 1,
      startTime: '07:30',
      classDurationMinutes: 45,
      classCount: 5,
      breakAfterClass: null,
      breakDurationMinutes: 15,
      activeWeekdays: [1, 2, 3, 4, 5],
      active: true,
    },
  ],
  subjects: [
    { id: 'subject-2', label: 'História', order: 2, active: false },
    { id: 'subject-1', label: 'Matemática', order: 1, active: true },
  ],
  classGroups: [
    {
      id: 'class-1',
      label: '1ª série A',
      gradeId: 'high-school-1',
      studentCount: 32,
      order: 1,
      active: true,
    },
  ],
  resources: [
    { id: 'resource-2', label: 'Projetor', order: 2, active: false },
    { id: 'technology-none', label: 'Nenhum recurso', order: 3, active: true },
    { id: 'resource-1', label: 'Computadores', order: 1, active: true },
    { id: 'technology-other', label: 'Outro', order: 4, active: true },
  ],
  bookingForm: {
    showObservations: false,
  },
  laboratorySettings: [
    {
      laboratoryId: 'lab-1',
      responsibleName: 'Joelma Silva',
      responsibleEmail: 'laboratorio@escola.sc.gov.br',
      maxConcurrentClasses: 2,
      maxStudentCapacity: 20,
      minimumLeadTimeValue: 1,
      minimumLeadTimeUnit: 'DAYS',
      allowPastBookings: true,
      pastBookingLimitDays: 31,
      retroactiveConflictPolicy: 'WARN',
      notifyOnNewBooking: true,
      sedIntegrationEnabled: true,
      sedLinkLeadMinutes: 10,
      googleChatEnabled: true,
      googleChatSpaceName: 'spaces/AAAA',
      sendSedLinkToChat: true,
    },
    {
      laboratoryId: 'lab-2',
      responsibleName: 'Joelma Silva',
      responsibleEmail: 'laboratorio@escola.sc.gov.br',
      maxConcurrentClasses: null,
      maxStudentCapacity: null,
      minimumLeadTimeValue: 2,
      minimumLeadTimeUnit: 'HOURS',
      allowPastBookings: false,
      pastBookingLimitDays: null,
      retroactiveConflictPolicy: 'BLOCK',
      notifyOnNewBooking: false,
      sedIntegrationEnabled: false,
      sedLinkLeadMinutes: 15,
      googleChatEnabled: false,
      googleChatSpaceName: '',
      sendSedLinkToChat: false,
    },
  ],
  sedSc: {
    enabled: true,
    formUrl: 'https://docs.google.com/forms/d/e/formulario-sed/viewform',
    regionalName: 'Coordenadoria Regional de Florianópolis',
    municipalityName: 'Florianópolis',
    officialSchoolName: 'EEM Escola Horizonte',
    defaultArea: 'Tecnologias educacionais',
    defaultActivityType: 'Aula no laboratório',
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function parseRequestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') {
    throw new Error('O teste esperava um corpo JSON em texto.');
  }
  return JSON.parse(body) as unknown;
}

function createFetchMock(
  responder: (url: string, init?: RequestInit) => Response,
): GoogleSheetsFetch {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(requestUrl(input), init)),
  );
}

function verifiedValueRanges() {
  const matrices = serializeAdminConfiguration(configuration);
  return {
    valueRanges: [
      { values: matrices.CONFIGURACOES },
      { values: matrices.LABORATORIOS },
      { values: matrices.TURNOS },
      { values: matrices.DISCIPLINAS },
      { values: matrices.TURMAS },
      { values: matrices.RECURSOS },
    ],
  };
}

function spreadsheetMetadata(titles: readonly string[] = GOOGLE_SHEET_TITLES) {
  return {
    sheets: titles.map((title) => ({
      properties: {
        sheetId: GOOGLE_SHEET_TITLES.indexOf(title as (typeof GOOGLE_SHEET_TITLES)[number]) + 100,
        title,
        gridProperties: { rowCount: 1000, columnCount: 26 },
      },
    })),
  };
}

interface BatchUpdateRequest {
  addSheet?: { properties: { sheetId: number; title: string } };
  updateSpreadsheetProperties?: {
    properties: { title: string };
    fields: string;
  };
  repeatCell?: { range: { sheetId: number } };
  updateCells?: {
    start: { sheetId: number };
    rows: { values: { userEnteredValue?: Record<string, unknown> }[] }[];
  };
}

function batchUpdateRequests(body: unknown): BatchUpdateRequest[] {
  return (body as { requests: BatchUpdateRequest[] }).requests;
}

function sheetId(title: (typeof GOOGLE_SHEET_TITLES)[number]): number {
  return GOOGLE_SHEET_TITLES.indexOf(title) + 100;
}

function enteredValue(cell: { userEnteredValue?: Record<string, unknown> }): unknown {
  const value = cell.userEnteredValue;
  if (!value) {
    return '';
  }
  return value.stringValue ?? value.numberValue ?? value.boolValue ?? '';
}

function updateCellsMatrix(request: BatchUpdateRequest): unknown[][] {
  return (request.updateCells?.rows ?? []).map((row) => row.values.map(enteredValue));
}

function createReadFetch(
  response: ReturnType<typeof verifiedValueRanges>,
  titles: readonly string[] = GOOGLE_SHEET_TITLES,
): GoogleSheetsFetch {
  return createFetchMock((url) =>
    url.includes('?fields=') ? jsonResponse(spreadsheetMetadata(titles)) : jsonResponse(response),
  );
}

async function expectIntegrationError(
  promise: Promise<unknown>,
  code: GoogleSheetsIntegrationError['code'],
  messageFragment: string,
): Promise<void> {
  try {
    await promise;
    expect.fail('A leitura inválida deveria lançar um erro.');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(GoogleSheetsIntegrationError);
    if (!(error instanceof GoogleSheetsIntegrationError)) {
      throw error;
    }
    expect(error.code).toBe(code);
    expect(error.message).toContain(messageFragment);
  }
}

function requireConfiguration(value: AdminConfiguration | null): AdminConfiguration {
  if (!value) {
    throw new Error('O teste esperava uma configuração preenchida.');
  }
  return value;
}

describe('sincronização com Google Sheets', () => {
  beforeEach(() => {
    window.localStorage.clear();
    driveMocks.tagLabReservaSpreadsheet.mockReset().mockResolvedValue({
      id: 'sheet-created',
      name: 'Lab Reserva - Escola Horizonte',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-created/edit',
      appProperties: { type: 'lab-reserva-config', version: '1' },
    });
  });

  it('cria imediatamente as oito abas somente com cabeçalhos e retoma o tagging sem duplicar', async () => {
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-anterior');
    const createBodies: unknown[] = [];
    const fetchImplementation = createFetchMock((url, init) => {
      if (url.endsWith('/v4/spreadsheets')) {
        createBodies.push(parseRequestBody(init?.body));
        return jsonResponse({ spreadsheetId: 'sheet-empty' });
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });
    driveMocks.tagLabReservaSpreadsheet.mockRejectedValueOnce(new Error('Falha no tagging.'));

    await expect(
      initializeEmptyGoogleSheetsWorkspace({
        accessToken: 'access-token',
        previousSpreadsheetId: 'sheet-anterior',
        fetchImplementation,
      }),
    ).rejects.toThrow('Falha no tagging.');

    expect(createBodies).toHaveLength(1);
    expect(window.localStorage.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)).toBe('sheet-empty');
    expect(getPendingEmptySpreadsheetId()).toBe('sheet-empty');

    const createBody = createBodies[0] as {
      properties: { title: string };
      sheets: {
        properties: { title: (typeof GOOGLE_SHEET_TITLES)[number] };
        data: { rowData: { values: { userEnteredValue?: Record<string, unknown> }[] }[] }[];
      }[];
    };
    expect(createBody.properties.title).toBe('Lab Reserva - Nova escola');
    expect(createBody.sheets.map((sheet) => sheet.properties.title)).toEqual(GOOGLE_SHEET_TITLES);
    expect(createBody.sheets.every((sheet) => sheet.data[0]?.rowData.length === 1)).toBe(true);
    const reservationsSheet = createBody.sheets.find(
      (sheet) => sheet.properties.title === 'RESERVAS',
    );
    const cancellationsSheet = createBody.sheets.find(
      (sheet) => sheet.properties.title === 'CANCELAMENTOS',
    );
    expect(reservationsSheet?.data[0]?.rowData[0]?.values.map(enteredValue)).toEqual(
      RESERVATIONS_HEADER,
    );
    expect(cancellationsSheet?.data[0]?.rowData[0]?.values.map(enteredValue)).toEqual(
      CANCELLATIONS_HEADER,
    );
    expect(JSON.stringify(createBody)).not.toContain('Escola Horizonte');
    expect(JSON.stringify(createBody)).not.toContain('Matemática');

    const retryResult = await initializeEmptyGoogleSheetsWorkspace({
      accessToken: 'access-token',
      previousSpreadsheetId: 'sheet-empty',
      fetchImplementation,
    });

    expect(retryResult).toEqual({
      spreadsheetId: 'sheet-empty',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-empty/edit',
      created: false,
    });
    expect(createBodies).toHaveLength(1);
    expect(getPendingEmptySpreadsheetId()).toBeNull();
    expect(driveMocks.tagLabReservaSpreadsheet).toHaveBeenCalledTimes(2);
  });

  it('serializa todos os campos atuais nos schemas aprovados', () => {
    const matrices = serializeAdminConfiguration(configuration);

    expect(matrices.CONFIGURACOES).toEqual([
      ['CHAVE', 'VALOR'],
      ['NOME_ESCOLA', 'Escola Horizonte'],
      ['ID_ESCOLA', 'school-1'],
      ['REVISAO', 'configuration-7'],
      ['EXIBIR_OBSERVACOES', false],
      ['SED_SC_ATIVO', true],
      ['SED_SC_URL_FORMULARIO', 'https://docs.google.com/forms/d/e/formulario-sed/viewform'],
      ['SED_SC_REGIONAL', 'Coordenadoria Regional de Florianópolis'],
      ['SED_SC_MUNICIPIO', 'Florianópolis'],
      ['SED_SC_NOME_ESCOLA', 'EEM Escola Horizonte'],
      ['SED_SC_AREA_PADRAO', 'Tecnologias educacionais'],
      ['SED_SC_TIPO_ATIVIDADE', 'Aula no laboratório'],
    ]);
    expect(matrices.LABORATORIOS).toEqual([
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
      [
        'lab-1',
        'Informática',
        true,
        2,
        20,
        'Joelma Silva',
        'laboratorio@escola.sc.gov.br',
        1,
        'DAYS',
        true,
        31,
        'WARN',
        true,
        true,
        10,
        true,
        'spaces/AAAA',
        true,
      ],
      [
        'lab-2',
        'Ciências',
        false,
        '',
        '',
        'Joelma Silva',
        'laboratorio@escola.sc.gov.br',
        2,
        'HOURS',
        false,
        '',
        'BLOCK',
        false,
        false,
        15,
        false,
        '',
        false,
      ],
    ]);
    expect(matrices.TURNOS[1]).toEqual([
      'morning',
      'Manhã',
      '07:30',
      45,
      5,
      '',
      15,
      '1,2,3,4,5',
      true,
    ]);
    expect(matrices.DISCIPLINAS[1]).toEqual(['subject-1', 'Matemática', true]);
    expect(matrices.TURMAS[1]).toEqual(['class-1', '1ª série A', 'high-school-1', 32, true]);
    expect(matrices.RECURSOS).toEqual([
      ['ID', 'NOME', 'ATIVO'],
      ['resource-1', 'Computadores', true],
      ['resource-2', 'Projetor', false],
      ['technology-none', 'Nenhum recurso', true],
      ['technology-other', 'Outro', true],
    ]);
  });

  it('cria a planilha e persiste o ID antes da primeira escrita', async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    const fetchImplementation = createFetchMock((url, init) => {
      requests.push({ url, ...(init ? { init } : {}) });

      if (url.endsWith('/v4/spreadsheets')) {
        return jsonResponse({ spreadsheetId: 'sheet-created' });
      }
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata());
      }
      if (url.endsWith(':batchUpdate')) {
        expect(window.localStorage.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)).toBe('sheet-created');
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(verifiedValueRanges());
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    const result = await syncAdminConfigurationToGoogleSheets(configuration, {
      accessToken: 'access-token',
      fetchImplementation,
    });

    expect(result).toEqual({
      spreadsheetId: 'sheet-created',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-created/edit',
      created: true,
      verified: true,
    });
    expect(driveMocks.tagLabReservaSpreadsheet).toHaveBeenCalledWith('sheet-created', {
      accessToken: 'access-token',
    });

    const createBody = parseRequestBody(requests[0]?.init?.body) as {
      properties: { title: string };
      sheets: { properties: { title: string } }[];
    };
    expect(createBody.properties.title).toBe('Lab Reserva - Escola Horizonte');
    expect(createBody.sheets.map((sheet) => sheet.properties.title)).toEqual(GOOGLE_SHEET_TITLES);

    const writeRequest = requests.find((request) => request.url.endsWith(':batchUpdate'));
    const atomicRequests = batchUpdateRequests(parseRequestBody(writeRequest?.init?.body));
    const reservationsUpdate = atomicRequests.find(
      (request) => request.updateCells?.start.sheetId === sheetId('RESERVAS'),
    );
    expect(updateCellsMatrix(reservationsUpdate ?? {})).toEqual([[...RESERVATIONS_HEADER]]);
    expect(requests.some((request) => request.url.endsWith('/values:batchClear'))).toBe(false);
    expect(requests.some((request) => request.url.endsWith('/values:batchUpdate'))).toBe(false);
  });

  it('atualiza a planilha vinculada sem limpar nem escrever RESERVAS', async () => {
    const requestBodies: { url: string; body: unknown }[] = [];
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    const fetchImplementation = createFetchMock((url, init) => {
      requestBodies.push({
        url,
        body: init?.body ? parseRequestBody(init.body) : null,
      });

      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata());
      }
      if (url.endsWith(':batchUpdate')) {
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(verifiedValueRanges());
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    const result = await syncAdminConfigurationToGoogleSheets(configuration, {
      accessToken: 'access-token',
      fetchImplementation,
    });

    expect(result.created).toBe(false);
    expect(requestBodies.some((request) => request.url.endsWith('/v4/spreadsheets'))).toBe(false);
    expect(requestBodies.some((request) => request.url.endsWith('/values:batchClear'))).toBe(false);
    expect(requestBodies.some((request) => request.url.endsWith('/values:batchUpdate'))).toBe(
      false,
    );
    const atomicWrites = requestBodies.filter((request) => request.url.endsWith(':batchUpdate'));
    expect(atomicWrites).toHaveLength(1);
    const writeBody = atomicWrites[0]?.body;
    const atomicRequests = batchUpdateRequests(writeBody);
    expect(atomicRequests[0]?.updateSpreadsheetProperties).toEqual({
      properties: { title: 'Lab Reserva - Escola Horizonte' },
      fields: 'title',
    });
    expect(
      atomicRequests
        .filter((request) => request.repeatCell)
        .map((request) => request.repeatCell?.range.sheetId),
    ).toEqual([100, 101, 102, 103, 104, 105]);
    expect(
      atomicRequests
        .filter((request) => request.updateCells)
        .map((request) => request.updateCells?.start.sheetId),
    ).toEqual([100, 101, 102, 103, 104, 105]);
    expect(
      atomicRequests.some(
        (request) =>
          request.repeatCell?.range.sheetId === sheetId('RESERVAS') ||
          request.updateCells?.start.sheetId === sheetId('RESERVAS'),
      ),
    ).toBe(false);
    expect(
      atomicRequests.some(
        (request) =>
          request.repeatCell?.range.sheetId === sheetId('CANCELAMENTOS') ||
          request.updateCells?.start.sheetId === sheetId('CANCELAMENTOS'),
      ),
    ).toBe(false);
  });

  it('cria e preenche RECURSOS em uma planilha legada sem alterar RESERVAS', async () => {
    let atomicBody: unknown;
    const legacyTitles = GOOGLE_SHEET_TITLES.filter((title) => title !== 'RECURSOS');
    const fetchImplementation = createFetchMock((url, init) => {
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata(legacyTitles));
      }
      if (url.endsWith(':batchUpdate')) {
        atomicBody = parseRequestBody(init?.body);
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(verifiedValueRanges());
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    await syncAdminConfigurationToGoogleSheets(configuration, {
      accessToken: 'access-token',
      spreadsheetId: 'sheet-existing',
      fetchImplementation,
    });

    const atomicRequests = batchUpdateRequests(atomicBody);
    const addResources = atomicRequests.find(
      (request) => request.addSheet?.properties.title === 'RECURSOS',
    )?.addSheet;
    expect(addResources).toBeDefined();
    const resourcesUpdate = atomicRequests.find(
      (request) => request.updateCells?.start.sheetId === addResources?.properties.sheetId,
    );
    expect(updateCellsMatrix(resourcesUpdate ?? {})).toEqual(
      serializeAdminConfiguration(configuration).RECURSOS,
    );
    expect(
      atomicRequests.some(
        (request) =>
          request.repeatCell?.range.sheetId === sheetId('RESERVAS') ||
          request.updateCells?.start.sheetId === sheetId('RESERVAS'),
      ),
    ).toBe(false);
  });

  it('reconfere o vínculo dentro do lock e evita criar duas planilhas em abas simultâneas', async () => {
    const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
    const requests: string[] = [];
    const request = vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => {
        window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-created-by-another-tab');
        return callback(null);
      },
    );
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: { request },
    });
    const fetchImplementation = createFetchMock((url) => {
      requests.push(url);
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata());
      }
      if (url.endsWith(':batchUpdate')) {
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(verifiedValueRanges());
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    try {
      const result = await syncAdminConfigurationToGoogleSheets(configuration, {
        accessToken: 'access-token',
        fetchImplementation,
      });

      expect(result).toMatchObject({
        spreadsheetId: 'sheet-created-by-another-tab',
        created: false,
      });
      expect(requests.some((url) => url.endsWith('/v4/spreadsheets'))).toBe(false);
    } finally {
      if (originalLocksDescriptor) {
        Object.defineProperty(navigator, 'locks', originalLocksDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'locks');
      }
    }
  });

  it('cria somente a aba que estiver ausente e inicializa RESERVAS com o cabeçalho', async () => {
    let atomicBody: unknown;
    const fetchImplementation = createFetchMock((url, init) => {
      if (url.includes('?fields=')) {
        return jsonResponse(
          spreadsheetMetadata(GOOGLE_SHEET_TITLES.filter((title) => title !== 'RESERVAS')),
        );
      }
      if (url.endsWith(':batchUpdate')) {
        atomicBody = parseRequestBody(init?.body);
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(verifiedValueRanges());
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    await syncAdminConfigurationToGoogleSheets(configuration, {
      accessToken: 'access-token',
      spreadsheetId: 'sheet-existing',
      fetchImplementation,
    });

    const atomicRequests = batchUpdateRequests(atomicBody);
    const addReservations = atomicRequests.find(
      (request) => request.addSheet?.properties.title === 'RESERVAS',
    )?.addSheet;
    expect(addReservations).toBeDefined();
    const reservationsUpdate = atomicRequests.find(
      (request) => request.updateCells?.start.sheetId === addReservations?.properties.sheetId,
    );
    expect(updateCellsMatrix(reservationsUpdate ?? {})).toEqual([[...RESERVATIONS_HEADER]]);
  });

  it('relê as cinco abas e informa claramente qualquer divergência', async () => {
    const mismatched = verifiedValueRanges();
    mismatched.valueRanges[2] = {
      values: [
        ['ID', 'NOME'],
        ['incorreto', 'Turno errado'],
      ],
    };
    const fetchImplementation = createFetchMock((url) => {
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata());
      }
      if (url.endsWith(':batchUpdate')) {
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(mismatched);
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    try {
      await syncAdminConfigurationToGoogleSheets(configuration, {
        accessToken: 'access-token',
        spreadsheetId: 'sheet-existing',
        fetchImplementation,
      });
      expect.fail('A divergência deveria impedir a confirmação do salvamento.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GoogleSheetsIntegrationError);
      if (!(error instanceof GoogleSheetsIntegrationError)) {
        throw error;
      }
      expect(error.code).toBe('VERIFICATION_FAILED');
      expect(error.message).toContain('aba TURNOS');
    }
  });

  it('inclui RECURSOS na verificação posterior ao salvamento', async () => {
    const mismatched = verifiedValueRanges();
    mismatched.valueRanges[5] = {
      values: [
        ['ID', 'NOME', 'ATIVO'],
        ['resource-1', 'Nome divergente', true],
      ],
    };
    const fetchImplementation = createFetchMock((url) => {
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata());
      }
      if (url.endsWith(':batchUpdate')) {
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse(mismatched);
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    await expectIntegrationError(
      syncAdminConfigurationToGoogleSheets(configuration, {
        accessToken: 'access-token',
        spreadsheetId: 'sheet-existing',
        fetchImplementation,
      }),
      'VERIFICATION_FAILED',
      'aba RECURSOS',
    );
  });
});

describe('leitura de configurações do Google Sheets', () => {
  it('reconhece uma planilha estruturada sem nenhuma configuração como vazia', async () => {
    const response = verifiedValueRanges();
    response.valueRanges.forEach((valueRange) => {
      valueRange.values = valueRange.values.slice(0, 1);
    });

    const result = await readAdminConfigurationWithMetadataFromGoogleSheets(
      'access-token',
      'sheet-empty',
      createReadFetch(response),
    );

    expect(result).toEqual({ configuration: null, migrationRequired: false });
  });

  it('não trata uma configuração parcial como planilha vazia', async () => {
    const response = verifiedValueRanges();
    response.valueRanges.forEach((valueRange) => {
      valueRange.values = valueRange.values.slice(0, 1);
    });
    response.valueRanges[0]!.values.push(['NOME_ESCOLA', 'Escola parcial']);

    await expectIntegrationError(
      readAdminConfigurationFromGoogleSheets(
        'access-token',
        'sheet-partial',
        createReadFetch(response),
      ),
      'INVALID_DATA',
      'REVISAO',
    );
  });

  it('reconstrói a configuração pela ordem das linhas e converte os tipos das células', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[1]!.values[1]![2] = 'TRUE';
    response.valueRanges[1]!.values[2]![2] = 'false';
    response.valueRanges[1]!.values[1]![3] = '2';
    response.valueRanges[1]!.values[1]![4] = '20';
    response.valueRanges[1]!.values[1]![7] = '1';
    response.valueRanges[1]!.values[1]![9] = 'TRUE';
    response.valueRanges[1]!.values[1]![10] = '31';
    response.valueRanges[1]!.values[1]![12] = 'TRUE';
    response.valueRanges[1]!.values[1]![13] = 'TRUE';
    response.valueRanges[1]!.values[1]![14] = '10';
    response.valueRanges[1]!.values[1]![15] = 'TRUE';
    response.valueRanges[1]!.values[1]![17] = 'TRUE';
    response.valueRanges[2]!.values[1]![3] = '45';
    response.valueRanges[2]!.values[1]![4] = '5';
    response.valueRanges[2]!.values[1]![6] = '15';
    response.valueRanges[2]!.values[1]![7] = '1,2,3,4,5';
    response.valueRanges[4]!.values[1]![3] = '32';
    response.valueRanges[0]!.values[4]![1] = 'TRUE';
    response.valueRanges[0]!.values[5]![1] = 'TRUE';
    response.valueRanges[5]!.values[1]![2] = 'TRUE';

    let requestedUrl = '';
    const fetchImplementation = createFetchMock((url) => {
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata());
      }
      requestedUrl = url;
      return jsonResponse(response);
    });

    const { configuration: loadedConfiguration, migrationRequired } =
      await readAdminConfigurationWithMetadataFromGoogleSheets(
        'access-token',
        'sheet-existing',
        fetchImplementation,
      );
    const result = requireConfiguration(loadedConfiguration);

    expect(migrationRequired).toBe(false);
    expect(result.revision).toBe(configuration.revision);
    expect(result.school).toEqual(configuration.school);
    expect(result.laboratories).toEqual(configuration.laboratories);
    expect(result.shifts.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: 'morning', order: 1 },
      { id: 'afternoon', order: 2 },
    ]);
    expect(result.shifts[0]).toEqual(
      expect.objectContaining({
        breakAfterClass: null,
        activeWeekdays: [1, 2, 3, 4, 5],
        active: true,
      }),
    );
    expect(result.subjects.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: 'subject-1', order: 1 },
      { id: 'subject-2', order: 2 },
    ]);
    expect(result.classGroups).toEqual(configuration.classGroups);
    expect(result.resources).toEqual(
      configuration.resources.toSorted((left, right) => left.order - right.order),
    );
    expect(result.bookingForm.showObservations).toBe(true);
    expect(result.laboratorySettings).toEqual(configuration.laboratorySettings);
    expect(result.sedSc).toEqual(configuration.sedSc);

    const ranges = new URL(requestedUrl).searchParams.getAll('ranges');
    expect(ranges).toHaveLength(6);
    expect(ranges.some((range) => range.includes('RESERVAS'))).toBe(false);
  });

  it('restaura a configuração parcial quando turnos, turmas e recursos ainda estão vazios', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[2]!.values = response.valueRanges[2]!.values.slice(0, 1);
    response.valueRanges[4]!.values = response.valueRanges[4]!.values.slice(0, 1);
    response.valueRanges[5]!.values = response.valueRanges[5]!.values.slice(0, 1);

    const loadedConfiguration = requireConfiguration(
      await readAdminConfigurationFromGoogleSheets(
        'access-token',
        'sheet-partial-setup',
        createReadFetch(response),
      ),
    );

    expect(loadedConfiguration.school).toEqual(configuration.school);
    expect(loadedConfiguration.laboratories).toEqual(configuration.laboratories);
    expect(loadedConfiguration.shifts).toEqual([]);
    expect(loadedConfiguration.classGroups).toEqual([]);
    expect(loadedConfiguration.resources).toEqual([]);
  });

  it('carrega uma planilha legada com recursos padrão e sinaliza a migração necessária', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[0]!.values = response.valueRanges[0]!.values.filter(
      (row) =>
        ![
          'EXIBIR_OBSERVACOES',
          'SED_SC_ATIVO',
          'SED_SC_URL_FORMULARIO',
          'SED_SC_REGIONAL',
          'SED_SC_MUNICIPIO',
          'SED_SC_NOME_ESCOLA',
          'SED_SC_AREA_PADRAO',
          'SED_SC_TIPO_ATIVIDADE',
        ].includes(String(row[0])),
    );
    response.valueRanges[1]!.values = response.valueRanges[1]!.values.map((row, index) =>
      index === 0 ? ['ID', 'NOME', 'ATIVO', 'LIMITE_SIMULTANEO'] : [...row.slice(0, 3), 1],
    );
    response.valueRanges.pop();
    const legacyTitles = GOOGLE_SHEET_TITLES.filter((title) => title !== 'RECURSOS');
    let requestedRanges: string[] = [];
    const fetchImplementation = createFetchMock((url) => {
      if (url.includes('?fields=')) {
        return jsonResponse(spreadsheetMetadata(legacyTitles));
      }
      requestedRanges = new URL(url).searchParams.getAll('ranges');
      return jsonResponse(response);
    });

    const result = await readAdminConfigurationWithMetadataFromGoogleSheets(
      'access-token',
      'sheet-existing',
      fetchImplementation,
    );
    const loadedConfiguration = requireConfiguration(result.configuration);

    expect(result.migrationRequired).toBe(true);
    expect(loadedConfiguration.resources).toEqual(DEFAULT_RESOURCES);
    expect(loadedConfiguration.bookingForm.showObservations).toBe(false);
    expect(loadedConfiguration.sedSc).toEqual(DEFAULT_SED_SC_CONFIGURATION);
    expect(loadedConfiguration.laboratorySettings).toEqual(
      configuration.laboratories.map((laboratory) => ({
        ...createDefaultLaboratoryAdminConfiguration(laboratory.id),
        maxConcurrentClasses: 1,
      })),
    );
    expect(requestedRanges).toHaveLength(5);
    expect(requestedRanges.some((range) => range.includes('RECURSOS'))).toBe(false);
  });

  it('sinaliza migração quando apenas EXIBIR_OBSERVACOES ainda não existe', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[0]!.values = response.valueRanges[0]!.values.filter(
      (row) => row[0] !== 'EXIBIR_OBSERVACOES',
    );

    const result = await readAdminConfigurationWithMetadataFromGoogleSheets(
      'access-token',
      'sheet-existing',
      createReadFetch(response),
    );
    const loadedConfiguration = requireConfiguration(result.configuration);

    expect(result.migrationRequired).toBe(true);
    expect(loadedConfiguration.resources).toEqual(
      configuration.resources.toSorted((left, right) => left.order - right.order),
    );
    expect(loadedConfiguration.bookingForm.showObservations).toBe(false);
    expect(loadedConfiguration.laboratorySettings).toEqual(configuration.laboratorySettings);
    expect(loadedConfiguration.sedSc).toEqual(configuration.sedSc);
  });

  it('aceita o cabeçalho legado de laboratórios, aplica padrões e solicita migração', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[1]!.values = response.valueRanges[1]!.values.map((row, index) =>
      index === 0 ? ['ID', 'NOME', 'ATIVO', 'LIMITE_SIMULTANEO'] : [...row.slice(0, 3), index],
    );

    const result = await readAdminConfigurationWithMetadataFromGoogleSheets(
      'access-token',
      'sheet-existing',
      createReadFetch(response),
    );
    const loadedConfiguration = requireConfiguration(result.configuration);

    expect(result.migrationRequired).toBe(true);
    expect(loadedConfiguration.laboratories).toEqual(configuration.laboratories);
    expect(loadedConfiguration.laboratorySettings).toEqual(
      configuration.laboratories.map((laboratory, index) => ({
        ...createDefaultLaboratoryAdminConfiguration(laboratory.id),
        maxConcurrentClasses: index + 1,
      })),
    );
    expect(loadedConfiguration.sedSc).toEqual(configuration.sedSc);
  });

  it('rejeita uma aba que não possua o schema esperado com um erro tipado', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[3]!.values[0] = ['IDENTIFICADOR', 'NOME', 'ATIVO'];
    const fetchImplementation = createReadFetch(response);

    await expectIntegrationError(
      readAdminConfigurationFromGoogleSheets('access-token', 'sheet-existing', fetchImplementation),
      'INVALID_DATA',
      'aba DISCIPLINAS',
    );
  });

  it('rejeita uma aba RECURSOS sem o cabeçalho esperado', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[5]!.values[0] = ['IDENTIFICADOR', 'DESCRICAO', 'HABILITADO'];

    await expectIntegrationError(
      readAdminConfigurationFromGoogleSheets(
        'access-token',
        'sheet-existing',
        createReadFetch(response),
      ),
      'INVALID_DATA',
      'aba RECURSOS',
    );
  });

  it('rejeita EXIBIR_OBSERVACOES quando o valor não é booleano', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[0]!.values[4]![1] = 'talvez';

    await expectIntegrationError(
      readAdminConfigurationFromGoogleSheets(
        'access-token',
        'sheet-existing',
        createReadFetch(response),
      ),
      'INVALID_DATA',
      'EXIBIR_OBSERVACOES',
    );
  });

  it('rejeita valores desconhecidos de etapa antes de publicar a configuração', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[4]!.values[1]![2] = 'fundamental-1';
    const fetchImplementation = createReadFetch(response);

    await expectIntegrationError(
      readAdminConfigurationFromGoogleSheets('access-token', 'sheet-existing', fetchImplementation),
      'INVALID_DATA',
      'etapa desconhecida',
    );
  });

  it('valida a configuração reconstruída e informa os campos inconsistentes', async () => {
    const response = verifiedValueRanges();
    response.valueRanges[2]!.values[1]![4] = 0;
    const fetchImplementation = createReadFetch(response);

    await expectIntegrationError(
      readAdminConfigurationFromGoogleSheets('access-token', 'sheet-existing', fetchImplementation),
      'INVALID_DATA',
      'shifts.0.classCount',
    );
  });

  it('exige autorização e vínculo antes de consultar a planilha', async () => {
    const fetchImplementation = createFetchMock(() => {
      throw new Error('não deveria consultar');
    });

    await expect(
      readAdminConfigurationFromGoogleSheets('', 'sheet-existing', fetchImplementation),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_REQUIRED' });
    await expect(
      readAdminConfigurationFromGoogleSheets('access-token', '  ', fetchImplementation),
    ).rejects.toMatchObject({ code: 'LINK_UNAVAILABLE' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('mantém a autorização quando a API do Sheets recusa a operação', async () => {
    const fetchImplementation = createFetchMock(() =>
      jsonResponse(
        {
          error: {
            message: 'Google Sheets API has not been used in this project.',
          },
        },
        403,
      ),
    );

    await expect(
      readAdminConfigurationFromGoogleSheets('access-token', 'sheet-existing', fetchImplementation),
    ).rejects.toMatchObject({
      code: 'SYNC_FAILED',
    });
  });
});
