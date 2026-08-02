import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLaboratoryAdminConfiguration } from '../../domain/configuration';
import type { AdminConfiguration, ManagedReservation } from '../../types';
import { ManagerReservations } from './ManagerReservations';

const configuration: AdminConfiguration = {
  revision: 'revision-1',
  school: { id: 'school-1', name: 'Escola Piloto' },
  laboratories: [
    { id: 'LAB01', name: 'Laboratório de Informática', active: true },
    { id: 'LAB02', name: 'Laboratório de Química', active: true },
  ],
  shifts: [],
  classGroups: [],
  subjects: [],
  resources: [],
  bookingForm: { showObservations: true },
  laboratorySettings: [
    {
      ...createDefaultLaboratoryAdminConfiguration('LAB01'),
      responsibleName: 'Ana Laboratorista',
      responsibleEmail: 'ana@escola.edu.br',
    },
    createDefaultLaboratoryAdminConfiguration('LAB02'),
  ],
  sedSc: {
    enabled: false,
    formUrl: '',
    regionalName: '',
    municipalityName: '',
    officialSchoolName: '',
    defaultArea: '',
    defaultActivityType: '',
  },
};

const partialReservation: ManagedReservation = {
  id: 'RES-001',
  date: '2026-08-05',
  laboratoryId: 'LAB01',
  laboratoryName: 'Laboratório de Informática',
  teacherName: 'Maria Souza',
  classGroup: '2ª série A',
  subject: 'Biologia',
  periodIds: ['P01', 'P02', 'P03'],
  periodLabels: ['1ª aula', '2ª aula', '3ª aula'],
  periodTimes: ['07:30–08:15', '08:15–09:00', '09:00–09:45'],
  knowledgeObjects: 'Citologia e metabolismo',
  itemsUsed: 'Microscópios e lâminas',
  notes: 'Organizar seis bancadas.',
  createdAt: '2026-08-01T12:30:00.000Z',
  status: 'PARTIALLY_CANCELLED',
  activePeriodIds: ['P01', 'P03'],
  cancelledPeriodIds: ['P02'],
  cancellations: [
    {
      id: 'CAN-001',
      reservationId: 'RES-001',
      periodId: 'P02',
      periodLabel: '2ª aula',
      cancelledAt: '2026-08-02T13:00:00.000Z',
      cancelledBy: 'Ana Laboratorista',
      reason: 'Conflito com manutenção',
    },
  ],
};

const cancelledReservation: ManagedReservation = {
  ...partialReservation,
  id: 'RES-002',
  laboratoryId: 'LAB02',
  laboratoryName: 'Laboratório de Química',
  teacherName: 'João Lima',
  subject: 'Química',
  periodIds: ['P04'],
  periodLabels: ['4ª aula'],
  periodTimes: ['10:00–10:45'],
  status: 'CANCELLED',
  activePeriodIds: [],
  cancelledPeriodIds: ['P04'],
  cancellations: [
    {
      id: 'CAN-002',
      reservationId: 'RES-002',
      periodId: 'P04',
      periodLabel: '4ª aula',
      cancelledAt: '2026-08-03T13:00:00.000Z',
      cancelledBy: 'laboratorio@escola.edu.br',
      reason: '',
    },
  ],
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function getPeriodItem(label: string): HTMLElement {
  const periodLabel = screen.getByText(label, { selector: 'strong' });
  const item = periodLabel.closest('li');
  if (!item) {
    throw new Error(`A aula ${label} não foi encontrada.`);
  }
  return item;
}

describe('ManagerReservations', () => {
  it('carrega e mostra os dados completos, aulas ativas e canceladas', async () => {
    const loadReservations = vi.fn().mockResolvedValue([partialReservation]);

    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={loadReservations}
        cancelReservationPeriods={vi.fn()}
      />,
    );

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Carregando agendamentos');
    expect(await screen.findByRole('heading', { name: 'Maria Souza' })).toBeInTheDocument();
    expect(screen.getByText('Citologia e metabolismo')).toBeInTheDocument();
    expect(screen.getByText('Microscópios e lâminas')).toBeInTheDocument();
    expect(screen.getByText('Organizar seis bancadas.')).toBeInTheDocument();
    expect(screen.getByText('RES-001')).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Selecionar 1ª aula de Maria Souza' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'Selecionar 3ª aula de Maria Souza' }),
    ).toBeEnabled();
    expect(
      screen.queryByRole('checkbox', { name: 'Selecionar 2ª aula de Maria Souza' }),
    ).not.toBeInTheDocument();
    expect(within(getPeriodItem('2ª aula')).getByText('Cancelada')).toBeInTheDocument();
    expect(
      within(getPeriodItem('2ª aula')).getByText(/Conflito com manutenção/),
    ).toBeInTheDocument();
  });

  it('filtra por laboratório e situação', async () => {
    const user = userEvent.setup();
    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={vi.fn().mockResolvedValue([partialReservation, cancelledReservation])}
        cancelReservationPeriods={vi.fn()}
      />,
    );

    await screen.findByRole('heading', { name: 'Maria Souza' });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Laboratório' }), 'LAB02');

    expect(screen.queryByRole('heading', { name: 'Maria Souza' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'João Lima' })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Situação' }), 'CONFIRMED');
    expect(
      screen.getByRole('heading', { name: 'Nenhum resultado para estes filtros' }),
    ).toBeInTheDocument();
  });

  it('ordena por data e criação mais recentes primeiro', async () => {
    const newestOnSameDate: ManagedReservation = {
      ...partialReservation,
      id: 'RES-003',
      teacherName: 'Carlos Mendes',
      createdAt: '2026-08-02T12:30:00.000Z',
    };
    const newestDate: ManagedReservation = {
      ...cancelledReservation,
      date: '2026-08-06',
    };
    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={vi
          .fn()
          .mockResolvedValue([partialReservation, newestOnSameDate, newestDate])}
        cancelReservationPeriods={vi.fn()}
      />,
    );

    await screen.findByRole('heading', { name: 'Carlos Mendes' });

    expect(
      screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent),
    ).toEqual(['João Lima', 'Carlos Mendes', 'Maria Souza']);
  });

  it('mostra os estados vazio e de erro com nova tentativa', async () => {
    const user = userEvent.setup();
    const loadReservations = vi
      .fn()
      .mockRejectedValueOnce(new Error('Planilha temporariamente indisponível.'))
      .mockResolvedValueOnce([]);
    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={loadReservations}
        cancelReservationPeriods={vi.fn()}
      />,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Planilha temporariamente indisponível.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(
      await screen.findByRole('heading', { name: 'Nenhum agendamento registrado' }),
    ).toBeInTheDocument();
    expect(loadReservations).toHaveBeenCalledTimes(2);
  });

  it('cancela somente as aulas selecionadas e recarrega após o sucesso', async () => {
    const user = userEvent.setup();
    const cancellation = createDeferred<unknown>();
    const reload = createDeferred<ManagedReservation[]>();
    const updatedReservation: ManagedReservation = {
      ...partialReservation,
      activePeriodIds: ['P01'],
      cancelledPeriodIds: ['P02', 'P03'],
      cancellations: [
        ...partialReservation.cancellations,
        {
          id: 'CAN-003',
          reservationId: 'RES-001',
          periodId: 'P03',
          periodLabel: '3ª aula',
          cancelledAt: '2026-08-04T13:00:00.000Z',
          cancelledBy: 'Ana Laboratorista',
          reason: 'Professor solicitou ajuste',
        },
      ],
    };
    const loadReservations = vi
      .fn()
      .mockResolvedValueOnce([partialReservation])
      .mockImplementationOnce(() => reload.promise);
    const cancelReservationPeriods = vi.fn(() => cancellation.promise);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={loadReservations}
        cancelReservationPeriods={cancelReservationPeriods}
      />,
    );

    await screen.findByRole('heading', { name: 'Maria Souza' });
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar 3ª aula de Maria Souza' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Motivo do cancelamento (opcional)' }),
      '  Professor solicitou ajuste  ',
    );
    await user.click(screen.getByRole('button', { name: 'Desagendar 1 aula' }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(cancelReservationPeriods).toHaveBeenCalledWith({
      reservationId: 'RES-001',
      periodIds: ['P03'],
      cancelledBy: 'Ana Laboratorista',
      reason: 'Professor solicitou ajuste',
    });
    expect(loadReservations).toHaveBeenCalledTimes(1);
    expect(within(getPeriodItem('3ª aula')).getByText('Ativa')).toBeInTheDocument();

    cancellation.resolve(undefined);
    await waitFor(() => expect(loadReservations).toHaveBeenCalledTimes(2));
    expect(within(getPeriodItem('3ª aula')).getByText('Ativa')).toBeInTheDocument();

    reload.resolve([updatedReservation]);
    await waitFor(() =>
      expect(within(getPeriodItem('3ª aula')).getByText('Cancelada')).toBeInTheDocument(),
    );
    confirm.mockRestore();
  });

  it('permite selecionar todas, mas não cancela quando a confirmação é recusada', async () => {
    const user = userEvent.setup();
    const cancelReservationPeriods = vi.fn();
    const loadReservations = vi.fn().mockResolvedValue([partialReservation]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={loadReservations}
        cancelReservationPeriods={cancelReservationPeriods}
      />,
    );

    await screen.findByRole('heading', { name: 'Maria Souza' });
    await user.click(screen.getByRole('button', { name: 'Selecionar todas as aulas ativas' }));
    await user.click(screen.getByRole('button', { name: 'Desagendar todas as aulas ativas' }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('todas as 2 aulas ativas'));
    expect(cancelReservationPeriods).not.toHaveBeenCalled();
    expect(loadReservations).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });

  it('mantém os dados visíveis e não recarrega quando o cancelamento falha', async () => {
    const user = userEvent.setup();
    const loadReservations = vi.fn().mockResolvedValue([partialReservation]);
    const cancelReservationPeriods = vi
      .fn()
      .mockRejectedValue(new Error('Falha ao registrar o cancelamento.'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <ManagerReservations
        configuration={configuration}
        loadReservations={loadReservations}
        cancelReservationPeriods={cancelReservationPeriods}
      />,
    );

    await screen.findByRole('heading', { name: 'Maria Souza' });
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar 1ª aula de Maria Souza' }));
    await user.click(screen.getByRole('button', { name: 'Desagendar 1 aula' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Falha ao registrar o cancelamento.',
    );
    expect(within(getPeriodItem('1ª aula')).getByText('Ativa')).toBeInTheDocument();
    expect(loadReservations).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
  });
});
