import { CalendarX2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  AdminConfiguration,
  CancelReservationPeriodsRequest,
  ManagedReservation,
  ReservationCancellation,
  ReservationStatus,
} from '../../types';
import { Button, ErrorMessage, Loading } from '../../components';
import controlStyles from '../../components/FormField/Control.module.css';
import { formatDatePtBr } from '../../utils/dates';
import styles from './ManagerReservations.module.css';

const STATUS_LABELS: Readonly<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Confirmado',
  PARTIALLY_CANCELLED: 'Parcialmente cancelado',
  CANCELLED: 'Cancelado',
};

type StatusFilter = ReservationStatus | 'ALL';

export interface ManagerReservationsProps {
  configuration: AdminConfiguration;
  loadReservations: () => Promise<ManagedReservation[]>;
  cancelReservationPeriods: (request: CancelReservationPeriodsRequest) => Promise<unknown>;
}

interface ReservationCardProps {
  reservation: ManagedReservation;
  cancelledBy: string;
  disabled: boolean;
  onCancel: (request: CancelReservationPeriodsRequest) => Promise<void>;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.trim() || 'Não informado';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function displayValue(value: string): string {
  return value.trim() || 'Não informado';
}

function getCancellationActor(configuration: AdminConfiguration, laboratoryId: string): string {
  const settings = configuration.laboratorySettings.find(
    (candidate) => candidate.laboratoryId === laboratoryId,
  );

  const responsibleName = settings?.responsibleName.trim();
  if (responsibleName) {
    return responsibleName;
  }

  const responsibleEmail = settings?.responsibleEmail.trim();
  if (responsibleEmail) {
    return responsibleEmail;
  }

  return 'Laboratorista autenticado';
}

function getLaboratoryOptions(
  configuration: AdminConfiguration,
  reservations: readonly ManagedReservation[],
): { id: string; name: string }[] {
  const laboratories = new Map(
    configuration.laboratories.map((laboratory) => [laboratory.id, laboratory.name] as const),
  );

  reservations.forEach((reservation) => {
    if (!laboratories.has(reservation.laboratoryId)) {
      laboratories.set(reservation.laboratoryId, reservation.laboratoryName);
    }
  });

  return [...laboratories].map(([id, name]) => ({ id, name }));
}

function CancellationDetails({ cancellation }: { cancellation: ReservationCancellation }) {
  return (
    <p className={styles.cancellationDetails}>
      Cancelada em {formatTimestamp(cancellation.cancelledAt)} por {cancellation.cancelledBy}.
      {cancellation.reason.trim() ? ` Motivo: ${cancellation.reason.trim()}` : ''}
    </p>
  );
}

function ReservationCard({ reservation, cancelledBy, disabled, onCancel }: ReservationCardProps) {
  const headingId = useId();
  const reasonId = useId();
  const [selectedPeriodIds, setSelectedPeriodIds] = useState<ReadonlySet<string>>(() => new Set());
  const [reason, setReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const activePeriodIds = useMemo(
    () =>
      reservation.periodIds.filter((periodId) => reservation.activePeriodIds.includes(periodId)),
    [reservation.activePeriodIds, reservation.periodIds],
  );
  const cancelledPeriodIds = useMemo(
    () => new Set(reservation.cancelledPeriodIds),
    [reservation.cancelledPeriodIds],
  );
  const selectedActivePeriodIds = useMemo(() => {
    const activeIds = new Set(activePeriodIds);
    return new Set([...selectedPeriodIds].filter((periodId) => activeIds.has(periodId)));
  }, [activePeriodIds, selectedPeriodIds]);
  const allActivePeriodsSelected =
    activePeriodIds.length > 0 &&
    activePeriodIds.every((periodId) => selectedActivePeriodIds.has(periodId));

  function togglePeriod(periodId: string, selected: boolean) {
    setSelectedPeriodIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(periodId);
      } else {
        next.delete(periodId);
      }
      return next;
    });
    setCancelError('');
    setSuccessMessage('');
  }

  function toggleAllActivePeriods() {
    setSelectedPeriodIds(allActivePeriodsSelected ? new Set() : new Set(activePeriodIds));
    setCancelError('');
    setSuccessMessage('');
  }

  async function cancelSelectedPeriods() {
    const periodIds = reservation.periodIds.filter((periodId) =>
      selectedActivePeriodIds.has(periodId),
    );
    if (periodIds.length === 0) {
      return;
    }

    const allRemainingPeriods = periodIds.length === activePeriodIds.length;
    const confirmation = allRemainingPeriods
      ? `Desagendar todas as ${periodIds.length} aulas ativas da reserva de ${reservation.teacherName}?`
      : `Desagendar ${periodIds.length} aula${periodIds.length === 1 ? '' : 's'} da reserva de ${reservation.teacherName}?`;

    if (!window.confirm(`${confirmation} Os horários selecionados serão liberados.`)) {
      return;
    }

    setIsCancelling(true);
    setCancelError('');
    setSuccessMessage('');

    try {
      await onCancel({
        reservationId: reservation.id,
        periodIds,
        cancelledBy,
        reason: reason.trim(),
      });
      setSelectedPeriodIds(new Set());
      setReason('');
      setSuccessMessage(
        periodIds.length === 1
          ? 'Aula desagendada com sucesso.'
          : 'Aulas desagendadas com sucesso.',
      );
    } catch (error: unknown) {
      setCancelError(getErrorMessage(error, 'Não foi possível desagendar as aulas selecionadas.'));
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <article className={styles.reservationCard} aria-labelledby={headingId}>
      <header className={styles.reservationHeader}>
        <div>
          <p className={styles.reservationDate}>{formatDatePtBr(reservation.date)}</p>
          <h3 id={headingId}>{reservation.teacherName}</h3>
          <p>
            {reservation.subject} · {reservation.classGroup}
          </p>
        </div>
        <span className={`${styles.statusBadge} ${styles[reservation.status]}`}>
          {STATUS_LABELS[reservation.status]}
        </span>
      </header>

      <dl className={styles.details}>
        <div>
          <dt>Laboratório</dt>
          <dd>{reservation.laboratoryName}</dd>
        </div>
        <div>
          <dt>Código da reserva</dt>
          <dd>{reservation.id}</dd>
        </div>
        <div>
          <dt>Objetos de conhecimento</dt>
          <dd>{displayValue(reservation.knowledgeObjects)}</dd>
        </div>
        <div>
          <dt>Itens e recursos</dt>
          <dd>{displayValue(reservation.itemsUsed)}</dd>
        </div>
        <div>
          <dt>Observações</dt>
          <dd>{displayValue(reservation.notes)}</dd>
        </div>
        <div>
          <dt>Criada em</dt>
          <dd>{formatTimestamp(reservation.createdAt)}</dd>
        </div>
      </dl>

      <fieldset className={styles.periodFieldset} disabled={disabled || isCancelling}>
        <legend>Aulas e horários</legend>
        <ul className={styles.periodList}>
          {reservation.periodIds.map((periodId, index) => {
            const configuredLabel = reservation.periodLabels[index]?.trim();
            const configuredTime = reservation.periodTimes[index]?.trim();
            let periodLabel = periodId;
            let periodTime = 'Horário não informado';
            if (configuredLabel) {
              periodLabel = configuredLabel;
            }
            if (configuredTime) {
              periodTime = configuredTime;
            }
            const isActive = reservation.activePeriodIds.includes(periodId);
            const isCancelled = cancelledPeriodIds.has(periodId) || !isActive;
            const cancellation = reservation.cancellations.find(
              (candidate) => candidate.periodId === periodId,
            );

            return (
              <li
                key={periodId}
                className={`${styles.periodItem} ${isCancelled ? styles.cancelledPeriod : ''}`}
              >
                <div className={styles.periodRow}>
                  {isActive ? (
                    <label className={styles.periodSelection}>
                      <input
                        type="checkbox"
                        checked={selectedActivePeriodIds.has(periodId)}
                        onChange={(event) => togglePeriod(periodId, event.currentTarget.checked)}
                        aria-label={`Selecionar ${periodLabel} de ${reservation.teacherName}`}
                      />
                      <span>
                        <strong>{periodLabel}</strong>
                        <small>{periodTime}</small>
                      </span>
                    </label>
                  ) : (
                    <div className={styles.periodSelection}>
                      <span className={styles.cancelledMark} aria-hidden="true">
                        ×
                      </span>
                      <span>
                        <strong>{periodLabel}</strong>
                        <small>{periodTime}</small>
                      </span>
                    </div>
                  )}
                  <span className={isCancelled ? styles.cancelledLabel : styles.activeLabel}>
                    {isCancelled ? 'Cancelada' : 'Ativa'}
                  </span>
                </div>
                {cancellation ? <CancellationDetails cancellation={cancellation} /> : null}
              </li>
            );
          })}
        </ul>

        {activePeriodIds.length > 0 ? (
          <div className={styles.cancellationControls}>
            <Button size="small" variant="ghost" onClick={toggleAllActivePeriods}>
              {allActivePeriodsSelected ? 'Limpar seleção' : 'Selecionar todas as aulas ativas'}
            </Button>
            <label className={styles.reasonField} htmlFor={reasonId}>
              Motivo do cancelamento (opcional)
              <textarea
                id={reasonId}
                className={controlStyles.control}
                value={reason}
                rows={2}
                maxLength={500}
                onChange={(event) => setReason(event.currentTarget.value)}
              />
            </label>
            <Button
              variant="danger"
              disabled={selectedActivePeriodIds.size === 0}
              isLoading={isCancelling}
              loadingLabel="Desagendando…"
              onClick={() => void cancelSelectedPeriods()}
            >
              <CalendarX2 size={17} aria-hidden="true" />
              {selectedActivePeriodIds.size === activePeriodIds.length &&
              selectedActivePeriodIds.size > 0
                ? 'Desagendar todas as aulas ativas'
                : `Desagendar ${selectedActivePeriodIds.size} aula${selectedActivePeriodIds.size === 1 ? '' : 's'}`}
            </Button>
          </div>
        ) : null}
      </fieldset>

      {successMessage ? (
        <p className={styles.successMessage} role="status">
          {successMessage}
        </p>
      ) : null}
      {cancelError ? (
        <p className={styles.cancelError} role="alert">
          {cancelError}
        </p>
      ) : null}
    </article>
  );
}

export function ManagerReservations({
  configuration,
  loadReservations,
  cancelReservationPeriods,
}: ManagerReservationsProps) {
  const requestSequence = useRef(0);
  const [reservations, setReservations] = useState<ManagedReservation[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [laboratoryFilter, setLaboratoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const refreshReservations = useCallback(async (): Promise<void> => {
    const requestId = ++requestSequence.current;
    setIsLoading(true);
    setLoadError('');

    try {
      const loadedReservations = await loadReservations();
      if (requestId === requestSequence.current) {
        setReservations(loadedReservations);
      }
    } catch (error: unknown) {
      if (requestId === requestSequence.current) {
        setLoadError(getErrorMessage(error, 'Não foi possível carregar os agendamentos.'));
      }
    } finally {
      if (requestId === requestSequence.current) {
        setIsLoading(false);
      }
    }
  }, [loadReservations]);

  useEffect(() => {
    const initialLoadTimer = window.setTimeout(() => void refreshReservations(), 0);
    return () => {
      window.clearTimeout(initialLoadTimer);
      requestSequence.current += 1;
    };
  }, [refreshReservations]);

  const laboratoryOptions = useMemo(
    () => getLaboratoryOptions(configuration, reservations ?? []),
    [configuration, reservations],
  );
  const filteredReservations = useMemo(
    () =>
      (reservations ?? [])
        .filter(
          (reservation) =>
            (laboratoryFilter === 'ALL' || reservation.laboratoryId === laboratoryFilter) &&
            (statusFilter === 'ALL' || reservation.status === statusFilter),
        )
        .toSorted((left, right) => {
          const dateOrder = right.date.localeCompare(left.date);
          return dateOrder === 0 ? right.createdAt.localeCompare(left.createdAt) : dateOrder;
        }),
    [laboratoryFilter, reservations, statusFilter],
  );

  async function cancelAndReload(request: CancelReservationPeriodsRequest): Promise<void> {
    await cancelReservationPeriods(request);
    await refreshReservations();
  }

  return (
    <section className={styles.managerReservations} aria-busy={isLoading}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Controle da agenda</p>
          <h2>Agendamentos</h2>
          <p>Consulte os dados completos e desagende somente as aulas necessárias.</p>
        </div>
        <Button
          variant="secondary"
          isLoading={isLoading && reservations !== null}
          loadingLabel="Atualizando…"
          onClick={() => void refreshReservations()}
        >
          <RefreshCw size={17} aria-hidden="true" />
          Atualizar agendamentos
        </Button>
      </header>

      {reservations !== null ? (
        <div className={styles.filters} aria-label="Filtros dos agendamentos">
          <label>
            Laboratório
            <span className={controlStyles.selectContainer}>
              <select
                className={`${controlStyles.control} ${controlStyles.select}`}
                value={laboratoryFilter}
                onChange={(event) => setLaboratoryFilter(event.currentTarget.value)}
              >
                <option value="ALL">Todos os laboratórios</option>
                {laboratoryOptions.map((laboratory) => (
                  <option key={laboratory.id} value={laboratory.id}>
                    {laboratory.name}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <label>
            Situação
            <span className={controlStyles.selectContainer}>
              <select
                className={`${controlStyles.control} ${controlStyles.select}`}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}
              >
                <option value="ALL">Todas as situações</option>
                <option value="CONFIRMED">Confirmados</option>
                <option value="PARTIALLY_CANCELLED">Parcialmente cancelados</option>
                <option value="CANCELLED">Cancelados</option>
              </select>
            </span>
          </label>
        </div>
      ) : null}

      {isLoading && reservations === null ? (
        <Loading label="Carregando agendamentos…" size="large" />
      ) : null}

      {!isLoading && loadError ? (
        <ErrorMessage
          title="Não foi possível carregar os agendamentos"
          action={
            <Button variant="secondary" onClick={() => void refreshReservations()}>
              Tentar novamente
            </Button>
          }
        >
          {loadError}
        </ErrorMessage>
      ) : null}

      {!isLoading && !loadError && reservations?.length === 0 ? (
        <div className={styles.emptyState}>
          <CalendarX2 size={30} aria-hidden="true" />
          <h3>Nenhum agendamento registrado</h3>
          <p>As reservas salvas no Google Sheets aparecerão aqui.</p>
        </div>
      ) : null}

      {!loadError && reservations && reservations.length > 0 ? (
        <>
          <p className={styles.resultCount} role="status">
            {filteredReservations.length}{' '}
            {filteredReservations.length === 1
              ? 'agendamento encontrado'
              : 'agendamentos encontrados'}
          </p>
          {filteredReservations.length > 0 ? (
            <div className={styles.reservationList}>
              {filteredReservations.map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={reservation}
                  cancelledBy={getCancellationActor(configuration, reservation.laboratoryId)}
                  disabled={isLoading}
                  onCancel={cancelAndReload}
                />
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <h3>Nenhum resultado para estes filtros</h3>
              <p>Altere o laboratório ou a situação selecionada.</p>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
