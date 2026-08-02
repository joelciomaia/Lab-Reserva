import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CANCELLATIONS_HEADER,
  GOOGLE_CANCELLATIONS_SHEET_TITLE,
  GOOGLE_RESERVATIONS_HEADER,
  GOOGLE_RESERVATIONS_SHEET_TITLE,
  cancelGoogleReservationPeriods,
  ensureGoogleReservationsSchema,
  parseGoogleReservations,
  type GoogleReservationsFetch,
} from './googleReservations';

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
): GoogleReservationsFetch {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(requestUrl(input), init)),
  );
}

function reservationRow(
  id: string,
  periodIds = '["P01","P02"]',
  periodLabels = '["1ª aula","2ª aula"]',
  periodTimes = '["07:30–08:15","08:15–09:00"]',
): unknown[] {
  return [
    id,
    '2026-08-10',
    'LAB01',
    'Laboratório de Informática',
    'Ana Ribeiro',
    'Matemática',
    '1ª série A',
    periodIds,
    periodLabels,
    'Geometria',
    'Computadores',
    'Atividade em duplas',
    '2026-08-01T12:00:00.000Z',
    periodTimes,
  ];
}

function cancellationRow(
  id: string,
  reservationId: string,
  periodId: string,
  periodLabel: string,
  periodTime: string,
): unknown[] {
  return [
    id,
    reservationId,
    periodId,
    periodLabel,
    periodTime,
    '2026-08-10',
    'LAB01',
    '2026-08-02T10:00:00.000Z',
    'laboratorista@escola.test',
    'Ajuste solicitado pelo professor',
  ];
}

function completeSheetMetadata() {
  return {
    sheets: [GOOGLE_RESERVATIONS_SHEET_TITLE, GOOGLE_CANCELLATIONS_SHEET_TITLE].map((title) => ({
      properties: { title },
    })),
  };
}

function createOperationalFetch(
  reservations: unknown[][],
  cancellations: unknown[][],
  onAppend: (body: unknown) => void,
): GoogleReservationsFetch {
  return createFetchMock((url, init) => {
    if (url.includes('?fields=sheets.properties')) {
      return jsonResponse(completeSheetMetadata());
    }
    if (url.includes('/values:batchGet?')) {
      const ranges = new URL(url).searchParams.getAll('ranges');
      if (ranges.some((range) => range.includes('A1:ZZ1'))) {
        return jsonResponse({
          valueRanges: [
            { values: [[...GOOGLE_RESERVATIONS_HEADER]] },
            { values: [[...GOOGLE_CANCELLATIONS_HEADER]] },
          ],
        });
      }
      return jsonResponse({
        valueRanges: [{ values: reservations }, { values: cancellations }],
      });
    }
    if (url.includes(':append?')) {
      onAppend(parseRequestBody(init?.body));
      return jsonResponse({ updates: { updatedRows: 1 } });
    }
    throw new Error(`Requisição inesperada: ${url}`);
  });
}

describe('persistência de reservas no Google Sheets', () => {
  it('lê a estrutura legada de RESERVAS sem exigir AULAS_HORARIOS', () => {
    const legacyHeader = GOOGLE_RESERVATIONS_HEADER.slice(0, -1);
    const legacyRow = reservationRow('RES-LEGACY', 'P01; P02', '1ª aula; 2ª aula').slice(0, -1);

    const [reservation] = parseGoogleReservations(
      [[...legacyHeader], legacyRow],
      [[...GOOGLE_CANCELLATIONS_HEADER]],
    );

    expect(reservation).toMatchObject({
      id: 'RES-LEGACY',
      periodIds: ['P01', 'P02'],
      periodLabels: ['1ª aula', '2ª aula'],
      periodTimes: [],
      activePeriodIds: ['P01', 'P02'],
      cancelledPeriodIds: [],
      status: 'CONFIRMED',
      cancellations: [],
    });
  });

  it('deriva estados parcial e total exclusivamente do histórico de CANCELAMENTOS', () => {
    const reservations = [
      [...GOOGLE_RESERVATIONS_HEADER],
      reservationRow('RES-PARTIAL'),
      reservationRow('RES-TOTAL'),
    ];
    const cancellations = [
      [...GOOGLE_CANCELLATIONS_HEADER],
      cancellationRow('C-1', 'RES-PARTIAL', 'P02', '2ª aula', '08:15–09:00'),
      cancellationRow('C-2', 'RES-TOTAL', 'P01', '1ª aula', '07:30–08:15'),
      cancellationRow('C-3', 'RES-TOTAL', 'P02', '2ª aula', '08:15–09:00'),
    ];

    const result = parseGoogleReservations(reservations, cancellations);

    expect(result[0]).toMatchObject({
      status: 'PARTIALLY_CANCELLED',
      activePeriodIds: ['P01'],
      cancelledPeriodIds: ['P02'],
    });
    expect(result[1]).toMatchObject({
      status: 'CANCELLED',
      activePeriodIds: [],
      cancelledPeriodIds: ['P01', 'P02'],
    });
  });

  it('acrescenta somente o novo cabeçalho e cria CANCELAMENTOS sem regravar RESERVAS', async () => {
    let structuralUpdate: unknown;
    let valuesUpdate: unknown;
    const legacyHeader = GOOGLE_RESERVATIONS_HEADER.slice(0, -1);
    const fetchImplementation = createFetchMock((url, init) => {
      if (url.includes('?fields=sheets.properties')) {
        return jsonResponse({
          sheets: [{ properties: { title: GOOGLE_RESERVATIONS_SHEET_TITLE } }],
        });
      }
      if (url.endsWith('/values:batchUpdate')) {
        valuesUpdate = parseRequestBody(init?.body);
        return jsonResponse({});
      }
      if (url.endsWith(':batchUpdate')) {
        structuralUpdate = parseRequestBody(init?.body);
        return jsonResponse({});
      }
      if (url.includes('/values:batchGet?')) {
        return jsonResponse({
          valueRanges: [{ values: [[...legacyHeader]] }, {}],
        });
      }
      throw new Error(`Requisição inesperada: ${url}`);
    });

    const result = await ensureGoogleReservationsSchema({
      accessToken: 'access-token',
      spreadsheetId: 'sheet-1',
      fetchImplementation,
    });

    expect(result.createdSheetTitles).toEqual([GOOGLE_CANCELLATIONS_SHEET_TITLE]);
    expect(structuralUpdate).toEqual({
      requests: [{ addSheet: { properties: { title: GOOGLE_CANCELLATIONS_SHEET_TITLE } } }],
    });
    const data = (valuesUpdate as { data: { range: string; values: unknown[][] }[] }).data;
    expect(data).toEqual([
      {
        range: "'RESERVAS'!N1",
        majorDimension: 'ROWS',
        values: [['AULAS_HORARIOS']],
      },
      {
        range: "'CANCELAMENTOS'!A1",
        majorDimension: 'ROWS',
        values: [[...GOOGLE_CANCELLATIONS_HEADER]],
      },
    ]);
    expect(
      data.some(
        (item) =>
          item.range.includes(GOOGLE_RESERVATIONS_SHEET_TITLE) && item.range !== "'RESERVAS'!N1",
      ),
    ).toBe(false);
  });

  it('cancela parcialmente por append e mantém as demais aulas ativas', async () => {
    let appendBody: unknown;
    const fetchImplementation = createOperationalFetch(
      [[...GOOGLE_RESERVATIONS_HEADER], reservationRow('RES-1')],
      [[...GOOGLE_CANCELLATIONS_HEADER]],
      (body) => {
        appendBody = body;
      },
    );

    const result = await cancelGoogleReservationPeriods(
      {
        reservationId: 'RES-1',
        periodIds: ['P02'],
        cancelledBy: 'laboratorista@escola.test',
        reason: 'Professor escolheu a aula errada',
        cancelledAt: '2026-08-02T11:00:00.000Z',
      },
      {
        accessToken: 'access-token',
        spreadsheetId: 'sheet-1',
        fetchImplementation,
        createCancellationId: () => 'CANCEL-1',
      },
    );

    expect(appendBody).toEqual({
      majorDimension: 'ROWS',
      values: [
        [
          'CANCEL-1',
          'RES-1',
          'P02',
          '2ª aula',
          '08:15–09:00',
          '2026-08-10',
          'LAB01',
          '2026-08-02T11:00:00.000Z',
          'laboratorista@escola.test',
          'Professor escolheu a aula errada',
        ],
      ],
    });
    expect(result.reservation).toMatchObject({
      status: 'PARTIALLY_CANCELLED',
      activePeriodIds: ['P01'],
      cancelledPeriodIds: ['P02'],
    });
    expect(result.appendedCancellations).toHaveLength(1);
  });

  it('transforma o cancelamento parcial em total sem duplicar a aula já cancelada', async () => {
    let appendBody: unknown;
    const fetchImplementation = createOperationalFetch(
      [[...GOOGLE_RESERVATIONS_HEADER], reservationRow('RES-2')],
      [
        [...GOOGLE_CANCELLATIONS_HEADER],
        cancellationRow('CANCEL-OLD', 'RES-2', 'P01', '1ª aula', '07:30–08:15'),
      ],
      (body) => {
        appendBody = body;
      },
    );

    const result = await cancelGoogleReservationPeriods(
      {
        reservationId: 'RES-2',
        periodIds: ['P01', 'P02'],
        cancelledBy: 'laboratorista@escola.test',
        cancelledAt: '2026-08-02T12:00:00.000Z',
      },
      {
        accessToken: 'access-token',
        spreadsheetId: 'sheet-1',
        fetchImplementation,
        createCancellationId: () => 'CANCEL-NEW',
      },
    );

    const values = (appendBody as { values: unknown[][] }).values;
    expect(values).toHaveLength(1);
    expect(values[0]?.[2]).toBe('P02');
    expect(result.reservation).toMatchObject({
      status: 'CANCELLED',
      activePeriodIds: [],
      cancelledPeriodIds: ['P01', 'P02'],
    });
    expect(result.reservation.cancellations).toHaveLength(2);
  });
});
