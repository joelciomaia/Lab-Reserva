import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import type { GoogleSheetsSyncResult } from '../integrations/google/googleSheets';
import { MockBackend } from '../services/mockBackend';
import type {
  AdminConfiguration,
  BackendClient,
  CancelReservationPeriodsRequest,
  ManagedReservation,
} from '../types';

interface GoogleSheetsTestState {
  authorize: ReturnType<typeof vi.fn<() => Promise<void>>>;
  isAuthorized: boolean;
  status: string;
  loadLinkedConfiguration: ReturnType<typeof vi.fn<() => Promise<AdminConfiguration | null>>>;
  listReservations: ReturnType<typeof vi.fn<() => Promise<ManagedReservation[]>>>;
  cancelReservationPeriods: ReturnType<
    typeof vi.fn<(request: CancelReservationPeriodsRequest) => Promise<ManagedReservation>>
  >;
  syncConfiguration: ReturnType<
    typeof vi.fn<(configuration: AdminConfiguration) => Promise<GoogleSheetsSyncResult>>
  >;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  publicSchoolReady: boolean;
  publicSchoolError: string | null;
  error: string | null;
}

const googleSheetsState = vi.hoisted((): GoogleSheetsTestState => ({
  authorize: vi.fn<() => Promise<void>>(),
  isAuthorized: true,
  status: 'authorized',
  loadLinkedConfiguration: vi.fn<() => Promise<AdminConfiguration | null>>(),
  listReservations: vi.fn<() => Promise<ManagedReservation[]>>(),
  cancelReservationPeriods:
    vi.fn<(request: CancelReservationPeriodsRequest) => Promise<ManagedReservation>>(),
  syncConfiguration:
    vi.fn<(configuration: AdminConfiguration) => Promise<GoogleSheetsSyncResult>>(),
  spreadsheetId: 'planilha-existente',
  spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/planilha-existente/edit',
  publicSchoolReady: true,
  publicSchoolError: null,
  error: null,
}));

vi.mock('../integrations/google/GoogleSheetsProvider', () => ({
  GoogleSheetsProvider: ({ children }: PropsWithChildren) => children,
  useGoogleSheets: () => googleSheetsState,
}));

function renderApp(route: string, client: BackendClient) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App client={client} />
    </MemoryRouter>,
  );
}

async function createConfiguredMockBackend(): Promise<MockBackend> {
  const seed = new MockBackend({ latencyMs: 0 });
  const configuration = await seed.getAdminConfiguration();
  configuration.laboratorySettings = configuration.laboratorySettings.map((settings, index) => ({
    ...settings,
    responsibleName: `Responsável ${index + 1}`,
    responsibleEmail: `responsavel${index + 1}@escola.gov.br`,
  }));
  return new MockBackend({ latencyMs: 0, configuration });
}

describe('painel do gerenciador', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    googleSheetsState.authorize.mockReset();
    googleSheetsState.isAuthorized = true;
    googleSheetsState.status = 'authorized';
    googleSheetsState.loadLinkedConfiguration.mockReset().mockResolvedValue(null);
    googleSheetsState.listReservations.mockReset().mockResolvedValue([]);
    googleSheetsState.cancelReservationPeriods.mockReset();
    googleSheetsState.syncConfiguration.mockReset();
    googleSheetsState.syncConfiguration.mockResolvedValue({
      spreadsheetId: 'planilha-existente',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/planilha-existente/edit',
      created: false,
      verified: true,
    });
    googleSheetsState.spreadsheetId = 'planilha-existente';
    googleSheetsState.spreadsheetUrl =
      'https://docs.google.com/spreadsheets/d/planilha-existente/edit';
    googleSheetsState.publicSchoolReady = true;
    googleSheetsState.publicSchoolError = null;
    googleSheetsState.error = null;
  });

  it('inicia uma escola real vazia a partir da planilha, sem catálogos default', async () => {
    const user = userEvent.setup();
    const mockBackend = new MockBackend({ latencyMs: 0 });
    const client: BackendClient = {
      getBootstrapData: (params) => mockBackend.getBootstrapData(params),
      getAvailability: (request) => mockBackend.getAvailability(request),
      createReservation: (request) => mockBackend.createReservation(request),
    };

    renderApp('/gerenciar/geral', client);

    expect(await screen.findByLabelText('Nome da escola')).toHaveValue('');
    expect(screen.queryByLabelText(/Nome do laboratório/)).not.toBeInTheDocument();
    expect(
      screen.getByText('A planilha já foi criada. Complete a configuração para publicar os dados.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Horários' }));
    expect(screen.queryByLabelText('Nome do turno')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Turmas' }));
    expect(screen.queryByLabelText('Nome da turma')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Disciplinas' }));
    expect(screen.queryByLabelText('Nome da disciplina')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Formulário' }));
    expect(screen.queryByLabelText('Nome do recurso')).not.toBeInTheDocument();
  });

  it('entra por /gerenciar, mostra o carregamento e abre a seção geral', async () => {
    const client = new MockBackend({ latencyMs: 100 });

    renderApp('/gerenciar', client);

    expect(await screen.findByText('Carregando configurações…')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Painel do gerenciador', level: 1 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Geral', level: 2 })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da escola')).toHaveValue('EEM Paulo Freire');
  });

  it('abre a guia protegida de agendamentos usando os dados do Sheets', async () => {
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/gerenciar/agendamentos', client);

    expect(
      await screen.findByRole('heading', { name: 'Agendamentos', level: 2 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(googleSheetsState.listReservations).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Nenhum agendamento registrado')).toBeInTheDocument();
  });

  it('configura os recursos e a exibição das observações na seção de formulário', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    const initialConfiguration = await client.getAdminConfiguration();
    const firstResource = initialConfiguration.resources[0]!;

    renderApp('/gerenciar/formulario', client);

    expect(
      await screen.findByRole('heading', { name: 'Formulário', level: 2 }),
    ).toBeInTheDocument();
    const observationsToggle = screen.getByRole('checkbox', {
      name: 'Exibir campo de observações',
    });
    expect(observationsToggle).not.toBeChecked();

    const firstResourceInput = screen.getByDisplayValue(firstResource.label);
    const firstResourceItem = firstResourceInput.closest('article');
    expect(firstResourceItem).not.toBeNull();
    await user.click(
      within(firstResourceItem!).getByRole('checkbox', {
        name: 'Disponível no formulário',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Adicionar recurso' }));
    const newResource = screen.getByDisplayValue(
      `Novo recurso ${initialConfiguration.resources.length + 1}`,
    );
    await user.clear(newResource);
    await user.type(newResource, 'Impressora 3D');
    await user.click(observationsToggle);
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();
    const savedConfiguration = await client.getAdminConfiguration();
    expect(savedConfiguration.bookingForm.showObservations).toBe(true);
    expect(savedConfiguration.resources.find(({ id }) => id === firstResource.id)?.active).toBe(
      false,
    );
    expect(savedConfiguration.resources.some(({ label }) => label === 'Impressora 3D')).toBe(true);

    const [syncedConfiguration] = googleSheetsState.syncConfiguration.mock.calls.at(-1) ?? [];
    expect(syncedConfiguration?.bookingForm.showObservations).toBe(true);
    expect(syncedConfiguration?.resources.some(({ label }) => label === 'Impressora 3D')).toBe(
      true,
    );
  });

  it('restaura a configuração da planilha ao entrar por outro navegador', async () => {
    const client = new MockBackend({ latencyMs: 0 });
    const remoteConfiguration = await client.getAdminConfiguration();
    googleSheetsState.loadLinkedConfiguration.mockResolvedValue({
      ...remoteConfiguration,
      school: { ...remoteConfiguration.school, name: 'Escola recuperada do Google' },
      classGroups: [
        {
          id: 'CLASS-REMOTE',
          label: 'Turma salva na planilha',
          gradeId: 'high-school-2',
          studentCount: 24,
          order: 1,
          active: true,
        },
      ],
    });

    renderApp('/gerenciar/turmas', client);

    expect(await screen.findByRole('heading', { name: 'Turmas', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Nome da turma')).toHaveLength(1);
    expect(screen.getByLabelText('Nome da turma')).toHaveValue('Turma salva na planilha');
    await expect(client.getAdminConfiguration()).resolves.toMatchObject({
      school: { name: 'Escola recuperada do Google' },
      classGroups: [
        {
          id: 'CLASS-REMOTE',
          label: 'Turma salva na planilha',
        },
      ],
    });
    expect((await client.getAdminConfiguration()).classGroups).toHaveLength(1);
  });

  it('começa com uma turma e permite adicionar ou excluir sem remover a última', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/gerenciar/turmas', client);

    expect(await screen.findByRole('heading', { name: 'Turmas', level: 2 })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Nome da turma')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Excluir turma 1ª série A' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Adicionar turma' }));
    expect(screen.getAllByLabelText('Nome da turma')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Excluir turma 1ª série A' }));
    expect(screen.getAllByLabelText('Nome da turma')).toHaveLength(1);
    expect(screen.getByLabelText('Nome da turma')).toHaveValue('Nova turma 2');
    expect(screen.getByRole('button', { name: 'Excluir turma Nova turma 2' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Adicionar turma' }));
    expect(screen.getByDisplayValue('Nova turma 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Excluir turma Nova turma 3' }));

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();

    const savedConfiguration = await client.getAdminConfiguration();
    expect(savedConfiguration.classGroups).toHaveLength(1);
    expect(savedConfiguration.classGroups[0]).toMatchObject({
      label: 'Nova turma 2',
      order: 1,
    });
    const [syncedConfiguration] = googleSheetsState.syncConfiguration.mock.calls.at(-1) ?? [];
    expect(syncedConfiguration?.classGroups).toEqual(savedConfiguration.classGroups);
  });

  it('edita e salva o nome da escola, publicando-o na agenda', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });

    const rendered = renderApp('/gerenciar/geral', client);

    const schoolName = await screen.findByLabelText('Nome da escola');
    await user.clear(schoolName);
    await user.type(schoolName, 'Escola Estadual Horizonte');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();
    await expect(client.getAdminConfiguration()).resolves.toMatchObject({
      school: { name: 'Escola Estadual Horizonte' },
    });

    rendered.unmount();
    renderApp('/?school=SCHOOL-DEMO&lab=LAB01', client);
    expect(await screen.findByText('Escola Estadual Horizonte')).toBeInTheDocument();
  });

  it('salva regras independentes por laboratório e permite o mesmo e-mail responsável', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    const initialConfiguration = await client.getAdminConfiguration();
    const { revision, ...initialDraft } = initialConfiguration;
    await client.saveAdminConfiguration({
      expectedRevision: revision,
      configuration: {
        ...initialDraft,
        sedSc: {
          ...initialDraft.sedSc,
          enabled: true,
          formUrl: 'https://docs.google.com/forms/d/e/formulario-sed/viewform',
          regionalName: 'Regional de Florianópolis',
          municipalityName: 'Florianópolis',
          officialSchoolName: 'EEM Paulo Freire',
        },
      },
    });

    renderApp('/gerenciar/geral', client);

    await screen.findByRole('heading', { name: 'Geral', level: 2 });
    const laboratoryPanels = document.querySelectorAll('details');
    expect(laboratoryPanels).toHaveLength(3);
    const firstLaboratory = within(laboratoryPanels[0] as HTMLElement);
    const secondLaboratoryElement = laboratoryPanels[1]!;

    await user.clear(firstLaboratory.getByLabelText('Laboratorista responsável 1'));
    await user.type(firstLaboratory.getByLabelText('Laboratorista responsável 1'), 'Joelcio Silva');
    await user.clear(firstLaboratory.getByLabelText('E-mail do responsável 1'));
    await user.type(
      firstLaboratory.getByLabelText('E-mail do responsável 1'),
      'laboratorio@escola.edu.br',
    );

    const maximumClasses = firstLaboratory.getByLabelText('Máximo de turmas');
    await user.clear(maximumClasses);
    await user.type(maximumClasses, '2');
    await user.click(
      firstLaboratory.getByRole('checkbox', { name: 'Controlar a capacidade de estudantes' }),
    );
    const maximumStudents = firstLaboratory.getByLabelText(/Capacidade do laboratório/);
    await user.clear(maximumStudents);
    await user.type(maximumStudents, '20');

    const minimumLeadTime = firstLaboratory.getByLabelText('Antecedência mínima');
    await user.clear(minimumLeadTime);
    await user.type(minimumLeadTime, '1');
    await user.selectOptions(firstLaboratory.getByLabelText('Unidade da antecedência'), 'DAYS');
    await user.click(
      firstLaboratory.getByRole('checkbox', {
        name: 'Permitir registro de aulas em datas passadas',
      }),
    );
    const retroactiveDays = firstLaboratory.getByLabelText(/Máximo de dias retroativos/);
    await user.clear(retroactiveDays);
    await user.type(retroactiveDays, '31');
    await user.selectOptions(
      firstLaboratory.getByLabelText('Conflitos em registros passados'),
      'BLOCK',
    );

    await user.click(
      firstLaboratory.getByRole('checkbox', {
        name: 'Usar a integração SED-SC neste laboratório',
      }),
    );
    const sedLeadTime = firstLaboratory.getByLabelText(/Enviar o link antes da primeira aula/);
    await user.clear(sedLeadTime);
    await user.type(sedLeadTime, '15');
    await user.click(
      firstLaboratory.getByRole('checkbox', {
        name: 'Preparar notificações pelo Google Chat',
      }),
    );
    await user.type(
      firstLaboratory.getByLabelText('Nome do espaço no Google Chat'),
      'Agendamentos do laboratório 1',
    );

    await user.click(secondLaboratoryElement.querySelector('summary')!);
    const secondLaboratory = within(secondLaboratoryElement);
    await user.type(secondLaboratory.getByLabelText('Laboratorista responsável 2'), 'Maria Souza');
    await user.type(
      secondLaboratory.getByLabelText('E-mail do responsável 2'),
      'laboratorio@escola.edu.br',
    );

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();

    const savedConfiguration = await client.getAdminConfiguration();
    const firstSettings = savedConfiguration.laboratorySettings.find(
      ({ laboratoryId }) => laboratoryId === savedConfiguration.laboratories[0]!.id,
    );
    const secondSettings = savedConfiguration.laboratorySettings.find(
      ({ laboratoryId }) => laboratoryId === savedConfiguration.laboratories[1]!.id,
    );

    expect(firstSettings).toMatchObject({
      responsibleName: 'Joelcio Silva',
      responsibleEmail: 'laboratorio@escola.edu.br',
      maxConcurrentClasses: 2,
      maxStudentCapacity: 20,
      minimumLeadTimeValue: 1,
      minimumLeadTimeUnit: 'DAYS',
      allowPastBookings: true,
      pastBookingLimitDays: 31,
      retroactiveConflictPolicy: 'BLOCK',
      sedIntegrationEnabled: true,
      sedLinkLeadMinutes: 15,
      googleChatEnabled: true,
      googleChatSpaceName: 'Agendamentos do laboratório 1',
      sendSedLinkToChat: true,
    });
    expect(secondSettings).toMatchObject({
      responsibleName: 'Maria Souza',
      responsibleEmail: 'laboratorio@escola.edu.br',
    });
    expect(
      savedConfiguration.laboratorySettings.filter(
        ({ responsibleEmail }) => responsibleEmail === 'laboratorio@escola.edu.br',
      ),
    ).toHaveLength(2);

    const [syncedConfiguration] = googleSheetsState.syncConfiguration.mock.calls.at(-1) ?? [];
    expect(syncedConfiguration?.laboratorySettings).toEqual(savedConfiguration.laboratorySettings);
  });

  it('edita e salva os dados fixos da integração com a SED-SC', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/gerenciar/formulario', client);

    await screen.findByRole('heading', { name: 'Formulário', level: 2 });
    await user.click(screen.getByText('Integração com a SED-SC'));
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Preparar integração com o formulário da SED-SC',
      }),
    );

    await user.type(
      screen.getByLabelText('URL do formulário da SED-SC'),
      'https://docs.google.com/forms/d/e/formulario-sed/viewform',
    );
    await user.type(screen.getByLabelText('Regional'), 'Regional de Florianópolis');
    await user.type(screen.getByLabelText('Município'), 'Florianópolis');
    const officialSchoolName = screen.getByLabelText('Nome oficial da escola na SED-SC');
    expect(officialSchoolName).toHaveValue('EEM Paulo Freire');
    await user.clear(officialSchoolName);
    await user.type(officialSchoolName, 'EEM Paulo Freire — cadastro SED');
    await user.type(screen.getByLabelText('Área padrão'), 'Tecnologias educacionais');
    await user.type(screen.getByLabelText('Tipo de atividade padrão'), 'Aula no laboratório');

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();

    const savedConfiguration = await client.getAdminConfiguration();
    expect(savedConfiguration.sedSc).toEqual({
      enabled: true,
      formUrl: 'https://docs.google.com/forms/d/e/formulario-sed/viewform',
      regionalName: 'Regional de Florianópolis',
      municipalityName: 'Florianópolis',
      officialSchoolName: 'EEM Paulo Freire — cadastro SED',
      defaultArea: 'Tecnologias educacionais',
      defaultActivityType: 'Aula no laboratório',
    });

    const [syncedConfiguration] = googleSheetsState.syncConfiguration.mock.calls.at(-1) ?? [];
    expect(syncedConfiguration?.sedSc).toEqual(savedConfiguration.sedSc);
  });

  it('atualiza o início do turno e regenera os horários publicados', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/gerenciar/horarios', client);

    await screen.findByRole('heading', { name: 'Horários', level: 2 });
    const firstShift = document.querySelector('details');
    expect(firstShift).not.toBeNull();

    const shift = within(firstShift as HTMLElement);
    fireEvent.change(shift.getByLabelText('Início'), { target: { value: '08:00' } });

    expect(shift.getByText('08:00–08:45')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();

    await waitFor(async () => {
      const bootstrap = await client.getBootstrapData();
      expect(bootstrap.periods.find((period) => period.id === 'P01')).toMatchObject({
        shiftName: 'Manhã',
        startTime: '08:00',
        endTime: '08:45',
      });
    });
  });

  it('expõe somente um acesso discreto ao gerenciador na agenda pública', async () => {
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/?school=SCHOOL-DEMO&lab=LAB01', client);

    expect(
      await screen.findByRole('heading', { name: 'Laboratório de Informática', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Acesso do laboratorista' })).toHaveAttribute(
      'href',
      '/gerenciar/geral',
    );
    expect(screen.queryByText('Painel do gerenciador')).not.toBeInTheDocument();
  });

  it('libera os QR Codes assim que os dados já estão salvos no Sheets', async () => {
    const client = await createConfiguredMockBackend();

    renderApp('/gerenciar/geral', client);

    expect(await screen.findAllByRole('button', { name: 'Baixar QR Code' })).toHaveLength(3);
  });

  it('aguarda o registro automático da escola antes de liberar seus QR Codes', async () => {
    googleSheetsState.publicSchoolReady = false;
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/gerenciar/geral', client);

    expect(await screen.findAllByRole('button', { name: 'Salvar e gerar QR Code' })).toHaveLength(
      3,
    );
    expect(screen.queryByRole('button', { name: 'Baixar QR Code' })).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Web App|SPREADSHEET_ID|compartilhe a planilha/i),
    ).not.toBeInTheDocument();
  });

  it('salva somente os dados principais e gera o acesso antes das demais configurações', async () => {
    const user = userEvent.setup();
    const mockBackend = new MockBackend({ latencyMs: 0 });
    const client: BackendClient = {
      getBootstrapData: (params) => mockBackend.getBootstrapData(params),
      getAvailability: (request) => mockBackend.getAvailability(request),
      createReservation: (request) => mockBackend.createReservation(request),
    };

    renderApp('/gerenciar/geral', client);

    await user.type(await screen.findByLabelText('Nome da escola'), 'Escola Piloto');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    await user.type(screen.getByLabelText('Nome do laboratório 1'), 'Laboratório Maker');
    await user.type(screen.getByLabelText('Laboratorista responsável 1'), 'Joelcio');
    await user.type(screen.getByLabelText('E-mail do responsável 1'), 'joelcio@escola.gov.br');

    const quickAccessButton = screen.getByRole('button', { name: 'Salvar e gerar QR Code' });
    expect(quickAccessButton).toBeEnabled();
    await user.click(quickAccessButton);

    expect(
      await screen.findByText('Dados salvos. Link e QR Code prontos para compartilhar.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar QR Code' })).toBeInTheDocument();
    const [savedConfiguration] = googleSheetsState.syncConfiguration.mock.calls.at(-1) ?? [];
    expect(savedConfiguration).toMatchObject({
      school: { name: 'Escola Piloto' },
      laboratories: [{ name: 'Laboratório Maker', active: true }],
      shifts: [],
      classGroups: [],
      resources: [],
    });
  });

  it('não expõe configuração técnica quando o acesso público está pronto', async () => {
    const client = await createConfiguredMockBackend();

    renderApp('/gerenciar/geral', client);

    expect(await screen.findAllByRole('button', { name: 'Baixar QR Code' })).toHaveLength(3);
    expect(screen.queryByText(/Web App|SPREADSHEET_ID/)).not.toBeInTheDocument();
  });

  it('bloqueia os campos enquanto publica para não sobrescrever edições tardias', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 40 });

    renderApp('/gerenciar/geral', client);

    const schoolName = await screen.findByLabelText('Nome da escola');
    await user.clear(schoolName);
    await user.type(schoolName, 'Escola sem perda de rascunho');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(schoolName).toBeDisabled();
    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeVisible();
    expect(schoolName).toBeEnabled();
  });

  it('cria a planilha no primeiro salvamento mesmo sem alterações locais', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    googleSheetsState.spreadsheetId = null;
    googleSheetsState.spreadsheetUrl = null;

    renderApp('/gerenciar/geral', client);

    const saveButton = await screen.findByRole('button', { name: 'Salvar alterações' });
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    await waitFor(() => expect(googleSheetsState.syncConfiguration).toHaveBeenCalledTimes(1));
    const [syncedConfiguration] = googleSheetsState.syncConfiguration.mock.calls[0] ?? [];
    expect(syncedConfiguration?.school.name).toBe('EEM Paulo Freire');
  });

  it('permite repetir somente a sincronização quando o Google falha depois do salvamento local', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    const saveLocal = vi.spyOn(client, 'saveAdminConfiguration');
    googleSheetsState.syncConfiguration
      .mockRejectedValueOnce(new Error('Falha temporária no Google.'))
      .mockResolvedValueOnce({
        spreadsheetId: 'planilha-existente',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/planilha-existente/edit',
        created: false,
        verified: true,
      });

    renderApp('/gerenciar/geral', client);

    const schoolName = await screen.findByLabelText('Nome da escola');
    await user.clear(schoolName);
    await user.type(schoolName, 'Escola com nova tentativa');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText(/acesso público ainda não foi confirmado/i)).toHaveTextContent(
      'Falha temporária no Google.',
    );
    expect(saveLocal).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();
    expect(googleSheetsState.syncConfiguration).toHaveBeenCalledTimes(2);
    expect(saveLocal).toHaveBeenCalledTimes(1);
  });

  it('retoma automaticamente uma configuração já escrita quando a publicação falha depois', async () => {
    const user = userEvent.setup();
    const source = new MockBackend({ latencyMs: 0 });
    const initialConfiguration = await source.getAdminConfiguration();
    let configurationAlreadyWritten: AdminConfiguration | null = null;
    googleSheetsState.loadLinkedConfiguration.mockImplementation(() =>
      Promise.resolve(configurationAlreadyWritten ?? initialConfiguration),
    );
    googleSheetsState.syncConfiguration
      .mockImplementationOnce((configurationToSync) => {
        configurationAlreadyWritten = structuredClone(configurationToSync);
        return Promise.reject(new Error('O vínculo público falhou depois da escrita.'));
      })
      .mockResolvedValueOnce({
        spreadsheetId: 'planilha-existente',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/planilha-existente/edit',
        created: false,
        verified: true,
      });
    const client: BackendClient = {
      getBootstrapData: (params) => source.getBootstrapData(params),
      getAvailability: (request) => source.getAvailability(request),
      createReservation: (request) => source.createReservation(request),
    };

    renderApp('/gerenciar/geral', client);
    const schoolName = await screen.findByLabelText('Nome da escola');
    await user.clear(schoolName);
    await user.type(schoolName, 'Escola recuperada automaticamente');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText(/acesso público ainda não foi confirmado/i)).toHaveTextContent(
      'O vínculo público falhou depois da escrita.',
    );

    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText(
        'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
      ),
    ).toBeInTheDocument();
    expect(googleSheetsState.syncConfiguration).toHaveBeenCalledTimes(2);
    expect(googleSheetsState.syncConfiguration.mock.calls[1]?.[0].revision).toBe(
      googleSheetsState.syncConfiguration.mock.calls[0]?.[0].revision,
    );
  });

  it('limita imediatamente uma quantidade extrema de aulas', async () => {
    const client = new MockBackend({ latencyMs: 0 });

    renderApp('/gerenciar/horarios', client);

    await screen.findByRole('heading', { name: 'Horários', level: 2 });
    const firstShift = document.querySelector('details');
    expect(firstShift).not.toBeNull();
    const shift = within(firstShift as HTMLElement);
    const classCount = shift.getByLabelText('Número de aulas');

    fireEvent.change(classCount, { target: { value: '999999999' } });

    expect(classCount).toHaveValue(12);
    expect(shift.getAllByRole('listitem')).toHaveLength(12);
  });

  it('confirma antes de abandonar um rascunho pela ligação de retorno', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderApp('/gerenciar/geral', client);

    const schoolName = await screen.findByLabelText('Nome da escola');
    await user.type(schoolName, ' alterada');
    await user.click(screen.getByRole('link', { name: 'Voltar ao início' }));

    expect(confirm).toHaveBeenCalledWith('Sair sem salvar? O rascunho atual será descartado.');
    expect(screen.getByRole('heading', { name: 'Painel do gerenciador' })).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('oferece recarregar quando outra tela publicou uma revisão mais nova', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderApp('/gerenciar/geral', client);
    const schoolName = await screen.findByLabelText('Nome da escola');
    const current = await client.getAdminConfiguration();
    await client.saveAdminConfiguration({
      expectedRevision: current.revision,
      configuration: {
        school: { ...current.school, name: 'Escola publicada em outra tela' },
        laboratories: current.laboratories,
        shifts: current.shifts,
        classGroups: current.classGroups,
        subjects: current.subjects,
        resources: current.resources,
        bookingForm: current.bookingForm,
        laboratorySettings: current.laboratorySettings,
        sedSc: current.sedSc,
      },
    });

    await user.clear(schoolName);
    await user.type(schoolName, 'Rascunho local');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(
      await screen.findByText(/As configurações foram alteradas em outra tela/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Recarregar configuração publicada' }));

    expect(await screen.findByLabelText('Nome da escola')).toHaveValue(
      'Escola publicada em outra tela',
    );
    confirm.mockRestore();
  });
});
