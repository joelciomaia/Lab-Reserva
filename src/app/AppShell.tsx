import { CalendarDays, FlaskConical, Home, Plus, Settings, UserRound } from 'lucide-react';
import type { PropsWithChildren, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useBootstrap } from './BootstrapContext';
import styles from './AppShell.module.css';

interface NavigationItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const navigationItems: NavigationItem[] = [
  { to: '/', label: 'Início', icon: <Home size={20} aria-hidden="true" /> },
  { to: '/reservar', label: 'Reservar', icon: <Plus size={20} aria-hidden="true" /> },
  {
    to: '/disponibilidade',
    label: 'Agenda',
    icon: <CalendarDays size={20} aria-hidden="true" />,
  },
  {
    to: '/minhas-reservas',
    label: 'Minhas reservas',
    icon: <UserRound size={20} aria-hidden="true" />,
  },
];

function navigationClassName({ isActive }: { isActive: boolean }) {
  return `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`;
}

export function AppShell({ children }: PropsWithChildren) {
  const { data, isLoading } = useBootstrap();
  const canAccessAdministration =
    data?.currentUser?.role === 'ADMINISTRATOR' || data?.currentUser?.role === 'LAB_TECHNICIAN';

  function skipToContent() {
    document.getElementById('main-content')?.focus();
  }

  return (
    <div className={styles.shell}>
      <button className="skipLink" type="button" onClick={skipToContent}>
        Pular para o conteúdo
      </button>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <NavLink to="/" className={styles.brand ?? ''} aria-label="Lab Reserva — início">
            <span className={styles.brandMark} aria-hidden="true">
              <FlaskConical size={25} />
            </span>
            <span>
              <strong>Lab Reserva</strong>
              <small>{isLoading ? 'Carregando escola…' : data?.school.name}</small>
            </span>
          </NavLink>

          <nav className={styles.desktopNavigation} aria-label="Navegação principal">
            {navigationItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={navigationClassName}
                end={item.to === '/'}
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {canAccessAdministration ? (
            <NavLink
              className={styles.adminLink ?? ''}
              to="/admin"
              aria-label="Abrir administração"
            >
              <Settings size={20} aria-hidden="true" />
              <span>Administração</span>
            </NavLink>
          ) : null}
        </div>
      </header>

      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>

      <footer className={styles.footer}>
        <div>
          <strong>Lab Reserva</strong>
          <span>Organização simples para espaços que inspiram.</span>
        </div>
        <span>
          Versão {window.APP_BOOTSTRAP?.applicationVersion ?? '0.1.0 — demonstração local'}
        </span>
      </footer>

      <nav className={styles.mobileNavigation} aria-label="Navegação principal">
        {navigationItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={navigationClassName} end={item.to === '/'}>
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
