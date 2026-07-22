import { zodResolver } from '@hookform/resolvers/zod';
import { addDays } from 'date-fns';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  Check,
  CheckCircle2,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import {
  Button,
  Card,
  ErrorMessage,
  FormField,
  Input,
  Loading,
  PageHeader,
  Select,
  StatusBadge,
} from '../components';
import { useBootstrap } from '../app/BootstrapContext';
import { AvailabilityList } from '../features/availability/AvailabilityList';
import type { AppError, AvailabilityResponse, Reservation } from '../types';
import { getFriendlyError } from '../types';
import { formatDatePtBr, formatIsoDate } from '../utils/dates';
import { idSchema, isoDateSchema, requiredTextSchema } from '../utils/validation';
import pageStyles from './Pages.module.css';
import styles from './BookingPage.module.css';

const bookingSchema = z.object({
  laboratoryId: idSchema,
  date: isoDateSchema,
  classGroup: requiredTextSchema('Turma', 80),
  subject: requiredTextSchema('Disciplina', 100),
  purpose: requiredTextSchema('Finalidade', 300),
  studentCount: z
    .number({ error: 'Informe a quantidade de alunos.' })
    .int('Use um número inteiro.')
    .positive('Informe pelo menos um aluno.'),
  periodIds: z.array(idSchema).min(1, 'Selecione pelo menos um horário.'),
  notes: z.string().trim().max(500, 'As observações devem ter no máximo 500 caracteres.'),
});

type BookingFormData = z.infer<typeof bookingSchema>;
type BookingView = 'FORM' | 'CONFIRMATION' | 'SUCCESS';

const stepLabels = [
  'Identificação',
  'Laboratório',
  'Data',
  'Disponibilidade',
  'Informações',
  'Confirmação',
  'Resultado',
] as const;

export function BookingPage() {
  const {
    data,
    client,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    reload,
  } = useBootstrap();
  const location = useLocation();
  const [view, setView] = useState<BookingView>('FORM');
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<AppError | null>(null);
  const [pendingValues, setPendingValues] = useState<BookingFormData | null>(null);
  const [createdReservation, setCreatedReservation] = useState<Reservation | null>(null);

  const routeLaboratoryId = useMemo(
    () => new URLSearchParams(location.search).get('lab') ?? '',
    [location.search],
  );

  const {
    register,
    control,
    formState: { errors },
    getValues,
    handleSubmit,
    setError,
    setValue,
    trigger,
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      laboratoryId: '',
      date: formatIsoDate(addDays(new Date(), 1)),
      classGroup: '',
      subject: '',
      purpose: '',
      studentCount: 1,
      periodIds: [],
      notes: '',
    },
  });

  const laboratoryId = useWatch({ control, name: 'laboratoryId' });
  const selectedPeriodIds = useWatch({ control, name: 'periodIds' });

  const suggestedLaboratoryId =
    routeLaboratoryId.length > 0
      ? routeLaboratoryId
      : (data?.preselectedLaboratoryId ?? data?.laboratories[0]?.id ?? '');

  useEffect(() => {
    if (!laboratoryId && suggestedLaboratoryId) {
      setValue('laboratoryId', suggestedLaboratoryId, { shouldValidate: false });
    }
  }, [laboratoryId, setValue, suggestedLaboratoryId]);

  const activeStep =
    view === 'SUCCESS' ? 7 : view === 'CONFIRMATION' ? 6 : availability ? 5 : laboratoryId ? 3 : 2;

  async function checkAvailability() {
    const isValid = await trigger(['laboratoryId', 'date']);
    if (!isValid) {
      return;
    }

    setIsChecking(true);
    setRequestError(null);
    try {
      const response = await client.getAvailability({
        laboratoryId: getValues('laboratoryId'),
        date: getValues('date'),
      });
      setAvailability(response);
      setValue('periodIds', [], { shouldValidate: false });
    } catch (error: unknown) {
      setAvailability(null);
      setRequestError(getFriendlyError(error));
    } finally {
      setIsChecking(false);
    }
  }

  function togglePeriod(periodId: string) {
    const current = getValues('periodIds');
    const next = current.includes(periodId)
      ? current.filter((candidate) => candidate !== periodId)
      : [...current, periodId];
    setValue('periodIds', next, { shouldDirty: true, shouldValidate: true });
  }

  function prepareConfirmation(values: BookingFormData) {
    if (!availability) {
      setRequestError({
        code: 'VALIDATION_ERROR',
        message: 'Consulte a disponibilidade antes de continuar.',
      });
      return;
    }
    setRequestError(null);
    setPendingValues(values);
    setView('CONFIRMATION');
  }

  async function confirmReservation() {
    if (!pendingValues) {
      return;
    }

    if (!data?.currentUser) {
      setRequestError({
        code: 'UNAUTHORIZED',
        message: 'Identifique-se como professor antes de confirmar a reserva.',
      });
      return;
    }

    setIsSubmitting(true);
    setRequestError(null);
    try {
      const reservation = await client.createReservation({
        ...pendingValues,
        teacherId: data.currentUser.id,
        teacherEmail: data.currentUser.email,
        resources: [],
      });
      setCreatedReservation(reservation);
      setView('SUCCESS');
    } catch (error: unknown) {
      const friendlyError = getFriendlyError(error);
      setRequestError(friendlyError);
      if (friendlyError.code === 'TIME_CONFLICT') {
        setError('periodIds', { message: friendlyError.message });
        setView('FORM');
        setAvailability(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapLoading && !data) {
    return (
      <div className={pageStyles.page}>
        <PageHeader title="Nova reserva" description="Carregando opções de reserva…" />
        <Loading label="Preparando formulário" />
      </div>
    );
  }

  if (bootstrapError && !data) {
    return (
      <div className={pageStyles.page}>
        <PageHeader title="Nova reserva" />
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
    (laboratory) => laboratory.id === (pendingValues?.laboratoryId ?? laboratoryId),
  );
  const selectedPeriods = data.periods.filter((period) =>
    (pendingValues?.periodIds ?? selectedPeriodIds).includes(period.id),
  );

  return (
    <div className={pageStyles.page}>
      <PageHeader
        eyebrow="Fluxo guiado"
        title="Nova reserva"
        description="Informe os dados da aula, confira a disponibilidade e revise tudo antes de confirmar."
        actions={<StatusBadge tone="info">Dados de demonstração</StatusBadge>}
      />

      <nav className={styles.steps} aria-label="Etapas da reserva">
        <ol>
          {stepLabels.map((label, index) => {
            const step = index + 1;
            return (
              <li
                key={label}
                className={
                  step < activeStep
                    ? styles.stepComplete
                    : step === activeStep
                      ? styles.stepActive
                      : ''
                }
                aria-current={step === activeStep ? 'step' : undefined}
              >
                <span>{step < activeStep ? <Check size={15} aria-hidden="true" /> : step}</span>
                <small>{label}</small>
              </li>
            );
          })}
        </ol>
      </nav>

      {requestError ? <ErrorMessage>{requestError.message}</ErrorMessage> : null}

      {view === 'FORM' ? (
        <form
          className={styles.form}
          onSubmit={(event) => void handleSubmit(prepareConfirmation)(event)}
          noValidate
        >
          <Card className={pageStyles.formCard}>
            <div className={styles.cardHeading}>
              <span>1</span>
              <div>
                <h2>Espaço e data</h2>
                <p>O laboratório indicado pelo QR Code já aparece selecionado quando aplicável.</p>
              </div>
            </div>
            <div className={pageStyles.formGrid}>
              <Select
                label="Laboratório"
                required
                error={errors.laboratoryId?.message}
                {...register('laboratoryId', {
                  onChange: () => {
                    setAvailability(null);
                    setValue('periodIds', []);
                  },
                })}
              >
                <option value="">Selecione um laboratório</option>
                {data.laboratories.map((laboratory) => (
                  <option key={laboratory.id} value={laboratory.id}>
                    {laboratory.name} — até {laboratory.capacity} pessoas
                  </option>
                ))}
              </Select>
              <Input
                label="Data"
                type="date"
                required
                min={formatIsoDate(new Date())}
                max={`${data.school.academicYear}-12-31`}
                error={errors.date?.message}
                {...register('date', {
                  onChange: () => {
                    setAvailability(null);
                    setValue('periodIds', []);
                  },
                })}
              />
            </div>
            {selectedLaboratory ? (
              <div className={styles.laboratorySummary}>
                <ShieldCheck size={20} aria-hidden="true" />
                <span>
                  <strong>{selectedLaboratory.name}</strong>
                  {selectedLaboratory.capacity} lugares · {selectedLaboratory.description}
                </span>
              </div>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              onClick={() => void checkAvailability()}
              isLoading={isChecking}
            >
              <CalendarCheck size={19} aria-hidden="true" /> Consultar horários
            </Button>
          </Card>

          <Card className={pageStyles.formCard}>
            <div className={styles.cardHeading}>
              <span>2</span>
              <div>
                <h2>Horários</h2>
                <p>Selecione um ou mais períodos consecutivos que estejam disponíveis.</p>
              </div>
            </div>
            {isChecking ? <Loading label="Verificando disponibilidade" /> : null}
            {!availability && !isChecking ? (
              <div className={styles.emptyAvailability}>
                <Info size={21} aria-hidden="true" />
                <span>Consulte os horários para liberar esta etapa.</span>
              </div>
            ) : null}
            {availability ? (
              <fieldset className={styles.periodFieldset}>
                <legend className="srOnly">Períodos desejados</legend>
                <AvailabilityList
                  periods={availability.periods}
                  selectable
                  selectedPeriodIds={selectedPeriodIds}
                  onPeriodToggle={togglePeriod}
                />
              </fieldset>
            ) : null}
            {errors.periodIds?.message ? (
              <p className={styles.fieldError}>{errors.periodIds.message}</p>
            ) : null}
          </Card>

          <Card className={pageStyles.formCard}>
            <div className={styles.cardHeading}>
              <span>3</span>
              <div>
                <h2>Informações da aula</h2>
                <p>Esses dados ajudam a escola a organizar o uso pedagógico do espaço.</p>
              </div>
            </div>
            <div className={pageStyles.formGrid}>
              <Input
                label="Turma"
                placeholder="Ex.: 8º A"
                required
                error={errors.classGroup?.message}
                {...register('classGroup')}
              />
              <Input
                label="Disciplina"
                placeholder="Ex.: Ciências"
                required
                error={errors.subject?.message}
                {...register('subject')}
              />
              <Input
                label="Quantidade de alunos"
                type="number"
                min={1}
                max={selectedLaboratory?.capacity}
                required
                error={errors.studentCount?.message}
                {...register('studentCount', { valueAsNumber: true })}
              />
              <Input
                label="Finalidade"
                placeholder="Ex.: Experimento sobre densidade"
                required
                error={errors.purpose?.message}
                {...register('purpose')}
              />
              <FormField
                id="booking-notes"
                label="Observações"
                hint="Opcional. Não inclua dados pessoais de alunos."
                error={errors.notes?.message}
                className={pageStyles.fullWidth}
              >
                <textarea
                  id="booking-notes"
                  className={styles.textarea}
                  rows={4}
                  {...register('notes')}
                />
              </FormField>
            </div>
            <div className={styles.materialNote}>
              <Info size={19} aria-hidden="true" />
              <span>
                A seleção de materiais será habilitada junto às regras reais de disponibilidade.
              </span>
            </div>
          </Card>

          <div className={styles.formActions}>
            <Link className={pageStyles.textLink} to="/">
              <ArrowLeft size={18} aria-hidden="true" /> Cancelar
            </Link>
            <Button type="submit">
              Revisar reserva <ArrowRight size={19} aria-hidden="true" />
            </Button>
          </div>
        </form>
      ) : null}

      {view === 'CONFIRMATION' && pendingValues ? (
        <section className={styles.confirmation} aria-labelledby="confirmation-title">
          <Card className={styles.confirmationCard}>
            <div className={styles.confirmationHeader}>
              <span className={styles.confirmationIcon} aria-hidden="true">
                <CalendarCheck size={28} />
              </span>
              <div>
                <h2 id="confirmation-title">Confira antes de confirmar</h2>
                <p>A disponibilidade será validada novamente pelo backend no envio.</p>
              </div>
            </div>
            <dl className={styles.reviewList}>
              <div>
                <dt>Professor</dt>
                <dd>{data.currentUser?.name}</dd>
              </div>
              <div>
                <dt>Laboratório</dt>
                <dd>{selectedLaboratory?.name}</dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>{formatDatePtBr(pendingValues.date)}</dd>
              </div>
              <div>
                <dt>Horários</dt>
                <dd>
                  {selectedPeriods
                    .map((period) => `${period.name} (${period.startTime})`)
                    .join(', ')}
                </dd>
              </div>
              <div>
                <dt>Turma</dt>
                <dd>
                  {pendingValues.classGroup} · {pendingValues.studentCount} alunos
                </dd>
              </div>
              <div>
                <dt>Disciplina e finalidade</dt>
                <dd>
                  {pendingValues.subject} · {pendingValues.purpose}
                </dd>
              </div>
            </dl>
            <div className={styles.formActions}>
              <Button variant="ghost" onClick={() => setView('FORM')} disabled={isSubmitting}>
                <ArrowLeft size={18} aria-hidden="true" /> Corrigir dados
              </Button>
              <Button
                onClick={() => void confirmReservation()}
                isLoading={isSubmitting}
                loadingLabel="Confirmando…"
              >
                <CheckCircle2 size={19} aria-hidden="true" /> Confirmar reserva
              </Button>
            </div>
          </Card>
        </section>
      ) : null}

      {view === 'SUCCESS' && createdReservation ? (
        <section className={styles.success} aria-labelledby="success-title">
          <span className={styles.successIcon} aria-hidden="true">
            <CheckCircle2 size={42} />
          </span>
          <StatusBadge tone="success">Reserva confirmada</StatusBadge>
          <h2 id="success-title">Tudo certo para a sua aula!</h2>
          <p>
            A reserva <strong>{createdReservation.id}</strong> foi registrada para{' '}
            <strong>{createdReservation.laboratoryName}</strong> em{' '}
            {formatDatePtBr(createdReservation.date)}.
          </p>
          <Card variant="subtle" className={styles.successDetails}>
            <span>Horários: {createdReservation.periodLabels.join(', ')}</span>
            <span>
              Google Agenda:{' '}
              {createdReservation.calendarStatus === 'SYNCED'
                ? 'sincronizado'
                : 'integração desativada'}
            </span>
          </Card>
          <div className={pageStyles.actions}>
            <Link className={pageStyles.textLink} to="/minhas-reservas">
              Ver minhas reservas
            </Link>
            <Link className={pageStyles.textLink} to="/">
              Voltar ao início
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
