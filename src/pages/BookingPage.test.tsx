import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { MockBackend } from '../services/mockBackend';
import type { AdminConfigurationDraft, ClassPeriod } from '../types';
import { getSchoolWeek } from '../utils/week';

function renderBookingPage(
  initialEntry = '/agendar?lab=LAB02',
  client = new MockBackend({ latencyMs: 0 }),
) {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App client={client} />
    </MemoryRouter>,
  );
}

async function updateConfiguration(
  client: MockBackend,
  update: (configuration: AdminConfigurationDraft) => AdminConfigurationDraft,
) {
  const current = await client.getAdminConfiguration();
  const { revision, ...configuration } = current;

  return client.saveAdminConfiguration({
    expectedRevision: revision,
    configuration: update(structuredClone(configuration)),
  });
}

const weekdayAwarePeriods: ClassPeriod[] = [
  {
    id: 'FORM-MORNING-1',
    shiftId: 'FORM-MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 1,
    name: '1ª aula',
    startTime: '07:30',
    endTime: '08:15',
    order: 1,
    active: true,
  },
  {
    id: 'FORM-MORNING-2',
    shiftId: 'FORM-MORNING',
    shiftName: 'Manhã',
    shiftOrder: 1,
    classNumber: 2,
    name: '2ª aula',
    startTime: '08:15',
    endTime: '09:00',
    order: 2,
    active: true,
  },
  {
    id: 'FORM-AFTERNOON-1',
    shiftId: 'FORM-AFTERNOON',
    shiftName: 'Tarde',
    shiftOrder: 2,
    classNumber: 1,
    name: '1ª aula',
    startTime: '14:00',
    endTime: '14:45',
    order: 1,
    active: true,
  },
  {
    id: 'FORM-NIGHT-1',
    shiftId: 'FORM-NIGHT',
    shiftName: 'Noite',
    shiftOrder: 3,
    classNumber: 1,
    name: '1ª aula',
    startTime: '18:00',
    endTime: '18:45',
    order: 1,
    active: true,
    activeWeekdays: [3],
  },
  {
    id: 'FORM-NIGHT-2',
    shiftId: 'FORM-NIGHT',
    shiftName: 'Noite',
    shiftOrder: 3,
    classNumber: 2,
    name: '2ª aula',
    startTime: '18:45',
    endTime: '19:30',
    order: 2,
    active: true,
    activeWeekdays: [3],
  },
  {
    id: 'FORM-NIGHT-3',
    shiftId: 'FORM-NIGHT',
    shiftName: 'Noite',
    shiftOrder: 3,
    classNumber: 3,
    name: '3ª aula',
    startTime: '19:30',
    endTime: '20:15',
    order: 3,
    active: true,
    activeWeekdays: [3],
  },
];

describe('formulário de agendamento', () => {
  it('exibe os campos configurados e oculta observações por padrão', async () => {
    renderBookingPage();

    expect(
      await screen.findByRole('heading', { name: 'Fazer agendamento', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Nome do professor/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Disciplina/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Turma/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Data da aula/i)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Aulas desejadas/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Objetos do conhecimento/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Itens que serão utilizados/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Observações/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar agendamento' })).toBeInTheDocument();
  });

  it('mostra observações quando essa opção está ativa na configuração', async () => {
    const client = new MockBackend({ latencyMs: 0 });
    await updateConfiguration(client, (configuration) => ({
      ...configuration,
      bookingForm: { showObservations: true },
    }));

    renderBookingPage('/agendar?lab=LAB02', client);

    expect(await screen.findByRole('textbox', { name: /Observações/i })).toBeInTheDocument();
  });

  it('exibe somente os recursos ativos, na ordem configurada', async () => {
    const client = new MockBackend({ latencyMs: 0 });
    await updateConfiguration(client, (configuration) => ({
      ...configuration,
      resources: [
        { id: 'resource-last', label: 'Recurso final', order: 3, active: true },
        { id: 'resource-hidden', label: 'Recurso desativado', order: 1, active: false },
        { id: 'resource-first', label: 'Recurso inicial', order: 2, active: true },
      ],
    }));

    renderBookingPage('/agendar?lab=LAB02', client);

    const resourceGroup = await screen.findByRole('group', {
      name: /Itens que serão utilizados/i,
    });
    expect(
      within(resourceGroup)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.getAttribute('name')),
    ).toEqual(['resourceIds', 'resourceIds']);
    expect(
      within(resourceGroup)
        .getAllByRole('checkbox')
        .map((checkbox) => checkbox.parentElement?.textContent),
    ).toEqual(['Recurso inicial', 'Recurso final']);
    expect(
      within(resourceGroup).queryByRole('checkbox', { name: 'Recurso desativado' }),
    ).not.toBeInTheDocument();
  });

  it('pré-seleciona a aula livre informada por laboratório, data e período', async () => {
    renderBookingPage('/agendar?lab=LAB02&date=2099-01-15&period=P03');

    expect(await screen.findByLabelText(/Data da aula/i)).toHaveValue('2099-01-15');
    expect(screen.getByText('Sala Maker')).toBeInTheDocument();

    const periodGroup = await screen.findByRole('group', { name: /Aulas desejadas/i });
    const selectedPeriod = await within(periodGroup).findByRole('checkbox', {
      name: /3ª aula.*09:00.*09:45.*Livre/i,
    });
    const periodCheckboxes = within(periodGroup).getAllByRole('checkbox');

    await waitFor(() => expect(selectedPeriod).toBeChecked());
    expect(periodCheckboxes.filter((checkbox) => (checkbox as HTMLInputElement).checked)).toEqual([
      selectedPeriod,
    ]);
  });

  it('não pré-seleciona uma aula informada que já está reservada', async () => {
    const reservedDate = getSchoolWeek(new Date())[0]!.isoDate;
    renderBookingPage(`/agendar?lab=LAB01&date=${reservedDate}&period=P01`);

    const periodGroup = await screen.findByRole('group', { name: /Aulas desejadas/i });
    const reservedPeriod = await within(periodGroup).findByRole('checkbox', {
      name: /1ª aula.*07:30.*08:15.*Reservado/i,
    });

    expect(reservedPeriod).toBeDisabled();
    expect(reservedPeriod).not.toBeChecked();
  });

  it('informa quando a escola ainda não possui aulas ativas configuradas', async () => {
    renderBookingPage(
      '/agendar?lab=LAB02',
      new MockBackend({ latencyMs: 0, periods: [], initialReservations: [] }),
    );

    expect(
      await screen.findByText('Nenhuma aula foi configurada para esta data.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar agendamento' })).toBeDisabled();
  });

  it('exibe a demonstração com três turnos de cinco aulas', async () => {
    const monday = getSchoolWeek(new Date(2099, 0, 5))[0]!.isoDate;
    renderBookingPage(`/agendar?lab=LAB02&date=${monday}`);

    const periodFieldset = await screen.findByRole('group', {
      name: /Aulas desejadas/i,
    });
    const shiftGroups = await Promise.all(
      ['Manhã', 'Tarde', 'Noite'].map((shiftName) =>
        within(periodFieldset).findByRole('group', { name: shiftName }),
      ),
    );
    const shiftGrid = periodFieldset.querySelector<HTMLElement>('[data-shift-count]');

    expect(shiftGrid).toHaveAttribute('data-shift-count', '3');
    expect(shiftGrid?.style.getPropertyValue('--shift-columns')).toBe('3');

    shiftGroups.forEach((shiftGroup) => {
      expect(within(shiftGroup).getAllByRole('checkbox')).toHaveLength(5);
      expect(
        Array.from(
          shiftGroup.querySelectorAll<HTMLElement>('[data-period-label="compact"]'),
          (label) => label.textContent,
        ),
      ).toEqual(['1° aula', '2° aula', '3° aula', '4° aula', '5° aula']);
    });
  });

  it('groups periods semantically by shift with dynamic quantities', async () => {
    const futureWeek = getSchoolWeek(new Date(2099, 0, 5));
    const wednesday = futureWeek[2]!.isoDate;
    const client = new MockBackend({
      latencyMs: 0,
      periods: weekdayAwarePeriods,
      initialReservations: [],
    });

    renderBookingPage(`/agendar?lab=LAB02&date=${wednesday}`, client);

    const periodFieldset = await screen.findByRole('group', {
      name: /Aulas desejadas/i,
    });
    const [morning, afternoon, night] = await Promise.all([
      within(periodFieldset).findByRole('group', { name: 'Manhã' }),
      within(periodFieldset).findByRole('group', { name: 'Tarde' }),
      within(periodFieldset).findByRole('group', { name: 'Noite' }),
    ]);
    const shiftGrid = periodFieldset.querySelector('[data-shift-count]');

    expect(shiftGrid).toHaveAttribute('data-shift-count', '3');
    expect((shiftGrid as HTMLElement | null)?.style.getPropertyValue('--shift-columns')).toBe('3');
    expect(within(morning).getAllByRole('checkbox')).toHaveLength(2);
    expect(within(afternoon).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(night).getAllByRole('checkbox')).toHaveLength(3);
    expect(morning).toHaveTextContent('2 de 2 livres');
    expect(afternoon).toHaveTextContent('1 de 1 livre');
    expect(night).toHaveTextContent('3 de 3 livres');
    expect(morning).toHaveAccessibleDescription('2 de 2 aulas livres.');
    expect(afternoon).toHaveAccessibleDescription('1 de 1 aula livre.');
    expect(night).toHaveAccessibleDescription('3 de 3 aulas livres.');

    const shiftGroups = new Map([
      ['Manhã', morning],
      ['Tarde', afternoon],
      ['Noite', night],
    ]);

    for (const period of weekdayAwarePeriods) {
      const group = shiftGroups.get(period.shiftName)!;
      const accessibleName = new RegExp(
        `${period.name}.*${period.startTime}.*${period.endTime}.*Livre`,
        'i',
      );
      const checkbox = within(group).getByRole('checkbox', { name: accessibleName });
      const option = checkbox.closest('label');
      const compactVisualLabel = option?.querySelector<HTMLElement>(
        '[data-period-label="compact"]',
      );

      expect(checkbox).toHaveAccessibleName(accessibleName);
      expect(compactVisualLabel).toBeInTheDocument();
      expect(compactVisualLabel).toHaveTextContent(`${period.classNumber}° aula`);
    }
  });

  it('shows the extra night shift only on Wednesday and clears its selection on date change', async () => {
    const user = userEvent.setup();
    const futureWeek = getSchoolWeek(new Date(2099, 0, 5));
    const monday = futureWeek[0]!.isoDate;
    const wednesday = futureWeek[2]!.isoDate;
    const client = new MockBackend({
      latencyMs: 0,
      periods: weekdayAwarePeriods,
      initialReservations: [],
    });

    renderBookingPage(`/agendar?lab=LAB02&date=${wednesday}`, client);

    const periodFieldset = await screen.findByRole('group', {
      name: /Aulas desejadas/i,
    });
    const night = await within(periodFieldset).findByRole('group', { name: 'Noite' });
    const nightPeriod = within(night).getByRole('checkbox', {
      name: /1ª aula.*18:00.*18:45.*Livre/i,
    });
    await user.click(nightPeriod);
    expect(nightPeriod).toBeChecked();

    const dateInput = screen.getByLabelText(/Data da aula/i);
    fireEvent.change(dateInput, { target: { value: monday } });

    await waitFor(() => {
      expect(
        within(periodFieldset).queryByRole('group', { name: 'Noite' }),
      ).not.toBeInTheDocument();
      expect(periodFieldset.querySelector('[data-shift-count]')).toHaveAttribute(
        'data-shift-count',
        '2',
      );
      expect(
        periodFieldset
          .querySelector<HTMLElement>('[data-shift-count]')
          ?.style.getPropertyValue('--shift-columns'),
      ).toBe('2');
    });

    fireEvent.change(dateInput, { target: { value: wednesday } });

    const nightAgain = await within(periodFieldset).findByRole('group', { name: 'Noite' });
    expect(
      periodFieldset
        .querySelector<HTMLElement>('[data-shift-count]')
        ?.style.getPropertyValue('--shift-columns'),
    ).toBe('3');
    expect(
      within(nightAgain).getByRole('checkbox', {
        name: /1ª aula.*18:00.*18:45.*Livre/i,
      }),
    ).not.toBeChecked();
  });

  it('mostra objetos do conhecimento conforme disciplina e turma', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    await updateConfiguration(client, (configuration) => ({
      ...configuration,
      classGroups: [
        ...configuration.classGroups,
        {
          id: 'class-grade-2-a',
          label: '2ª série A',
          gradeId: 'high-school-2',
          studentCount: 30,
          order: configuration.classGroups.length + 1,
          active: true,
        },
      ],
    }));
    renderBookingPage('/agendar?lab=LAB02', client);
    await screen.findByRole('heading', { name: 'Fazer agendamento', level: 1 });

    await user.selectOptions(
      screen.getByRole('combobox', { name: /Disciplina/i }),
      'subject-physical-education',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: /Turma/i }), 'class-grade-1-a');

    const firstGradeObject = screen.getByRole('checkbox', {
      name: 'Ginástica de condicionamento físico',
    });
    expect(firstGradeObject).toBeInTheDocument();
    await user.click(firstGradeObject);

    await user.selectOptions(screen.getByRole('combobox', { name: /Turma/i }), 'class-grade-2-a');

    expect(
      screen.queryByRole('checkbox', { name: 'Ginástica de condicionamento físico' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Esportes de rede e parede' })).toBeInTheDocument();
    expect(
      screen.getByText(/As escolhas de objetos do conhecimento foram limpas/i),
    ).toBeInTheDocument();
  });

  it('confirma e retorna à semana mostrando o novo agendamento', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });
    await updateConfiguration(client, (configuration) => ({
      ...configuration,
      resources: [
        {
          id: 'resource-school-camera',
          label: 'Câmera 360 da escola',
          order: 1,
          active: true,
        },
      ],
    }));
    const createReservation = vi.spyOn(client, 'createReservation');
    const nextWeekMonday = getSchoolWeek(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))[0]!
      .isoDate;
    renderBookingPage(`/agendar?school=SCHOOL-DEMO&lab=LAB02&date=${nextWeekMonday}`, client);
    await screen.findByRole('heading', { name: 'Fazer agendamento', level: 1 });

    await user.type(screen.getByRole('textbox', { name: /Nome do professor/i }), 'Joana Alves');
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Disciplina/i }),
      'subject-biology',
    );
    await user.selectOptions(screen.getByRole('combobox', { name: /Turma/i }), 'class-grade-1-a');

    const knowledgeGroup = screen.getByRole('group', { name: /Objetos do conhecimento/i });
    await user.click(
      within(knowledgeGroup).getByRole('checkbox', {
        name: 'Organização celular e metabolismo',
      }),
    );

    const resourceGroup = screen.getByRole('group', { name: /Itens que serão utilizados/i });
    await user.click(within(resourceGroup).getByRole('checkbox', { name: 'Câmera 360 da escola' }));

    const periodGroup = screen.getByRole('group', { name: /Aulas desejadas/i });
    const availablePeriods = await within(periodGroup).findAllByRole('checkbox', {
      name: /Livre/i,
    });
    await user.click(availablePeriods[0]!);
    await user.click(screen.getByRole('button', { name: 'Confirmar agendamento' }));

    expect(
      await screen.findByText('Agendamento confirmado e incluído na semana.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sala Maker', level: 1 })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: /horário reservado.*Ver detalhes/i,
      }),
    ).toBeInTheDocument();
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        schoolId: 'SCHOOL-DEMO',
        subject: 'Biologia',
        classGroup: '1ª série A',
        knowledgeObjects: 'Organização celular e metabolismo',
        itemsUsed: 'Câmera 360 da escola',
        notes: '',
      }),
    );
  });
});
