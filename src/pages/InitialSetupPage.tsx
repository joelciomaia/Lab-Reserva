import { ArrowLeft, Info, School } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, PageHeader, StatusBadge } from '../components';
import styles from './Pages.module.css';

const setupSteps = [
  ['Escola', 'Identidade, contato, ano letivo e fuso horário.'],
  ['Laboratórios', 'Espaços, capacidades e modalidades de uso.'],
  ['Horários', 'Turnos, aulas e intervalos da rotina escolar.'],
  ['Recursos', 'Materiais, quantidades e locais de armazenamento.'],
  ['Professores', 'Pessoas autorizadas e perfis de acesso.'],
  ['Regras', 'Conflitos, recorrência, prazos e capacidade.'],
  ['Google Agenda', 'Calendários dos laboratórios e teste da integração.'],
  ['Relatório da SED', 'Integração opcional e desativada por padrão.'],
  ['Conclusão', 'Revisão, links e QR Codes para publicação.'],
] as const;

export function InitialSetupPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Assistente de implantação"
        title="Configuração inicial"
        description="Nove etapas curtas para adaptar o mesmo sistema à realidade de cada escola."
        actions={
          <Link className={styles.textLink} to="/admin">
            <ArrowLeft size={18} aria-hidden="true" /> Voltar ao painel
          </Link>
        }
      />

      <div className={styles.phaseNote}>
        <Info size={22} aria-hidden="true" />
        <p>
          A estrutura visual do assistente já está definida. A criação automática da planilha e a
          gravação dos formulários pertencem à Fase 3.
        </p>
      </div>

      <section className={styles.section} aria-labelledby="setup-steps-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="setup-steps-title">Etapas da configuração</h2>
            <p>O progresso será salvo entre as etapas quando o backend estiver conectado.</p>
          </div>
          <StatusBadge tone="info">Etapa 1 de 9</StatusBadge>
        </div>

        <ol className={styles.setupGrid}>
          {setupSteps.map(([title, description], index) => (
            <li key={title} style={{ listStyle: 'none' }}>
              <Card className={`${styles.setupCard} ${index === 0 ? styles.setupCardCurrent : ''}`}>
                <span className={styles.setupNumber} aria-hidden="true">
                  {index === 0 ? <School size={21} /> : index + 1}
                </span>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
