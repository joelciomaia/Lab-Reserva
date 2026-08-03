import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpreadsheetBindingFingerprint } from './spreadsheetBinding';

const driveMocks = vi.hoisted(() => ({
  ensureSpreadsheetWriterAccess: vi.fn(),
}));

vi.mock('../integrations/google/googleDrive', () => ({
  ensureSpreadsheetWriterAccess: driveMocks.ensureSpreadsheetWriterAccess,
}));

import { ensureGoogleChatBackendReady, provisionSchoolWorkspace } from './schoolProvisioning';

const endpoint = 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') {
    return new URL(input);
  }
  return new URL(input instanceof URL ? input.href : input.url);
}

function requestBody(body: BodyInit | null | undefined): string {
  if (typeof body !== 'string') {
    throw new TypeError('O teste esperava um corpo JSON textual.');
  }
  return body;
}

describe('provisionSchoolWorkspace', () => {
  beforeEach(() => {
    driveMocks.ensureSpreadsheetWriterAccess.mockReset().mockResolvedValue({
      permissionId: 'permission-backend',
      created: true,
      role: 'writer',
    });
  });

  it('compartilha a planilha e registra a escola antes de liberar o acesso público', async () => {
    const spreadsheetId = 'sheet-school-1';
    const fingerprint = await createSpreadsheetBindingFingerprint(spreadsheetId);
    const fetchImplementation = vi.fn<typeof window.fetch>((input, init) => {
      const url = requestUrl(input);
      if (url.searchParams.get('action') === 'serviceInfo') {
        return Promise.resolve(
          jsonResponse({
            ok: true,
            data: { backendAccountEmail: 'backend@agenda.edu.br' },
          }),
        );
      }
      expect(init?.method).toBe('POST');
      return Promise.resolve(
        jsonResponse({
          ok: true,
          data: {
            schoolId: 'school-1',
            sourceSpreadsheetFingerprint: fingerprint,
          },
        }),
      );
    });

    await expect(
      provisionSchoolWorkspace(
        {
          accessToken: 'google-access-token',
          spreadsheetId,
          schoolId: 'school-1',
          revision: 'configuration-1',
        },
        {
          appsScriptUrl: endpoint,
          expectedBackendAccountEmail: 'backend@agenda.edu.br',
          fetchImplementation,
        },
      ),
    ).resolves.toEqual({ schoolId: 'school-1', spreadsheetId });

    expect(driveMocks.ensureSpreadsheetWriterAccess).toHaveBeenCalledWith(
      spreadsheetId,
      'backend@agenda.edu.br',
      expect.objectContaining({ accessToken: 'google-access-token' }),
    );
    const registrationCall = fetchImplementation.mock.calls.find(([, init]) =>
      typeof init?.body === 'string' ? init.body.includes('registerSchool') : false,
    );
    expect(JSON.parse(requestBody(registrationCall?.[1]?.body))).toEqual({
      action: 'registerSchool',
      request: {
        spreadsheetId,
        schoolId: 'school-1',
        revision: 'configuration-1',
      },
    });
  });

  it('não libera a escola quando o backend confirma outra planilha', async () => {
    const wrongFingerprint = await createSpreadsheetBindingFingerprint('other-sheet');
    const fetchImplementation = vi.fn<typeof window.fetch>((input) => {
      const url = requestUrl(input);
      return Promise.resolve(
        url.searchParams.get('action') === 'serviceInfo'
          ? jsonResponse({
              ok: true,
              data: { backendAccountEmail: 'backend@agenda.edu.br' },
            })
          : jsonResponse({
              ok: true,
              data: {
                schoolId: 'school-1',
                sourceSpreadsheetFingerprint: wrongFingerprint,
              },
            }),
      );
    });

    await expect(
      provisionSchoolWorkspace(
        {
          accessToken: 'google-access-token',
          spreadsheetId: 'sheet-school-1',
          schoolId: 'school-1',
          revision: 'configuration-1',
        },
        {
          appsScriptUrl: endpoint,
          expectedBackendAccountEmail: 'backend@agenda.edu.br',
          fetchImplementation,
        },
      ),
    ).rejects.toThrow(/não confirmou o vínculo/i);
  });

  it('não compartilha a planilha quando o Web App pertence a outra conta', async () => {
    const fetchImplementation = vi.fn<typeof window.fetch>(() =>
      Promise.resolve(
        jsonResponse({
          ok: true,
          data: { backendAccountEmail: 'outra-conta@agenda.edu.br' },
        }),
      ),
    );

    await expect(
      provisionSchoolWorkspace(
        {
          accessToken: 'google-access-token',
          spreadsheetId: 'sheet-school-1',
          schoolId: 'school-1',
          revision: 'configuration-1',
        },
        {
          appsScriptUrl: endpoint,
          expectedBackendAccountEmail: 'backend@agenda.edu.br',
          fetchImplementation,
        },
      ),
    ).rejects.toThrow(/não corresponde à conta central/i);
    expect(driveMocks.ensureSpreadsheetWriterAccess).not.toHaveBeenCalled();
  });

  it('falha claramente quando o serviço central ainda não foi configurado', async () => {
    await expect(
      provisionSchoolWorkspace({
        accessToken: 'google-access-token',
        spreadsheetId: 'sheet-school-1',
        schoolId: 'school-1',
        revision: 'configuration-1',
      }),
    ).rejects.toThrow(/acesso público.*não foi configurado/i);
    expect(driveMocks.ensureSpreadsheetWriterAccess).not.toHaveBeenCalled();
  });
});

describe('ensureGoogleChatBackendReady', () => {
  it('confirma a implantação somente quando o backend correto possui o Chat configurado', async () => {
    const fetchImplementation = vi.fn<typeof window.fetch>(() =>
      Promise.resolve(
        jsonResponse({
          ok: true,
          data: {
            backendAccountEmail: 'backend@agenda.edu.br',
            googleChatConfigured: true,
          },
        }),
      ),
    );

    await expect(
      ensureGoogleChatBackendReady({
        appsScriptUrl: endpoint,
        expectedBackendAccountEmail: 'backend@agenda.edu.br',
        fetchImplementation,
      }),
    ).resolves.toBeUndefined();
  });

  it('impede a conexão quando a credencial do app do Chat ainda não foi instalada', async () => {
    const fetchImplementation = vi.fn<typeof window.fetch>(() =>
      Promise.resolve(
        jsonResponse({
          ok: true,
          data: {
            backendAccountEmail: 'backend@agenda.edu.br',
            googleChatConfigured: false,
          },
        }),
      ),
    );

    await expect(
      ensureGoogleChatBackendReady({
        appsScriptUrl: endpoint,
        expectedBackendAccountEmail: 'backend@agenda.edu.br',
        fetchImplementation,
      }),
    ).rejects.toThrow(/Google Chat ainda não foi ativado/i);
  });
});
