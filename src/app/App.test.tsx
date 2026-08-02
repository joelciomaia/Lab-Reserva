import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MockBackend } from '../services/mockBackend';
import { formatWeekRange, getCurrentAgendaReferenceDate, getSchoolWeek } from '../utils/week';
import { App } from './App';

function renderApp(
  route = '/?school=SCHOOL-DEMO&lab=LAB01',
  client = new MockBackend({ latencyMs: 0 }),
) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App client={client} />
    </MemoryRouter>,
  );
}

describe('apresentação do Lab Reserva', () => {
  it('mostra o ponto de partida sem consultar a agenda pública', async () => {
    const client = new MockBackend({ latencyMs: 0 });
    const getBootstrapData = vi.spyOn(client, 'getBootstrapData');

    renderApp('/', client);

    expect(
      await screen.findByRole('heading', {
        name: 'Organize o laboratório. Compartilhe o acesso. Pronto.',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Uma implantação/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Começar configuração' })).toHaveAttribute(
      'href',
      '/gerenciar/entrar',
    );
    expect(screen.queryByText(/Não foi possível concluir/i)).not.toBeInTheDocument();
    expect(getBootstrapData).not.toHaveBeenCalled();
    await waitFor(() => expect(document.title).toBe('Início | Lab Reserva'));
  });

  it('leva o laboratorista da apresentação para o login Google', async () => {
    const user = userEvent.setup();
    renderApp('/');

    await user.click(await screen.findByRole('link', { name: 'Começar configuração' }));

    expect(
      await screen.findByRole('heading', { name: 'Conectar ao Google', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });
});

describe('agenda semanal do professor', () => {
  afterEach(() => {
    delete window.APP_BOOTSTRAP;
  });

  it('abre diretamente em uma grade semanal sem dashboard ou menu', async () => {
    renderApp();
    const expectedCurrentAgendaLabel = formatWeekRange(getCurrentAgendaReferenceDate(new Date()));

    expect(await screen.findByText('EEM Paulo Freire')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Laboratório de Informática', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver semana anterior' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver próxima semana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoje' })).toBeDisabled();
    const weekHeading = screen.getByRole('heading', {
      name: expectedCurrentAgendaLabel,
      level: 2,
    });
    expect(screen.getByRole('link', { name: 'Agendar uma aula' }).getAttribute('href')).toContain(
      'school=SCHOOL-DEMO',
    );
    expect(screen.getByRole('link', { name: 'Acesso do laboratorista' })).toHaveAttribute(
      'href',
      '/gerenciar/geral',
    );

    const calendar = await screen.findByRole('region', {
      name: 'Agenda semanal de Laboratório de Informática',
    });
    expect(calendar).toBeInTheDocument();
    expect((calendar.firstElementChild as HTMLElement).style.getPropertyValue('--day-count')).toBe(
      '5',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ver próxima semana' }));
    expect(
      (await screen.findAllByRole('button', { name: /livre.*Fazer agendamento/i })).length,
    ).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hoje' }));
    await waitFor(() => expect(weekHeading).toHaveTextContent(expectedCurrentAgendaLabel));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/administração/i)).not.toBeInTheDocument();
  });

  it('mantém a semana solicitada pelo link e mescla reservas consecutivas', async () => {
    const reservationWeekDate = getSchoolWeek(new Date())[0]!.isoDate;
    renderApp(`/?school=SCHOOL-DEMO&lab=LAB01&date=${reservationWeekDate}`);

    expect(
      await screen.findByRole('button', {
        name: /Terça.*horário reservado.*07:30 às 09:00.*Ver detalhes/i,
      }),
    ).toHaveStyle({
      gridRow: '2 / span 2',
    });
  });

  it('abre um slot livre com laboratório, data e aula pré-selecionados', async () => {
    const user = userEvent.setup();
    renderApp('/?school=SCHOOL-DEMO&lab=LAB02');

    await user.click(await screen.findByRole('button', { name: 'Ver próxima semana' }));
    const freeSlot = (
      await screen.findAllByRole('button', {
        name: /livre.*Fazer agendamento/i,
      })
    )[0]!;
    await user.click(freeSlot);

    expect(
      await screen.findByRole('heading', { name: 'Fazer agendamento', level: 1 }),
    ).toBeInTheDocument();
    const periodGroup = screen.getByRole('group', { name: /Aulas desejadas/i });
    await waitFor(() =>
      expect(
        within(periodGroup)
          .getAllByRole('checkbox')
          .filter((checkbox) => (checkbox as HTMLInputElement).checked),
      ).toHaveLength(1),
    );
  });

  it('usa o laboratório indicado pelo link', async () => {
    const client = new MockBackend({ latencyMs: 0 });
    const getBootstrapData = vi.spyOn(client, 'getBootstrapData');
    renderApp('/?school=SCHOOL-DEMO&lab=LAB02', client);

    expect(
      await screen.findByRole('heading', { name: 'Sala Maker', level: 1 }),
    ).toBeInTheDocument();
    expect(getBootstrapData).toHaveBeenCalledWith({
      schoolId: 'SCHOOL-DEMO',
      preselectedLaboratoryId: 'LAB02',
    });
  });

  it('sempre prioriza a escola e o laboratório explícitos no QR Code', async () => {
    window.APP_BOOTSTRAP = {
      preselectedLaboratoryId: 'LAB01',
    };
    const client = new MockBackend({ latencyMs: 0 });
    const getBootstrapData = vi.spyOn(client, 'getBootstrapData');

    renderApp('/?school=SCHOOL-DEMO&lab=LAB02', client);

    expect(
      await screen.findByRole('heading', { name: 'Sala Maker', level: 1 }),
    ).toBeInTheDocument();
    expect(getBootstrapData).toHaveBeenCalledWith({
      schoolId: 'SCHOOL-DEMO',
      preselectedLaboratoryId: 'LAB02',
    });
  });

  it('não troca silenciosamente um link inválido pelo primeiro laboratório', async () => {
    renderApp('/?school=SCHOOL-DEMO&lab=LAB-INEXISTENTE');

    expect(
      await screen.findByText('Nenhum laboratório foi encontrado para este link.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Laboratório de Informática', level: 1 }),
    ).not.toBeInTheDocument();
  });

  it('navega entre semanas mantendo a grade', async () => {
    const user = userEvent.setup();
    renderApp();
    const weekHeading = await screen.findByRole('heading', { name: /a .* de 2026/i, level: 2 });
    const currentWeek = weekHeading.textContent;

    await user.click(screen.getByRole('button', { name: 'Ver próxima semana' }));

    await waitFor(() => expect(weekHeading).not.toHaveTextContent(currentWeek ?? ''));
    expect(
      await screen.findByRole('region', { name: 'Agenda semanal de Laboratório de Informática' }),
    ).toBeInTheDocument();
  });

  it('abre os detalhes de uma reserva sem sair da semana', async () => {
    const user = userEvent.setup();
    const reservationWeekDate = getSchoolWeek(new Date())[0]!.isoDate;
    renderApp(`/?school=SCHOOL-DEMO&lab=LAB01&date=${reservationWeekDate}`);

    await user.click(
      await screen.findByRole('button', {
        name: /Segunda.*horário reservado.*07:30 às 08:15.*Ver detalhes/i,
      }),
    );

    const dialog = screen.getByRole('dialog', { name: 'Horário reservado' });
    expect(dialog).not.toHaveTextContent('Ana Paula Ribeiro');
    expect(dialog).not.toHaveTextContent('História');
    expect(dialog).toHaveTextContent('07:30–08:15');
    await user.click(screen.getByRole('button', { name: 'Fechar detalhes' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('oferece nova tentativa quando a agenda não pode ser carregada', async () => {
    renderApp(
      '/?school=SCHOOL-DEMO&lab=LAB01',
      new MockBackend({ latencyMs: 0, failBootstrap: true }),
    );

    expect(
      await screen.findByText('Não foi possível carregar os dados da escola.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});

describe('acesso ao gerenciador', () => {
  it('abre o login Google pelo acesso discreto da agenda', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole('link', {
        name: 'Acesso do laboratorista',
      }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Conectar ao Google', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
  });

  it('solicita a autorização Google antes de abrir o painel', async () => {
    renderApp('/gerenciar/geral');

    expect(
      await screen.findByRole('heading', { name: 'Conectar ao Google', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument();
    expect(screen.queryByText('Painel do gerenciador')).not.toBeInTheDocument();
  });
});
