import { describe, expect, it, vi } from 'vitest';
import {
  GoogleDriveIntegrationError,
  LAB_RESERVA_SPREADSHEET_APP_PROPERTIES,
  getAccessibleSpreadsheet,
  listLabReservaSpreadsheets,
  tagLabReservaSpreadsheet,
  type GoogleDriveFetch,
} from './googleDrive';
import { GOOGLE_DRIVE_FILE_SCOPE } from './googleIdentity';

const spreadsheetMimeType = 'application/vnd.google-apps.spreadsheet';

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

function createFetchMock(
  responder: (url: string, init?: RequestInit) => Response,
): GoogleDriveFetch {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(responder(requestUrl(input), init)),
  );
}

function spreadsheetPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: `Planilha ${id}`,
    mimeType: spreadsheetMimeType,
    modifiedTime: '2026-07-26T14:00:00.000Z',
    webViewLink: `https://docs.google.com/spreadsheets/d/${id}/edit`,
    appProperties: LAB_RESERVA_SPREADSHEET_APP_PROPERTIES,
    ...overrides,
  };
}

describe('integração de descoberta com Google Drive', () => {
  it('expõe somente o escopo drive.file e marca a planilha criada', async () => {
    const fetchImplementation = createFetchMock((url, init) => {
      const parsedUrl = new URL(url);
      expect(parsedUrl.pathname).toBe('/drive/v3/files/sheet-created');
      expect(parsedUrl.searchParams.get('supportsAllDrives')).toBe('true');
      expect(init?.method).toBe('PATCH');
      expect(init?.headers).toEqual(
        expect.objectContaining({ Authorization: 'Bearer access-token' }),
      );
      if (typeof init?.body !== 'string') {
        throw new Error('O teste esperava um corpo JSON em texto.');
      }
      expect(JSON.parse(init.body)).toEqual({
        appProperties: {
          type: 'lab-reserva-config',
          version: '1',
        },
      });
      return jsonResponse(spreadsheetPayload('sheet-created'));
    });

    const result = await tagLabReservaSpreadsheet('sheet-created', {
      accessToken: 'access-token',
      fetchImplementation,
    });

    expect(GOOGLE_DRIVE_FILE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    expect(result).toEqual({
      id: 'sheet-created',
      name: 'Planilha sheet-created',
      modifiedTime: '2026-07-26T14:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-created/edit',
      appProperties: {
        type: 'lab-reserva-config',
        version: '1',
      },
    });
  });

  it('confere se um spreadsheetId local continua acessível', async () => {
    const fetchImplementation = createFetchMock((url, init) => {
      expect(url).toContain('/drive/v3/files/sheet-local?');
      expect(init?.method).toBeUndefined();
      return jsonResponse(spreadsheetPayload('sheet-local'));
    });

    await expect(
      getAccessibleSpreadsheet('sheet-local', {
        accessToken: 'access-token',
        fetchImplementation,
      }),
    ).resolves.toEqual(expect.objectContaining({ id: 'sheet-local' }));
  });

  it('trata 404 como um vínculo local inacessível', async () => {
    const fetchImplementation = createFetchMock(() =>
      jsonResponse(
        {
          error: {
            code: 404,
            message: 'File not found.',
          },
        },
        404,
      ),
    );

    await expect(
      getAccessibleSpreadsheet('sheet-from-another-account', {
        accessToken: 'access-token',
        fetchImplementation,
      }),
    ).resolves.toBeNull();
  });

  it('lista todas as páginas com as tags do app e ordena por modifiedTime decrescente', async () => {
    const requestedUrls: URL[] = [];
    const fetchImplementation = createFetchMock((url) => {
      const parsedUrl = new URL(url);
      requestedUrls.push(parsedUrl);

      if (!parsedUrl.searchParams.has('pageToken')) {
        return jsonResponse({
          nextPageToken: 'page-2',
          files: [
            spreadsheetPayload('older', {
              modifiedTime: '2026-07-20T10:00:00.000Z',
            }),
            spreadsheetPayload('ignored-version', {
              appProperties: { type: 'lab-reserva-config', version: '2' },
            }),
          ],
        });
      }
      expect(parsedUrl.searchParams.get('pageToken')).toBe('page-2');
      return jsonResponse({
        files: [
          spreadsheetPayload('newer', {
            modifiedTime: '2026-07-26T10:00:00.000Z',
          }),
        ],
      });
    });

    const result = await listLabReservaSpreadsheets({
      accessToken: 'access-token',
      fetchImplementation,
    });

    expect(result.map((spreadsheet) => spreadsheet.id)).toEqual(['newer', 'older']);
    expect(requestedUrls).toHaveLength(2);
    const firstRequest = requestedUrls[0];
    expect(firstRequest?.searchParams.get('orderBy')).toBe('modifiedTime desc');
    expect(firstRequest?.searchParams.get('q')).toContain(
      "appProperties has { key='type' and value='lab-reserva-config' }",
    );
    expect(firstRequest?.searchParams.get('q')).toContain(
      "appProperties has { key='version' and value='1' }",
    );
    expect(firstRequest?.searchParams.get('q')).toContain(`mimeType = '${spreadsheetMimeType}'`);
  });

  it('retorna erro tipado sem incluir o access token em falhas da API', async () => {
    const secretAccessToken = 'secret-token-that-must-not-leak';
    const fetchImplementation = createFetchMock(() =>
      jsonResponse(
        {
          error: {
            code: 500,
            message: `Internal error for ${secretAccessToken}`,
          },
        },
        500,
      ),
    );

    try {
      await listLabReservaSpreadsheets({
        accessToken: secretAccessToken,
        fetchImplementation,
      });
      expect.fail('A falha do Google Drive deveria rejeitar a operação.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(GoogleDriveIntegrationError);
      if (!(error instanceof GoogleDriveIntegrationError)) {
        throw error;
      }
      expect(error.code).toBe('DRIVE_API_ERROR');
      expect(error.status).toBe(500);
      expect(error.message).not.toContain(secretAccessToken);
    }
  });

  it('não trata API desabilitada como expiração da conta', async () => {
    const fetchImplementation = createFetchMock(() => jsonResponse({}, 403));

    await expect(
      listLabReservaSpreadsheets({
        accessToken: 'access-token',
        fetchImplementation,
      }),
    ).rejects.toMatchObject({
      code: 'DRIVE_API_ERROR',
      status: 403,
    });
  });
});
