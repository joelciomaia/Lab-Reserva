import {
  ArrowRight,
  CalendarCheck2,
  Check,
  FileSpreadsheet,
  LogIn,
  QrCode,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { DeveloperCredit } from '../components';
import styles from './LandingPage.module.css';

const LOGIN_PATH = '/gerenciar/entrar';

const steps = [
  {
    number: '01',
    icon: LogIn,
    title: 'Entre com a conta da escola',
    description: 'O laboratorista autoriza somente os arquivos que o Reserva Fácil cria ou utiliza.',
  },
  {
    number: '02',
    icon: FileSpreadsheet,
    title: 'A planilha nasce pronta',
    description:
      'O aplicativo cria ou recupera o Google Sheets e mantém configurações e reservas organizadas.',
  },
  {
    number: '03',
    icon: QrCode,
    title: 'Compartilhe o laboratório',
    description:
      'Depois dos dados principais, o link e o QR Code ficam prontos para professores acessarem.',
  },
] as const;

const features = [
  {
    icon: CalendarCheck2,
    title: 'Agenda realmente conectada',
    description: 'Horários e reservas vêm da planilha da escola, sem dados demonstrativos.',
  },
  {
    icon: ShieldCheck,
    title: 'Conflitos bloqueados',
    description: 'Antes de reservar, o horário é conferido novamente para evitar duplicidade.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Histórico preservado',
    description:
      'O estado atual fica na reserva e cada cancelamento continua registrado para auditoria.',
  },
] as const;

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ProductPreview() {
  return (
    <div className={styles.productStage} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.previewWindow}>
        <div className={styles.previewToolbar}>
          <span />
          <span />
          <span />
          <strong>Agenda do laboratório</strong>
        </div>
        <div className={styles.previewBody}>
          <div className={styles.previewHeading}>
            <div>
              <small>Semana letiva</small>
              <strong>Laboratório disponível</strong>
            </div>
            <span>Agendar aula</span>
          </div>
          <div className={styles.schedulePreview}>
            <div className={styles.scheduleCorner} />
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((day) => (
              <div className={styles.scheduleDay} key={day}>
                {day}
              </div>
            ))}
            {Array.from({ length: 5 }, (_, row) => (
              <div className={styles.scheduleRow} key={row}>
                <div className={styles.scheduleTime}>{`${row + 1}ª`}</div>
                {Array.from({ length: 5 }, (_, column) => {
                  const reserved = (row === 1 && column === 1) || (row === 3 && column === 3);
                  return (
                    <div
                      className={reserved ? styles.scheduleReserved : styles.scheduleFree}
                      key={column}
                    >
                      {reserved ? 'Reservado' : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={`${styles.floatingCard} ${styles.sheetCard}`}>
        <span className={styles.floatingIcon}>
          <FileSpreadsheet size={22} />
        </span>
        <span>
          <small>Google Sheets</small>
          <strong>Conectado</strong>
        </span>
        <Check className={styles.floatingCheck} size={18} />
      </div>

      <div className={`${styles.floatingCard} ${styles.qrCard}`}>
        <QrCode size={42} strokeWidth={1.7} />
        <span>
          <small>Acesso público</small>
          <strong>QR Code pronto</strong>
        </span>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} to="/" aria-label="Reserva Fácil — início">
            <span className={styles.brandMark} aria-hidden="true">
              <CalendarCheck2 size={21} />
            </span>
            Reserva Fácil
          </Link>

          <nav className={styles.navigation} aria-label="Navegação da apresentação">
            <button type="button" onClick={() => scrollToSection('como-funciona')}>
              Como funciona
            </button>
            <button type="button" onClick={() => scrollToSection('recursos')}>
              Recursos
            </button>
          </nav>

          <Link className={styles.headerAction} to={LOGIN_PATH}>
            Acessar
          </Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>
            <Sparkles size={16} aria-hidden="true" />
            Reservas de laboratórios escolares
          </p>
          <h1 id="landing-title" tabIndex={-1}>
            Organize o laboratório.
            <span>Compartilhe o acesso. Pronto.</span>
          </h1>
          <p className={styles.heroDescription}>
            Uma agenda simples para o laboratorista configurar horários e para professores
            reservarem aulas pelo link ou QR Code da escola.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryAction} to={LOGIN_PATH}>
              Começar configuração
              <ArrowRight size={19} aria-hidden="true" />
            </Link>
            <button
              className={styles.secondaryAction}
              type="button"
              onClick={() => scrollToSection('como-funciona')}
            >
              Ver como funciona
            </button>
          </div>
          <p className={styles.heroNote}>
            Entre com a conta Google institucional. A planilha é preparada automaticamente.
          </p>
        </div>
        <ProductPreview />
      </section>

      <section className={styles.stepsSection} id="como-funciona" aria-labelledby="steps-title">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionEyebrow}>Comece sem complicação</p>
          <h2 id="steps-title">Uma implantação. Cada escola segue o próprio caminho.</h2>
          <p>
            Você disponibiliza o sistema uma vez. Depois, cada laboratorista entra, configura sua
            escola e começa a usar.
          </p>
        </div>

        <ol className={styles.stepsList}>
          {steps.map(({ number, icon: Icon, title, description }) => (
            <li key={number}>
              <div className={styles.stepMeta}>
                <span>{number}</span>
                <Icon size={26} aria-hidden="true" />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.sheetSection} aria-labelledby="sheet-title">
        <div className={styles.sheetSectionInner}>
          <div className={styles.sheetCopy}>
            <p className={styles.sectionEyebrow}>A fonte continua sendo da escola</p>
            <h2 id="sheet-title">Tudo registrado no Google Sheets.</h2>
            <p>
              Configurações, horários, reservas e cancelamentos ficam organizados na planilha criada
              na conta autorizada.
            </p>
            <ul>
              <li>
                <Check size={18} aria-hidden="true" /> Sem agendamentos fictícios
              </li>
              <li>
                <Check size={18} aria-hidden="true" /> Cancelamento por aula ou reserva completa
              </li>
              <li>
                <Check size={18} aria-hidden="true" /> Um acesso público para cada laboratório
              </li>
            </ul>
          </div>

          <div className={styles.sheetVisual} aria-hidden="true">
            <div className={styles.sheetVisualHeader}>
              <span className={styles.sheetVisualIcon}>
                <FileSpreadsheet size={25} />
              </span>
              <span>
                <small>Planilha da escola</small>
                <strong>Reserva Fácil</strong>
              </span>
              <span className={styles.liveBadge}>Sincronizada</span>
            </div>
            <div className={styles.sheetTabs}>
              <span>CONFIGURAÇÕES</span>
              <span>LABORATÓRIOS</span>
              <span>RESERVAS</span>
            </div>
            <div className={styles.sheetGrid}>
              {Array.from({ length: 30 }, (_, index) => (
                <span
                  className={index === 1 || index === 7 || index === 18 ? styles.cellActive : ''}
                  key={index}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.featuresSection} id="recursos" aria-labelledby="features-title">
        <div className={styles.sectionIntro}>
          <p className={styles.sectionEyebrow}>Feito para a rotina escolar</p>
          <h2 id="features-title">O necessário para reservar com segurança.</h2>
        </div>
        <div className={styles.featuresGrid}>
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title}>
              <span className={styles.featureIcon}>
                <Icon size={25} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-title">
        <div>
          <p className={styles.sectionEyebrow}>Seu ponto de partida</p>
          <h2 id="final-cta-title">Pronto para configurar o laboratório?</h2>
          <p>Entre com o Google, informe os dados principais e gere o primeiro QR Code.</p>
          <Link className={styles.primaryAction} to={LOGIN_PATH}>
            Acessar como laboratorista
            <ArrowRight size={19} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <span className={styles.footerBrand}>
            <CalendarCheck2 size={19} aria-hidden="true" />
            Reserva Fácil
          </span>
          <p>Agenda de laboratórios conectada ao Google Sheets.</p>
        </div>
        <div className={styles.footerCredits}>
          <span>Feito para simplificar a rotina escolar.</span>
          <DeveloperCredit productName="Reserva Fácil" />
        </div>
      </footer>
    </div>
  );
}
