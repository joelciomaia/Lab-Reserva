import { addWeeks, isSameWeek, parse, startOfWeek } from 'date-fns';
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useBootstrap } from '../app/BootstrapContext';
import { Button, ErrorMessage, Loading } from '../components';
import { WeeklyCalendar } from '../features/calendar';
import type { AppError, AvailabilityResponse } from '../types';
import { getFriendlyError } from '../types';
import { formatIsoDate } from '../utils/dates';
import { formatWeekRange, getCurrentAgendaReferenceDate, getSchoolWeek } from '../utils/week';
import styles from './WeeklySchedulePage.module.css';

interface ScheduleRouteState {
  reservationId?: string;
  reservationDate?: string;
}

interface WeekRequestState {
  key: string;
  data: AvailabilityResponse[];
  error: AppError | null;
}

function parseReservationDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = parse(value, 'yyyy-MM-dd', new Date());
  return Number.isNaN(date.getTime()) ? null : date;
}

export function WeeklySchedulePage() {
  const {
    data,
    client,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    reload,
  } = useBootstrap();
  const location = useLocation();
  const navigate = useNavigate();
  const routeState = (location.state as ScheduleRouteState | null) ?? null;
  const queryDate = new URLSearchParams(location.search).get('date') ?? undefined;
  const [referenceDate, setReferenceDate] = useState(
    () =>
      parseReservationDate(routeState?.reservationDate) ??
      parseReservationDate(queryDate) ??
      getCurrentAgendaReferenceDate(new Date()),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [weekRequest, setWeekRequest] = useState<WeekRequestState>({
    key: '',
    data: [],
    error: null,
  });
  const [requestVersion, setRequestVersion] = useState(0);

  const queryLaboratoryId = useMemo(
    () => new URLSearchParams(location.search).get('lab') ?? '',
    [location.search],
  );
  const laboratory = useMemo(() => {
    if (!data) {
      return undefined;
    }

    const requestedId = queryLaboratoryId || data.preselectedLaboratoryId;
    return requestedId
      ? data.laboratories.find((candidate) => candidate.id === requestedId)
      : data.laboratories[0];
  }, [data, queryLaboratoryId]);
  const weekDays = useMemo(() => getSchoolWeek(referenceDate), [referenceDate]);
  const weekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const weekLabel = formatWeekRange(weekStart);
  const requestKey = `${laboratory?.id ?? ''}:${weekDays.map((day) => day.isoDate).join(',')}:${requestVersion}`;
  const isLoadingWeek = Boolean(laboratory) && weekRequest.key !== requestKey;
  const weekAvailability = weekRequest.key === requestKey ? weekRequest.data : [];
  const weekError = weekRequest.key === requestKey ? weekRequest.error : null;
  const today = formatIsoDate(new Date());
  const currentAgendaReferenceDate = getCurrentAgendaReferenceDate(new Date());
  const isCurrentWeek = isSameWeek(referenceDate, currentAgendaReferenceDate, {
    weekStartsOn: 1,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, [laboratory]);

  useEffect(() => {
    if (!laboratory) {
      return;
    }

    let isCurrent = true;

    void Promise.all(
      weekDays.map((day) =>
        client.getAvailability({ laboratoryId: laboratory.id, date: day.isoDate }),
      ),
    )
      .then((responses) => {
        if (isCurrent) {
          setWeekRequest({ key: requestKey, data: responses, error: null });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setWeekRequest({ key: requestKey, data: [], error: getFriendlyError(error) });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [client, laboratory, requestKey, weekDays]);

  if (isBootstrapLoading) {
    return (
      <div className={styles.statePage}>
        <Loading label="Carregando agenda da semana…" size="large" />
      </div>
    );
  }

  if (bootstrapError || !data || !laboratory) {
    return (
      <div className={styles.statePage}>
        <ErrorMessage
          action={
            <div className={styles.errorActions}>
              <Button variant="secondary" onClick={reload}>
                Tentar novamente
              </Button>
              <Button onClick={() => navigate('/gerenciar/entrar')}>Entrar com Google</Button>
            </div>
          }
        >
          {bootstrapError?.message ?? 'Nenhum laboratório foi encontrado para este link.'}
        </ErrorMessage>
      </div>
    );
  }

  const currentSchoolWeek = getSchoolWeek(new Date());
  const nextBookableSchoolDay =
    currentSchoolWeek.find((day) => day.isoDate >= today)?.isoDate ??
    getSchoolWeek(addWeeks(new Date(), 1))[0]!.isoDate;
  const suggestedDate = weekDays[0]!.isoDate > today ? weekDays[0]!.isoDate : nextBookableSchoolDay;
  const laboratoryId = laboratory.id;
  const bookingUrl = `/agendar?lab=${encodeURIComponent(laboratoryId)}&date=${suggestedDate}`;

  function openBooking(date: string, periodId: string) {
    navigate(
      `/agendar?lab=${encodeURIComponent(laboratoryId)}&date=${date}&period=${encodeURIComponent(periodId)}`,
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.identity}>
          <p>{data.school.name}</p>
          <h1 ref={headingRef} tabIndex={-1}>
            {laboratory.name}
          </h1>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.bookingButton} to={bookingUrl}>
            <CalendarPlus size={19} aria-hidden="true" />
            Agendar uma aula
          </Link>
          <Link className={styles.managerLink} to="/gerenciar/geral">
            <Settings size={14} aria-hidden="true" />
            Acesso do laboratorista
          </Link>
        </div>
      </header>

      {routeState?.reservationId ? (
        <p className={styles.successMessage} role="status">
          <Check size={18} aria-hidden="true" />
          Agendamento confirmado e incluído na semana.
        </p>
      ) : null}

      <section
        className={styles.weekSection}
        aria-labelledby="week-title"
        aria-busy={isLoadingWeek}
      >
        <div className={styles.toolbar}>
          <Button
            className={styles.todayButton}
            variant="secondary"
            size="small"
            disabled={isCurrentWeek}
            onClick={() => setReferenceDate(getCurrentAgendaReferenceDate(new Date()))}
          >
            Hoje
          </Button>

          <div className={styles.weekNavigation}>
            <Button
              className={styles.iconButton}
              variant="ghost"
              size="small"
              onClick={() => setReferenceDate(addWeeks(referenceDate, -1))}
              aria-label="Ver semana anterior"
            >
              <ChevronLeft size={21} aria-hidden="true" />
            </Button>
            <div className={styles.weekTitle} aria-live="polite">
              <h2 id="week-title">{weekLabel}</h2>
            </div>
            <Button
              className={styles.iconButton}
              variant="ghost"
              size="small"
              onClick={() => setReferenceDate(addWeeks(referenceDate, 1))}
              aria-label="Ver próxima semana"
            >
              <ChevronRight size={21} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {weekError ? (
          <ErrorMessage
            action={
              <Button
                variant="secondary"
                onClick={() => setRequestVersion((version) => version + 1)}
              >
                Tentar novamente
              </Button>
            }
          >
            {weekError.message}
          </ErrorMessage>
        ) : null}

        {isLoadingWeek ? <Loading label="Atualizando horários…" /> : null}

        {!isLoadingWeek && !weekError ? (
          <>
            <p className="srOnly" role="status">
              Semana de {weekLabel} carregada.
            </p>
            <WeeklyCalendar
              days={weekDays}
              periods={data.periods}
              availability={weekAvailability}
              laboratoryName={laboratory.name}
              onBookSlot={openBooking}
              {...(routeState?.reservationId ? { newReservationId: routeState.reservationId } : {})}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
