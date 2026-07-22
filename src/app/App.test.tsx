import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { MockBackend } from '../services/mockBackend';
import { App } from './App';

function renderApp(route = '/', client = new MockBackend({ latencyMs: 0 })) {
  return render(
    <MemoryRouter
      initialEntries={[route]}
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App client={client} />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('mostra a estrutura imediatamente e carrega a escola pelo BackendClient', async () => {
    renderApp('/', new MockBackend({ latencyMs: 10 }));

    expect(
      screen.getByRole('heading', { name: /preparando seus laboratórios/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /olá, ana/i })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /nova reserva/i })).not.toHaveLength(0);
  });

  it('renderiza uma página amigável para rota desconhecida', async () => {
    renderApp('/endereco-inexistente');

    expect(
      await screen.findByRole('heading', { name: /página não encontrada/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voltar ao início/i })).toBeInTheDocument();
  });

  it('oferece nova tentativa quando o bootstrap falha', async () => {
    renderApp('/', new MockBackend({ latencyMs: 0, failBootstrap: true }));

    expect(
      await screen.findByText('Não foi possível carregar os dados da escola.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tentar novamente/i })).toBeInTheDocument();
  });
});
