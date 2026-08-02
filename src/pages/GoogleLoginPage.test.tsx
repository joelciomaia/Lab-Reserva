import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleLoginPage } from './GoogleLoginPage';

const googleSheetsState = vi.hoisted(
  (): {
    authorize: ReturnType<typeof vi.fn>;
    isAuthorized: boolean;
    status: string;
    error: unknown;
    spreadsheetId: string | null;
    availableSpreadsheets: {
      id: string;
      name: string;
      modifiedTime: string;
      webViewLink: string;
      appProperties: Record<string, string>;
    }[];
    selectSpreadsheet: ReturnType<typeof vi.fn>;
    startNewSchool: ReturnType<typeof vi.fn>;
  } => ({
    authorize: vi.fn(),
    isAuthorized: false,
    status: 'idle',
    error: null,
    spreadsheetId: null,
    availableSpreadsheets: [],
    selectSpreadsheet: vi.fn(),
    startNewSchool: vi.fn(),
  }),
);

vi.mock('../integrations/google/GoogleSheetsProvider', () => ({
  useGoogleSheets: () => googleSheetsState,
}));

function renderLogin(
  initialEntry:
    | string
    | {
        pathname: string;
        state?: unknown;
      } = '/gerenciar/entrar',
) {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <Routes>
        <Route path="/gerenciar/entrar" element={<GoogleLoginPage />} />
        <Route path="/gerenciar/geral" element={<h1>Painel geral</h1>} />
        <Route path="/gerenciar/horarios" element={<h1>Configuração de horários</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('login Google do gerenciador', () => {
  beforeEach(() => {
    googleSheetsState.authorize.mockReset();
    googleSheetsState.isAuthorized = false;
    googleSheetsState.status = 'idle';
    googleSheetsState.error = null;
    googleSheetsState.spreadsheetId = null;
    googleSheetsState.availableSpreadsheets = [];
    googleSheetsState.selectSpreadsheet.mockReset();
    googleSheetsState.startNewSchool.mockReset();
  });

  it('solicita a autorização ao clicar em Entrar com Google', async () => {
    const user = userEvent.setup();

    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(googleSheetsState.authorize).toHaveBeenCalledTimes(1);
  });

  it('informa que a autorização está em andamento', () => {
    googleSheetsState.status = 'authorizing';

    renderLogin();

    expect(screen.getByRole('button', { name: 'Conectando ao Google…' })).toBeDisabled();
  });

  it('mantém o botão indisponível enquanto carrega o Google Identity Services', () => {
    googleSheetsState.status = 'loading-script';

    renderLogin();

    expect(screen.getByRole('button', { name: 'Conectando ao Google…' })).toBeDisabled();
  });

  it('mantém o botão indisponível enquanto procura uma planilha da conta', () => {
    googleSheetsState.status = 'discovering';

    renderLogin();

    expect(screen.getByRole('button', { name: 'Conectando ao Google…' })).toBeDisabled();
  });

  it('mostra o erro informado pela integração', () => {
    googleSheetsState.error = new Error('A autorização foi cancelada.');

    renderLogin();

    expect(screen.getByRole('alert')).toHaveTextContent('A autorização foi cancelada.');
  });

  it('volta para a seção solicitada depois da autorização', async () => {
    googleSheetsState.isAuthorized = true;

    renderLogin({
      pathname: '/gerenciar/entrar',
      state: {
        from: {
          pathname: '/gerenciar/horarios',
          search: '?origem=menu',
        },
      },
    });

    expect(
      await screen.findByRole('heading', { name: 'Configuração de horários' }),
    ).toBeInTheDocument();
  });

  it('abre a seção geral quando não existe um destino anterior', async () => {
    googleSheetsState.isAuthorized = true;

    renderLogin();

    expect(await screen.findByRole('heading', { name: 'Painel geral' })).toBeInTheDocument();
  });

  it('mostra uma falha inesperada devolvida pela autorização', async () => {
    const user = userEvent.setup();
    googleSheetsState.authorize.mockRejectedValue(new Error('Falha temporária.'));

    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Entrar com Google' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Falha temporária.');
  });

  it('permite escolher entre escolas já configuradas na conta', async () => {
    const user = userEvent.setup();
    googleSheetsState.status = 'selecting-spreadsheet';
    googleSheetsState.availableSpreadsheets = [
      {
        id: 'sheet-escola-a',
        name: 'Lab Reserva - Escola A',
        modifiedTime: '2026-07-26T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-escola-a/edit',
        appProperties: { type: 'lab-reserva-config', version: '1' },
      },
      {
        id: 'sheet-escola-b',
        name: 'Lab Reserva - Escola B',
        modifiedTime: '2026-07-25T10:00:00.000Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet-escola-b/edit',
        appProperties: { type: 'lab-reserva-config', version: '1' },
      },
    ];

    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Lab Reserva - Escola B' }));

    expect(googleSheetsState.selectSpreadsheet).toHaveBeenCalledWith('sheet-escola-b');
  });

  it('inicia uma nova escola sem apagar o vínculo antes da autorização', async () => {
    const user = userEvent.setup();
    googleSheetsState.spreadsheetId = 'sheet-existente';

    renderLogin();
    await user.click(screen.getByRole('button', { name: 'Configurar uma nova escola' }));

    expect(googleSheetsState.authorize).toHaveBeenCalledWith({ createNewSchool: true });
  });
});
