import {
  CalendarSync,
  Clock3,
  FileClock,
  FlaskConical,
  LayoutDashboard,
  PackageOpen,
  QrCode,
  Settings2,
  ShieldCheck,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, ErrorMessage, Loading, PageHeader, StatusBadge } from '../components';
import { useBootstrap } from '../app/BootstrapContext';
import type { AdminData, AppError } from '../types';
import { getFriendlyError } from '../types';
import styles from './Pages.module.css';

const adminSections = [
  {
    title: 'Laboratórios',
    description: 'Espaços, capacidades e modalidades de uso.',
    icon: <FlaskConical size={22} />,
  },
  {
    title: 'Materiais',
    description: 'Equipamentos reserváveis e disponibilidade.',
    icon: <PackageOpen size={22} />,
  },
  {
    title: 'Professores',
    description: 'Pessoas autorizadas e perfis de acesso.',
    icon: <UsersRound size={22} />,
  },
  {
    title: 'Turnos e horários',
    description: 'Aulas, intervalos e organização dos períodos.',
    icon: <Clock3 size={22} />,
  },
  {
    title: 'Bloqueios e manutenção',
    description: 'Indisponibilidades temporárias dos espaços.',
    icon: <Wrench size={22} />,
  },
  {
    title: 'Links e QR Codes',
    description: 'Acesso geral e atalhos por laboratório.',
    icon: <QrCode size={22} />,
  },
  {
    title: 'Sincronizações',
    description: 'Situação dos eventos no Google Agenda.',
    icon: <CalendarSync size={22} />,
  },
  {
    title: 'Logs do sistema',
    description: 'Histórico das operações críticas.',
    icon: <FileClock size={22} />,
  },
  {
    title: 'Regras de reserva',
    description: 'Antecedência, capacidade e cancelamentos.',
    icon: <Settings2 size={22} />,
  },
];

export function AdminPage() {
  const {
    data,
    client,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    reload,
  } = useBootstrap();
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const isAuthorized =
    data?.currentUser?.role === 'ADMINISTRATOR' || data?.currentUser?.role === 'LAB_TECHNICIAN';

  function retry() {
    setAdminData(null);
    setError(null);
    setRequestVersion((value) => value + 1);
  }

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isCurrentRequest = true;
    void client
      .getAdminData()
      .then((response) => {
        if (isCurrentRequest) {
          setAdminData(response);
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrentRequest) {
          setError(getFriendlyError(requestError));
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [client, isAuthorized, requestVersion]);

  if (isBootstrapLoading && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Administração" description="Validando seu perfil…" />
        <Loading label="Verificando autorização" />
      </div>
    );
  }

  if (bootstrapError && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Administração" />
        <ErrorMessage action={<Button onClick={reload}>Tentar novamente</Button>}>
          {bootstrapError.message}
        </ErrorMessage>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className={styles.page}>
        <PageHeader eyebrow="Área restrita" title="Administração" />
        <ErrorMessage title="Acesso restrito">
          Seu perfil não possui permissão administrativa. A autorização também será validada no
          servidor antes de qualquer operação real.
        </ErrorMessage>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Área restrita"
        title="Administração"
        description="Visão central dos espaços, pessoas e integrações da escola."
        actions={<StatusBadge tone="info">Ambiente demonstrativo</StatusBadge>}
      />

      <div className={styles.phaseNote}>
        <ShieldCheck size={22} aria-hidden="true" />
        <p>
          Nesta primeira fase, o painel usa dados locais para validar a navegação. A autorização
          administrativa obrigatória será conferida no Apps Script antes de qualquer operação real.
        </p>
      </div>

      {error ? (
        <ErrorMessage action={<Button onClick={retry}>Tentar novamente</Button>}>
          {error.message}
        </ErrorMessage>
      ) : null}

      {!adminData && !error ? <Loading label="Carregando resumo administrativo" /> : null}

      {adminData ? (
        <>
          <section className={styles.section} aria-labelledby="admin-summary-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="admin-summary-title">Resumo da escola</h2>
                <p>Indicadores rápidos da configuração demonstrativa.</p>
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <Card className={styles.summaryCard}>
                <span>Laboratórios</span>
                <strong>{adminData.laboratories.length}</strong>
              </Card>
              <Card className={styles.summaryCard}>
                <span>Materiais</span>
                <strong>{adminData.resources.length}</strong>
              </Card>
              <Card className={styles.summaryCard}>
                <span>Professores ativos</span>
                <strong>{adminData.teachers.filter((teacher) => teacher.active).length}</strong>
              </Card>
              <Card className={styles.summaryCard}>
                <span>Reservas ativas</span>
                <strong>{adminData.activeReservations}</strong>
              </Card>
            </div>
          </section>

          <section className={styles.section} aria-labelledby="admin-tools-title">
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="admin-tools-title">Configuração e controle</h2>
                <p>Os módulos serão ativados gradualmente nas próximas fases.</p>
              </div>
            </div>
            <div className={styles.adminGrid}>
              {adminSections.map((section) => (
                <Card key={section.title} className={styles.adminCard}>
                  <span className={styles.adminIcon} aria-hidden="true">
                    {section.icon}
                  </span>
                  <div>
                    <h2>{section.title}</h2>
                    <p>{section.description}</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <Card variant="accent" className={styles.adminCard}>
            <span className={styles.adminIcon} aria-hidden="true">
              <LayoutDashboard size={22} />
            </span>
            <div>
              <h2>Configuração inicial</h2>
              <p>Visualize a estrutura das nove etapas previstas para preparar uma nova escola.</p>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
