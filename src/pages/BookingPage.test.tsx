import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from '../app/App';
import { MockBackend } from '../services/mockBackend';

function renderBookingPage() {
  return render(
    <MemoryRouter
      initialEntries={['/reservar']}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App client={new MockBackend({ latencyMs: 0 })} />
    </MemoryRouter>,
  );
}

describe('BookingPage', () => {
  it('exibe mensagens claras para campos obrigatórios', async () => {
    const user = userEvent.setup();
    renderBookingPage();
    await screen.findByRole('heading', { name: 'Nova reserva' });

    await user.click(screen.getByRole('button', { name: /revisar reserva/i }));

    expect(await screen.findByText('Turma é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('Disciplina é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('Finalidade é obrigatório.')).toBeInTheDocument();
    expect(screen.getByText('Selecione pelo menos um horário.')).toBeInTheDocument();
  });

  it('completa o fluxo demonstrativo com consulta e confirmação', async () => {
    const user = userEvent.setup();
    renderBookingPage();
    await screen.findByRole('heading', { name: 'Nova reserva' });

    await user.click(screen.getByRole('button', { name: /consultar horários/i }));
    const availablePeriods = await screen.findAllByRole('checkbox', { name: /1ª aula/i });
    await user.click(availablePeriods[0]!);
    await user.type(screen.getByRole('textbox', { name: 'Turma' }), '9º A');
    await user.type(screen.getByRole('textbox', { name: 'Disciplina' }), 'Ciências');
    await user.type(
      screen.getByRole('textbox', { name: 'Finalidade' }),
      'Pesquisa orientada sobre energia',
    );
    await user.click(screen.getByRole('button', { name: /revisar reserva/i }));

    expect(
      await screen.findByRole('heading', { name: /confira antes de confirmar/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(
      await screen.findByRole('heading', { name: /tudo certo para a sua aula/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/RES-2026-0043/)).toBeInTheDocument();
  });
});
