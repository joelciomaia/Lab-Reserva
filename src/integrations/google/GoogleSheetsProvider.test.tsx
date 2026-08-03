import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminConfiguration } from '../../types';
import {
  GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY,
  GOOGLE_SPREADSHEET_STORAGE_KEY,
} from './googleStorage';

const googleMocks = vi.hoisted(() => ({
  getAccessibleSpreadsheet: vi.fn(),
  initializeEmptyGoogleSheetsWorkspace: vi.fn(),
  listLabReservaSpreadsheets: vi.fn(),
  tagLabReservaSpreadsheet: vi.fn(),
  loadGoogleIdentityServices: vi.fn(),
  readAdminConfigurationWithMetadataFromGoogleSheets: vi.fn(),
  requestGoogleChatAccessToken: vi.fn(),
  requestGoogleSheetsAccessToken: vi.fn(),
  setupPrivateGoogleChat: vi.fn(),
  ensureGoogleChatBackendReady: vi.fn(),
  provisionSchoolWorkspace: vi.fn(),
  syncAdminConfigurationToGoogleSheets: vi.fn(),
}));

vi.mock('./googleDrive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleDrive')>();
  return {
    ...actual,
    getAccessibleSpreadsheet: googleMocks.getAccessibleSpreadsheet,
    listLabReservaSpreadsheets: googleMocks.listLabReservaSpreadsheets,
    tagLabReservaSpreadsheet: googleMocks.tagLabReservaSpreadsheet,
  };
});

vi.mock('./googleIdentity', () => ({
  loadGoogleIdentityServices: googleMocks.loadGoogleIdentityServices,
  requestGoogleChatAccessToken: googleMocks.requestGoogleChatAccessToken,
  requestGoogleSheetsAccessToken: googleMocks.requestGoogleSheetsAccessToken,
}));

vi.mock('./googleChat', () => ({
  setupPrivateGoogleChat: googleMocks.setupPrivateGoogleChat,
}));

vi.mock('../../services/schoolProvisioning', () => ({
  ensureGoogleChatBackendReady: googleMocks.ensureGoogleChatBackendReady,
  provisionSchoolWorkspace: googleMocks.provisionSchoolWorkspace,
}));

vi.mock('./googleSheets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./googleSheets')>();
  return {
    ...actual,
    initializeEmptyGoogleSheetsWorkspace: googleMocks.initializeEmptyGoogleSheetsWorkspace,
    readAdminConfigurationWithMetadataFromGoogleSheets:
      googleMocks.readAdminConfigurationWithMetadataFromGoogleSheets,
    syncAdminConfigurationToGoogleSheets: googleMocks.syncAdminConfigurationToGoogleSheets,
  };
});

import { GoogleSheetsProvider, useGoogleSheets } from './GoogleSheetsProvider';

const configuration = {
  revision: 'configuration-1',
  school: { id: 'school-1', name: 'Escola' },
  laboratories: [{ id: 'lab-1', name: 'Laboratório de Informática', active: true }],
  shifts: [],
  subjects: [],
  classGroups: [],
  resources: [],
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
      googleChatSpaceName: 'spaces/AAAA-provider-test',
      sendSedLinkToChat: true,
    },
  ],
  sedSc: {
    enabled: true,
    formUrl: 'https://docs.google.com/forms/d/e/formulario-sed/viewform',
    regionalName: 'Coordenadoria Regional de Florianópolis',
    municipalityName: 'Florianópolis',
    officialSchoolName: 'EEM Escola',
    defaultArea: 'Tecnologias educacionais',
    defaultActivityType: 'Aula no laboratório',
  },
} satisfies AdminConfiguration;

function Probe() {
  const integration = useGoogleSheets();
  return (
    <>
      <output data-testid="status">{integration.status}</output>
      <output data-testid="authorized">{String(integration.isAuthorized)}</output>
      <output data-testid="spreadsheet">{integration.spreadsheetId ?? 'sem-planilha'}</output>
      <output data-testid="link">{integration.spreadsheetUrl ?? 'sem-link'}</output>
      <output data-testid="public-ready">{String(integration.publicSchoolReady)}</output>
      <output data-testid="public-error">{integration.publicSchoolError ?? 'sem-erro'}</output>
      <output data-testid="available">
        {integration.availableSpreadsheets.map((spreadsheet) => spreadsheet.id).join(',')}
      </output>
      <output data-testid="error">{integration.error ?? 'sem-erro'}</output>
      <button type="button" onClick={() => void integration.authorize()}>
        autorizar
      </button>
      <button
        type="button"
        onClick={() => void integration.connectPrivateGoogleChat().catch(() => undefined)}
      >
        conectar chat
      </button>
      <button
        type="button"
        onClick={() => void integration.syncConfiguration(configuration).catch(() => undefined)}
      >
        sincronizar
      </button>
      <button type="button" onClick={() => void integration.loadLinkedConfiguration()}>
        carregar configuração
      </button>
      <button type="button" onClick={() => integration.selectSpreadsheet('sheet-second')}>
        selecionar segunda
      </button>
      <button
        type="button"
        onClick={() => void integration.startNewSchool().catch(() => undefined)}
      >
        nova escola
      </button>
    </>
  );
}

describe('GoogleSheetsProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    googleMocks.getAccessibleSpreadsheet.mockReset().mockResolvedValue(null);
    googleMocks.initializeEmptyGoogleSheetsWorkspace.mockReset().mockResolvedValue({
      spreadsheetId: 'sheet-empty',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-empty/edit',
      created: true,
    });
    googleMocks.listLabReservaSpreadsheets.mockReset().mockResolvedValue([]);
    googleMocks.tagLabReservaSpreadsheet.mockReset().mockResolvedValue({
      id: 'sheet-existing',
      name: 'Lab Reserva - Escola',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
      appProperties: { type: 'lab-reserva-config', version: '1' },
    });
    googleMocks.loadGoogleIdentityServices.mockReset().mockResolvedValue(undefined);
    googleMocks.readAdminConfigurationWithMetadataFromGoogleSheets.mockReset().mockResolvedValue({
      configuration,
      migrationRequired: false,
    });
    googleMocks.requestGoogleSheetsAccessToken.mockReset().mockResolvedValue({
      accessToken: 'token-somente-memoria',
      expiresInSeconds: 3600,
      grantedScope: 'https://www.googleapis.com/auth/drive.file',
    });
    googleMocks.requestGoogleChatAccessToken.mockReset().mockResolvedValue({
      accessToken: 'token-chat-e-drive',
      expiresInSeconds: 3600,
      grantedScope:
        'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/chat.spaces.create',
    });
    googleMocks.setupPrivateGoogleChat.mockReset().mockResolvedValue({
      name: 'spaces/AAAA-private-chat',
    });
    googleMocks.ensureGoogleChatBackendReady.mockReset().mockResolvedValue(undefined);
    googleMocks.provisionSchoolWorkspace.mockReset().mockResolvedValue({
      schoolId: configuration.school.id,
      spreadsheetId: 'sheet-created',
    });
    googleMocks.syncAdminConfigurationToGoogleSheets.mockReset().mockResolvedValue({
      spreadsheetId: 'sheet-created',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-created/edit',
      created: true,
      verified: true,
    });
  });

  it('recupera somente o vínculo temporário, sem considerar isso uma autorização', () => {
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );

    expect(screen.getByTestId('authorized')).toHaveTextContent('false');
    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-existing');
    expect(screen.getByTestId('link')).toHaveTextContent(
      'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
    );
  });

  it('cria a planilha vazia ao entrar, mantém o token em memória e o usa na sincronização', async () => {
    const user = userEvent.setup();
    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    expect(screen.getByTestId('authorized')).toHaveTextContent('true');
    expect(screen.getByTestId('status')).toHaveTextContent('authorized');
    expect(googleMocks.initializeEmptyGoogleSheetsWorkspace).toHaveBeenCalledWith({
      accessToken: 'token-somente-memoria',
      previousSpreadsheetId: null,
    });
    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-empty');
    expect(
      Object.values(window.localStorage).some((value) =>
        String(value).includes('token-somente-memoria'),
      ),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'sincronizar' }));
    expect(googleMocks.syncAdminConfigurationToGoogleSheets).toHaveBeenCalledWith(configuration, {
      accessToken: 'token-somente-memoria',
      spreadsheetId: 'sheet-empty',
    });
    expect(googleMocks.provisionSchoolWorkspace).toHaveBeenCalledWith({
      accessToken: 'token-somente-memoria',
      spreadsheetId: 'sheet-created',
      schoolId: 'school-1',
      revision: 'configuration-1',
    });
    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-created');
    expect(screen.getByTestId('public-ready')).toHaveTextContent('true');
  });

  it('expira a autorização em memória no prazo informado pelo Google', async () => {
    const user = userEvent.setup();
    googleMocks.requestGoogleSheetsAccessToken.mockResolvedValue({
      accessToken: 'token-curto',
      expiresInSeconds: 0.2,
      grantedScope: 'https://www.googleapis.com/auth/drive.file',
    });
    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    expect(screen.getByTestId('authorized')).toHaveTextContent('true');

    await waitFor(() => {
      expect(screen.getByTestId('authorized')).toHaveTextContent('false');
    });
    expect(screen.getByTestId('status')).toHaveTextContent('idle');
  });

  it('valida e marca o vínculo local para a conta autorizada', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    googleMocks.getAccessibleSpreadsheet.mockResolvedValue({
      id: 'sheet-existing',
      name: 'Lab Reserva - Escola',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
      appProperties: {},
    });

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));

    expect(googleMocks.getAccessibleSpreadsheet).toHaveBeenCalledWith('sheet-existing', {
      accessToken: 'token-somente-memoria',
    });
    expect(googleMocks.tagLabReservaSpreadsheet).toHaveBeenCalledWith('sheet-existing', {
      accessToken: 'token-somente-memoria',
    });
    expect(googleMocks.listLabReservaSpreadsheets).not.toHaveBeenCalled();
    expect(screen.getByTestId('authorized')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'carregar configuração' }));
    expect(googleMocks.readAdminConfigurationWithMetadataFromGoogleSheets).toHaveBeenCalledWith(
      'token-somente-memoria',
      'sheet-existing',
    );
    expect(googleMocks.provisionSchoolWorkspace).toHaveBeenCalledWith({
      accessToken: 'token-somente-memoria',
      spreadsheetId: 'sheet-existing',
      schoolId: 'school-1',
      revision: 'configuration-1',
    });
    expect(screen.getByTestId('public-ready')).toHaveTextContent('true');
  });

  it('cria a conversa privada somente com a mesma conta vinculada à planilha', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    googleMocks.getAccessibleSpreadsheet.mockResolvedValue({
      id: 'sheet-existing',
      name: 'Lab Reserva - Escola',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
      appProperties: { type: 'lab-reserva-config', version: '1' },
    });

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    await user.click(screen.getByRole('button', { name: 'conectar chat' }));

    await waitFor(() => {
      expect(googleMocks.setupPrivateGoogleChat).toHaveBeenCalledWith({
        accessToken: 'token-chat-e-drive',
      });
    });
    expect(googleMocks.ensureGoogleChatBackendReady).toHaveBeenCalledTimes(1);
    expect(googleMocks.getAccessibleSpreadsheet).toHaveBeenLastCalledWith('sheet-existing', {
      accessToken: 'token-chat-e-drive',
    });
    expect(screen.getByTestId('authorized')).toHaveTextContent('true');
    expect(screen.getByTestId('status')).toHaveTextContent('authorized');
  });

  it('preserva a sessão do Sheets quando outra conta é escolhida ao conectar o Chat', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    googleMocks.getAccessibleSpreadsheet
      .mockResolvedValueOnce({
        id: 'sheet-existing',
        name: 'Lab Reserva - Escola',
        modifiedTime: '2026-07-26T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
        appProperties: { type: 'lab-reserva-config', version: '1' },
      })
      .mockResolvedValueOnce(null);

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    await user.click(screen.getByRole('button', { name: 'conectar chat' }));

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent(/mesma Conta do Google/i);
    });
    expect(googleMocks.setupPrivateGoogleChat).not.toHaveBeenCalled();
    expect(screen.getByTestId('authorized')).toHaveTextContent('true');
    expect(screen.getByTestId('status')).toHaveTextContent('authorized');

    await user.click(screen.getByRole('button', { name: 'sincronizar' }));
    expect(googleMocks.syncAdminConfigurationToGoogleSheets).toHaveBeenLastCalledWith(
      configuration,
      {
        accessToken: 'token-somente-memoria',
        spreadsheetId: 'sheet-existing',
      },
    );
  });

  it('mantém o painel disponível quando somente a publicação falha ao carregar', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    googleMocks.getAccessibleSpreadsheet.mockResolvedValue({
      id: 'sheet-existing',
      name: 'Lab Reserva - Escola',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
      appProperties: { type: 'lab-reserva-config', version: '1' },
    });
    googleMocks.provisionSchoolWorkspace.mockRejectedValue(
      new Error('Serviço público temporariamente indisponível.'),
    );

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    await user.click(screen.getByRole('button', { name: 'carregar configuração' }));

    expect(screen.getByTestId('status')).toHaveTextContent('authorized');
    expect(screen.getByTestId('public-ready')).toHaveTextContent('false');
    expect(screen.getByTestId('public-error')).toHaveTextContent(
      'Serviço público temporariamente indisponível.',
    );
    expect(screen.getByTestId('error')).toHaveTextContent('sem-erro');
  });

  it('mantém a planilha sincronizada disponível quando somente a publicação falha', async () => {
    const user = userEvent.setup();
    googleMocks.provisionSchoolWorkspace.mockRejectedValue(
      new Error('Não foi possível registrar a escola.'),
    );

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    await user.click(screen.getByRole('button', { name: 'sincronizar' }));

    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-created');
    expect(screen.getByTestId('public-ready')).toHaveTextContent('false');
    expect(screen.getByTestId('public-error')).toHaveTextContent(
      'Não foi possível registrar a escola.',
    );
  });

  it('migra automaticamente uma planilha antiga ao carregá-la', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    googleMocks.getAccessibleSpreadsheet.mockResolvedValue({
      id: 'sheet-existing',
      name: 'Lab Reserva - Escola',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
      appProperties: {},
    });
    googleMocks.readAdminConfigurationWithMetadataFromGoogleSheets.mockResolvedValue({
      configuration,
      migrationRequired: true,
    });
    googleMocks.syncAdminConfigurationToGoogleSheets.mockResolvedValue({
      spreadsheetId: 'sheet-existing',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-existing/edit',
      created: false,
      verified: true,
    });

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));
    await user.click(screen.getByRole('button', { name: 'carregar configuração' }));

    expect(googleMocks.syncAdminConfigurationToGoogleSheets).toHaveBeenCalledWith(configuration, {
      accessToken: 'token-somente-memoria',
      spreadsheetId: 'sheet-existing',
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authorized');
  });

  it('reencontra automaticamente a única planilha da conta quando o vínculo local não existe', async () => {
    const user = userEvent.setup();
    googleMocks.listLabReservaSpreadsheets.mockResolvedValue([
      {
        id: 'sheet-recovered',
        name: 'Lab Reserva - Escola Recuperada',
        modifiedTime: '2026-07-26T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-recovered/edit',
        appProperties: { type: 'lab-reserva-config', version: '1' },
      },
    ]);

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));

    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-recovered');
    expect(window.localStorage.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)).toBe('sheet-recovered');
  });

  it('troca o vínculo antigo pela planilha acessível da conta escolhida', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-other-account');
    window.localStorage.setItem(
      GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY,
      JSON.stringify(['sheet-other-account', 'sheet-current-account']),
    );
    googleMocks.getAccessibleSpreadsheet.mockImplementation((spreadsheetId: string) =>
      Promise.resolve(
        spreadsheetId === 'sheet-current-account'
          ? {
              id: 'sheet-current-account',
              name: 'Lab Reserva - Escola da conta atual',
              modifiedTime: '2026-07-26T10:00:00.000Z',
              webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-current-account/edit',
              appProperties: {},
            }
          : null,
      ),
    );
    googleMocks.tagLabReservaSpreadsheet.mockResolvedValue({
      id: 'sheet-current-account',
      name: 'Lab Reserva - Escola da conta atual',
      modifiedTime: '2026-07-26T10:00:00.000Z',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-current-account/edit',
      appProperties: { type: 'lab-reserva-config', version: '1' },
    });

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));

    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-current-account');
    expect(window.localStorage.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)).toBe(
      'sheet-current-account',
    );
  });

  it('aguarda a escolha quando a conta possui mais de uma escola', async () => {
    const user = userEvent.setup();
    googleMocks.listLabReservaSpreadsheets.mockResolvedValue([
      {
        id: 'sheet-first',
        name: 'Lab Reserva - Escola A',
        modifiedTime: '2026-07-26T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-first/edit',
        appProperties: { type: 'lab-reserva-config', version: '1' },
      },
      {
        id: 'sheet-second',
        name: 'Lab Reserva - Escola B',
        modifiedTime: '2026-07-25T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-second/edit',
        appProperties: { type: 'lab-reserva-config', version: '1' },
      },
    ]);

    render(
      <GoogleSheetsProvider>
        <Probe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar' }));

    expect(screen.getByTestId('status')).toHaveTextContent('selecting-spreadsheet');
    expect(screen.getByTestId('authorized')).toHaveTextContent('false');
    expect(screen.getByTestId('available')).toHaveTextContent('sheet-first,sheet-second');

    await user.click(screen.getByRole('button', { name: 'selecionar segunda' }));
    expect(screen.getByTestId('authorized')).toHaveTextContent('true');
    expect(screen.getByTestId('spreadsheet')).toHaveTextContent('sheet-second');
  });

  it('preserva o vínculo atual se a autorização de uma nova escola for cancelada', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-existing');
    googleMocks.requestGoogleSheetsAccessToken.mockRejectedValue(
      new Error('Autorização cancelada.'),
    );

    function NewSchoolProbe() {
      const integration = useGoogleSheets();
      return (
        <button
          type="button"
          onClick={() =>
            void integration.authorize({ createNewSchool: true }).catch(() => undefined)
          }
        >
          autorizar nova escola
        </button>
      );
    }

    render(
      <GoogleSheetsProvider>
        <NewSchoolProbe />
      </GoogleSheetsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'autorizar nova escola' }));

    expect(window.localStorage.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)).toBe('sheet-existing');
  });
});
