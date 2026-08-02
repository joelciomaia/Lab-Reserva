import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { MockBackend } from '../services/mockBackend';
import type { AdminConfigurationDraft } from '../types';
import { getSchoolWeek } from '../utils/week';

function renderBookingPage(route: string, client: MockBackend) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
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

describe('propagação da configuração do gerenciador', () => {
  it('mostra no agendamento uma disciplina e uma turma customizadas', async () => {
    const user = userEvent.setup();
    const client = new MockBackend({ latencyMs: 0 });

    await updateConfiguration(client, (configuration) => ({
      ...configuration,
      subjects: [
        ...configuration.subjects,
        {
          id: 'subject-applied-robotics',
          label: 'Robótica Aplicada',
          order: configuration.subjects.length + 1,
          active: true,
        },
      ],
      classGroups: [
        ...configuration.classGroups,
        {
          id: 'class-innovation-club',
          label: 'Clube de Inovação',
          gradeId: 'other',
          studentCount: 18,
          order: configuration.classGroups.length + 1,
          active: true,
        },
      ],
    }));

    renderBookingPage('/agendar?lab=LAB02', client);

    const subject = await screen.findByLabelText(/Disciplina/i);
    const classGroup = screen.getByLabelText(/Turma/i);
    const customSubject = screen.getByRole('option', { name: 'Robótica Aplicada' });
    const customClassGroup = screen.getByRole('option', { name: 'Clube de Inovação' });

    expect(customSubject).toHaveValue('subject-applied-robotics');
    expect(customClassGroup).toHaveValue('class-innovation-club');

    await user.selectOptions(subject, customSubject);
    await user.selectOptions(classGroup, customClassGroup);
    expect(subject).toHaveValue('subject-applied-robotics');
    expect(classGroup).toHaveValue('class-innovation-club');
  });

  it('remove um turno desativado da disponibilidade e do formulário', async () => {
    const client = new MockBackend({ latencyMs: 0 });
    const wednesday = getSchoolWeek(new Date(2099, 0, 5))[2]!.isoDate;

    await updateConfiguration(client, (configuration) => ({
      ...configuration,
      shifts: configuration.shifts.map((shift) =>
        shift.id === 'NIGHT' ? { ...shift, active: false } : shift,
      ),
    }));

    const availability = await client.getAvailability({
      laboratoryId: 'LAB02',
      date: wednesday,
    });
    expect(availability.periods.some((period) => period.shiftId === 'NIGHT')).toBe(false);
    expect(availability.periods.some((period) => period.shiftId === 'MORNING')).toBe(true);
    expect(availability.periods.some((period) => period.shiftId === 'AFTERNOON')).toBe(true);

    renderBookingPage(`/agendar?lab=LAB02&date=${wednesday}`, client);

    const periodFieldset = await screen.findByRole('group', { name: /Aulas desejadas/i });
    expect(await within(periodFieldset).findByRole('group', { name: 'Manhã' })).toBeInTheDocument();
    expect(await within(periodFieldset).findByRole('group', { name: 'Tarde' })).toBeInTheDocument();
    expect(within(periodFieldset).queryByRole('group', { name: 'Noite' })).not.toBeInTheDocument();
  });
});
