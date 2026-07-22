import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  Plus,
  Settings,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, ErrorMessage, Loading } from '../components';
import { LaboratoryCard } from '../features/laboratories/LaboratoryCard';
import { useBootstrap } from '../app/BootstrapContext';
import styles from './Pages.module.css';

export function HomePage() {
  const { data, error, isLoading, reload } = useBootstrap();

  if (isLoading && !data) {
    return (
      <div className={styles.page} aria-busy="true">
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>
              <Sparkles size={18} aria-hidden="true" /> Lab Reserva
            </span>
            <h1 tabIndex={-1}>Preparando seus laboratórios…</h1>
            <p>Estamos carregando os espaços, materiais e horários da escola.</p>
          </div>
          <Loading label="Carregando dados da escola" />
        </section>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={styles.page}>
        <h1 tabIndex={-1}>Lab Reserva</h1>
        <ErrorMessage
          title="Não foi possível abrir o sistema"
          action={<Button onClick={reload}>Tentar novamente</Button>}
        >
          {error.message}
        </ErrorMessage>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const firstName = data.currentUser?.name.split(' ')[0] ?? 'professor';
  const canAccessAdministration =
    data.currentUser?.role === 'ADMINISTRATOR' || data.currentUser?.role === 'LAB_TECHNICIAN';

  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.heroCopy}>
          <span className={styles.heroEyebrow}>
            <Sparkles size={18} aria-hidden="true" /> {data.school.name}
          </span>
          <h1 id="welcome-title" tabIndex={-1}>
            Olá, {firstName}. Qual espaço vai transformar sua próxima aula?
          </h1>
          <p>Reserve laboratórios e materiais em poucos passos, com os horários sempre à mão.</p>
        </div>
        <div className={styles.heroActions}>
          <Link className={styles.primaryLink} to="/reservar">
            <Plus size={20} aria-hidden="true" /> Nova reserva
          </Link>
          <Link className={styles.secondaryLink} to="/disponibilidade">
            <CalendarDays size={20} aria-hidden="true" /> Consultar agenda
          </Link>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="quick-actions-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="quick-actions-title">Acesso rápido</h2>
            <p>As tarefas mais usadas estão sempre a um toque de distância.</p>
          </div>
        </div>
        <div className={styles.quickGrid}>
          <Link to="/reservar" className={styles.quickCard}>
            <Card className={styles.quickCard}>
              <span className={styles.quickIcon} aria-hidden="true">
                <ClipboardCheck size={23} />
              </span>
              <strong>Nova reserva</strong>
              <p>Escolha espaço, data e horários.</p>
            </Card>
          </Link>
          <Link to="/disponibilidade" className={styles.quickCard}>
            <Card className={styles.quickCard}>
              <span className={styles.quickIcon} aria-hidden="true">
                <CalendarDays size={23} />
              </span>
              <strong>Consultar agenda</strong>
              <p>Veja os períodos livres de cada laboratório.</p>
            </Card>
          </Link>
          <Link to="/minhas-reservas" className={styles.quickCard}>
            <Card className={styles.quickCard}>
              <span className={styles.quickIcon} aria-hidden="true">
                <UserRound size={23} />
              </span>
              <strong>Minhas reservas</strong>
              <p>Acompanhe seus próximos agendamentos.</p>
            </Card>
          </Link>
          {canAccessAdministration ? (
            <Link to="/admin" className={styles.quickCard}>
              <Card className={styles.quickCard}>
                <span className={styles.quickIcon} aria-hidden="true">
                  <Settings size={23} />
                </span>
                <strong>Administração</strong>
                <p>Configurações para equipe autorizada.</p>
              </Card>
            </Link>
          ) : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="laboratories-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="laboratories-title">Laboratórios da escola</h2>
            <p>Confira a situação geral antes de escolher o melhor espaço.</p>
          </div>
          <Link className={styles.textLink} to="/disponibilidade">
            Ver agenda completa <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.laboratoryGrid}>
          {data.laboratories.map((laboratory) => (
            <LaboratoryCard key={laboratory.id} laboratory={laboratory} />
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="notices-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="notices-title">Avisos importantes</h2>
            <p>Informações recentes da equipe de laboratórios.</p>
          </div>
        </div>
        <div className={styles.noticeList}>
          {data.notices.map((notice) => (
            <article
              key={notice.id}
              className={`${styles.notice} ${notice.tone === 'warning' ? styles.noticeWarning : ''}`}
            >
              {notice.tone === 'warning' ? (
                <AlertTriangle size={21} aria-hidden="true" />
              ) : (
                <CircleHelp size={21} aria-hidden="true" />
              )}
              <div>
                <strong>{notice.title}</strong>
                <p>{notice.message}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
