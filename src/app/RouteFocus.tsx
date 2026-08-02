import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { hasPublicAgendaContext } from './publicAgendaContext';

const routeTitles: Record<string, string> = {
  '/': 'Agenda semanal',
  '/agendar': 'Fazer agendamento',
};

export function RouteFocus() {
  const location = useLocation();

  useEffect(() => {
    const isLandingPage =
      location.pathname === '/' && !hasPublicAgendaContext(location.search, window.location.search);
    const pageTitle = isLandingPage
      ? 'Início'
      : location.pathname.startsWith('/gerenciar')
        ? 'Painel do gerenciador'
        : (routeTitles[location.pathname] ?? 'Agenda semanal');
    document.title = `${pageTitle} | Lab Reserva`;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main h1')?.focus();
      window.scrollTo({ top: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.search]);

  return null;
}
