import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const routeTitles: Record<string, string> = {
  '/': 'Início',
  '/reservar': 'Nova reserva',
  '/disponibilidade': 'Consultar agenda',
  '/minhas-reservas': 'Minhas reservas',
  '/admin': 'Administração',
  '/configuracao-inicial': 'Configuração inicial',
};

export function RouteFocus() {
  const location = useLocation();

  useEffect(() => {
    const pageTitle = routeTitles[location.pathname] ?? 'Página não encontrada';
    document.title = `${pageTitle} | Lab Reserva`;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('main h1')?.focus();
      window.scrollTo({ top: 0, behavior: 'auto' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  return null;
}
