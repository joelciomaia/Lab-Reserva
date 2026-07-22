import { addDays } from 'date-fns';
import { CalendarSearch, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Card,
  ErrorMessage,
  Input,
  Loading,
  PageHeader,
  Select,
  StatusBadge,
} from '../components';
import { useBootstrap } from '../app/BootstrapContext';
import { AvailabilityList } from '../features/availability/AvailabilityList';
import type { AppError, AvailabilityResponse } from '../types';
import { getFriendlyError } from '../types';
import { formatDatePtBr, formatIsoDate } from '../utils/dates';
import styles from './Pages.module.css';

export function AvailabilityPage() {
  const {
    data,
    client,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    reload,
  } = useBootstrap();
  const [laboratoryId, setLaboratoryId] = useState('');
  const [date, setDate] = useState(() => formatIsoDate(addDays(new Date(), 1)));
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [requestError, setRequestError] = useState<AppError | null>(null);
  const [isQuerying, setIsQuerying] = useState(false);

  const effectiveLaboratoryId =
    laboratoryId.length > 0
      ? laboratoryId
      : (data?.preselectedLaboratoryId ?? data?.laboratories[0]?.id ?? '');

  async function handleSearch() {
    if (!effectiveLaboratoryId || !date) {
      setRequestError({
        code: 'VALIDATION_ERROR',
        message: 'Selecione um laboratório e uma data para consultar.',
      });
      return;
    }

    setIsQuerying(true);
    setRequestError(null);
    try {
      const response = await client.getAvailability({
        laboratoryId: effectiveLaboratoryId,
        date,
      });
      setAvailability(response);
    } catch (error: unknown) {
      setAvailability(null);
      setRequestError(getFriendlyError(error));
    } finally {
      setIsQuerying(false);
    }
  }

  if (isBootstrapLoading && !data) {
    return (
      <div className={styles.page} aria-busy="true">
        <PageHeader title="Consultar agenda" description="Carregando os laboratórios da escola…" />
        <Card className={styles.loadingPanel}>
          <Loading label="Preparando filtros" />
        </Card>
      </div>
    );
  }

  if (bootstrapError && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Consultar agenda" />
        <ErrorMessage action={<Button onClick={reload}>Tentar novamente</Button>}>
          {bootstrapError.message}
        </ErrorMessage>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const selectedLaboratory = data.laboratories.find(
    (laboratory) => laboratory.id === effectiveLaboratoryId,
  );

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Planeje com segurança"
        title="Consultar agenda"
        description="Escolha o laboratório e a data. As reservas só são carregadas quando você solicitar."
      />

      <Card className={styles.filterCard}>
        <div className={styles.filterGrid}>
          <Select
            label="Laboratório"
            value={effectiveLaboratoryId}
            onChange={(event) => {
              setLaboratoryId(event.target.value);
              setAvailability(null);
            }}
          >
            {data.laboratories.map((laboratory) => (
              <option key={laboratory.id} value={laboratory.id}>
                {laboratory.name} — {laboratory.capacity} pessoas
              </option>
            ))}
          </Select>
          <Input
            label="Data da reserva"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setAvailability(null);
            }}
            required
          />
          <Button
            className={styles.filterAction}
            onClick={() => void handleSearch()}
            isLoading={isQuerying}
            loadingLabel="Consultando…"
          >
            <CalendarSearch size={19} aria-hidden="true" /> Consultar
          </Button>
        </div>
        <div className={styles.legend} aria-label="Legenda de disponibilidade">
          <StatusBadge tone="success">Disponível</StatusBadge>
          <StatusBadge tone="warning">Parcial</StatusBadge>
          <StatusBadge tone="danger">Indisponível</StatusBadge>
        </div>
      </Card>

      {requestError ? <ErrorMessage>{requestError.message}</ErrorMessage> : null}

      {availability ? (
        <section className={styles.section} aria-labelledby="availability-results-title">
          <div className={styles.resultsHeader}>
            <div>
              <h2 id="availability-results-title">
                Horários em {formatDatePtBr(availability.date)}
              </h2>
              <p>{selectedLaboratory?.name}</p>
            </div>
            <Button variant="ghost" onClick={() => void handleSearch()} disabled={isQuerying}>
              <RefreshCw size={18} aria-hidden="true" /> Atualizar
            </Button>
          </div>
          <AvailabilityList periods={availability.periods} />
        </section>
      ) : (
        <Card variant="subtle">
          <div className={styles.phaseNote}>
            <CalendarSearch size={22} aria-hidden="true" />
            <p>
              A agenda ainda não foi consultada. Selecione os filtros acima para carregar apenas os
              horários necessários.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
