import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Check, LockKeyhole } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useBootstrap } from '../app/BootstrapContext';
import { Button, ErrorMessage, FormField, Input, Loading } from '../components';
import {
  CLASS_GROUP_OPTIONS,
  findOptionById,
  getKnowledgeObjectOptions,
  getOptionLabel,
  KNOWLEDGE_OBJECT_OPTIONS,
  SUBJECT_OPTIONS,
} from '../features/booking/bookingOptions';
import type { BookingOption, ClassGroupOption } from '../features/booking/bookingOptions';
import type { AppError, AvailabilityResponse, PeriodAvailability } from '../types';
import { getFriendlyError } from '../types';
import { formatIsoDate, isValidIsoDate } from '../utils/dates';
import { idSchema, isoDateSchema, requiredTextSchema } from '../utils/validation';
import controlStyles from '../components/FormField/Control.module.css';
import styles from './BookingPage.module.css';

const OTHER_SUBJECT_ID = 'subject-other';
const OTHER_CLASS_GROUP_ID = 'class-other';
const OTHER_RESOURCE_ID = 'technology-other';
const NO_RESOURCE_ID = 'technology-none';
const OTHER_KNOWLEDGE_OBJECT_ID = 'knowledge-other';

function createBookingSchema(
  subjectOptions: readonly BookingOption[],
  classGroupOptions: readonly ClassGroupOption[],
  resourceOptions: readonly BookingOption[],
) {
  return z
    .object({
      teacherName: requiredTextSchema('Nome do professor', 120),
      subjectId: idSchema.refine(
        (value) => Boolean(findOptionById(subjectOptions, value)),
        'Escolha uma disciplina válida.',
      ),
      otherSubject: z.string().trim().max(100, 'Use no máximo 100 caracteres.'),
      classGroupId: idSchema.refine(
        (value) => Boolean(findOptionById(classGroupOptions, value)),
        'Escolha uma turma válida.',
      ),
      otherClassGroup: z.string().trim().max(80, 'Use no máximo 80 caracteres.'),
      date: isoDateSchema.refine(
        (value) => value >= formatIsoDate(new Date()),
        'Escolha uma data de hoje em diante.',
      ),
      periodIds: z.array(idSchema).min(1, 'Selecione pelo menos uma aula.'),
      knowledgeObjectIds: z
        .array(idSchema)
        .min(1, 'Selecione pelo menos um objeto do conhecimento.'),
      otherKnowledgeObject: z.string().trim().max(800, 'Use no máximo 800 caracteres.'),
      resourceIds: z
        .array(idSchema)
        .min(1, 'Selecione pelo menos um item ou recurso.')
        .refine(
          (ids) => ids.every((id) => Boolean(findOptionById(resourceOptions, id))),
          'Selecione apenas itens ou recursos válidos.',
        ),
      otherResource: z.string().trim().max(500, 'Use no máximo 500 caracteres.'),
      notes: z.string().trim().max(800, 'Use no máximo 800 caracteres.'),
    })
    .superRefine((values, context) => {
      if (values.subjectId === OTHER_SUBJECT_ID && !values.otherSubject) {
        context.addIssue({
          code: 'custom',
          path: ['otherSubject'],
          message: 'Informe a disciplina.',
        });
      }

      if (values.classGroupId === OTHER_CLASS_GROUP_ID && !values.otherClassGroup) {
        context.addIssue({
          code: 'custom',
          path: ['otherClassGroup'],
          message: 'Informe a turma.',
        });
      }

      if (
        values.knowledgeObjectIds.includes(OTHER_KNOWLEDGE_OBJECT_ID) &&
        !values.otherKnowledgeObject
      ) {
        context.addIssue({
          code: 'custom',
          path: ['otherKnowledgeObject'],
          message: 'Descreva o outro objeto do conhecimento.',
        });
      }

      const availableKnowledgeIds = new Set(
        getKnowledgeObjectOptions(
          values.subjectId,
          values.classGroupId,
          subjectOptions,
          classGroupOptions,
        ).map((option) => option.id),
      );
      if (values.knowledgeObjectIds.some((id) => !availableKnowledgeIds.has(id))) {
        context.addIssue({
          code: 'custom',
          path: ['knowledgeObjectIds'],
          message: 'Selecione objetos do conhecimento compatíveis com a disciplina e a turma.',
        });
      }

      if (values.resourceIds.includes(OTHER_RESOURCE_ID) && !values.otherResource) {
        context.addIssue({
          code: 'custom',
          path: ['otherResource'],
          message: 'Informe o outro item ou recurso.',
        });
      }

      if (values.resourceIds.includes(NO_RESOURCE_ID) && values.resourceIds.length > 1) {
        context.addIssue({
          code: 'custom',
          path: ['resourceIds'],
          message: 'Escolha “Nenhum recurso tecnológico” sozinho ou selecione os recursos usados.',
        });
      }
    });
}

type BookingFormData = z.infer<ReturnType<typeof createBookingSchema>>;

interface AvailabilityRequestState {
  key: string;
  data: AvailabilityResponse | null;
  error: AppError | null;
}

interface PeriodShiftGroup {
  id: string;
  name: string;
  order: number;
  periods: PeriodAvailability[];
}

function groupPeriodsByShift(periods: readonly PeriodAvailability[]): PeriodShiftGroup[] {
  const groups = new Map<string, PeriodShiftGroup>();

  periods
    .toSorted(
      (left, right) =>
        left.shiftOrder - right.shiftOrder ||
        left.classNumber - right.classNumber ||
        left.startTime.localeCompare(right.startTime) ||
        left.periodId.localeCompare(right.periodId),
    )
    .forEach((period) => {
      const currentGroup = groups.get(period.shiftId);

      if (currentGroup) {
        currentGroup.periods.push(period);
        return;
      }

      groups.set(period.shiftId, {
        id: period.shiftId,
        name: period.shiftName,
        order: period.shiftOrder,
        periods: [period],
      });
    });

  return [...groups.values()].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

export function BookingPage() {
  const {
    data,
    client,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    reload,
  } = useBootstrap();
  const location = useLocation();
  const navigate = useNavigate();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const appliedQueryDateRef = useRef<string | null>(null);
  const appliedQueryPeriodRef = useRef<string | null>(null);
  const periodAvailabilityDescriptionBaseId = useId();
  const [availabilityRequest, setAvailabilityRequest] = useState<AvailabilityRequestState>({
    key: '',
    data: null,
    error: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<AppError | null>(null);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [knowledgeSelectionNotice, setKnowledgeSelectionNotice] = useState('');

  const queryLaboratoryId = useMemo(
    () => new URLSearchParams(location.search).get('lab') ?? '',
    [location.search],
  );
  const queryDate = useMemo(
    () => new URLSearchParams(location.search).get('date') ?? '',
    [location.search],
  );
  const queryPeriodId = useMemo(
    () => new URLSearchParams(location.search).get('period') ?? '',
    [location.search],
  );
  const subjectOptions = useMemo<readonly BookingOption[]>(
    () =>
      data
        ? [
            ...data.subjects
              .filter((subject) => subject.active)
              .toSorted(
                (left, right) => left.order - right.order || left.id.localeCompare(right.id),
              )
              .map(({ id, label }) => ({ id, label })),
            { id: OTHER_SUBJECT_ID, label: 'Outro' },
          ]
        : SUBJECT_OPTIONS,
    [data],
  );
  const classGroupOptions = useMemo<readonly ClassGroupOption[]>(
    () =>
      data
        ? [
            ...data.classGroups
              .filter((classGroup) => classGroup.active)
              .toSorted(
                (left, right) => left.order - right.order || left.id.localeCompare(right.id),
              )
              .map(({ id, label, gradeId }) => ({ id, label, gradeId })),
            { id: OTHER_CLASS_GROUP_ID, label: 'Outra turma', gradeId: 'other' },
          ]
        : CLASS_GROUP_OPTIONS,
    [data],
  );
  const resourceOptions = useMemo<readonly BookingOption[]>(
    () =>
      data
        ? data.resources
            .filter((resource) => resource.active)
            .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
            .map(({ id, label }) => ({ id, label }))
        : [],
    [data],
  );
  const showObservations = data?.bookingForm.showObservations ?? false;
  const bookingSchema = useMemo(
    () => createBookingSchema(subjectOptions, classGroupOptions, resourceOptions),
    [classGroupOptions, resourceOptions, subjectOptions],
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

  const {
    control,
    formState: { errors },
    getValues,
    handleSubmit,
    register,
    setValue,
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      teacherName: '',
      subjectId: '',
      otherSubject: '',
      classGroupId: '',
      otherClassGroup: '',
      date: isValidIsoDate(queryDate) ? queryDate : formatIsoDate(new Date()),
      periodIds: [],
      knowledgeObjectIds: [],
      otherKnowledgeObject: '',
      resourceIds: [],
      otherResource: '',
      notes: '',
    },
  });

  const selectedDate = useWatch({ control, name: 'date' });
  const selectedPeriodIds = useWatch({ control, name: 'periodIds' });
  const selectedSubjectId = useWatch({ control, name: 'subjectId' });
  const selectedClassGroupId = useWatch({ control, name: 'classGroupId' });
  const selectedKnowledgeObjectIds = useWatch({ control, name: 'knowledgeObjectIds' });
  const selectedResourceIds = useWatch({ control, name: 'resourceIds' });
  const knowledgeObjectOptions = useMemo(
    () =>
      getKnowledgeObjectOptions(
        selectedSubjectId,
        selectedClassGroupId,
        subjectOptions,
        classGroupOptions,
      ),
    [classGroupOptions, selectedClassGroupId, selectedSubjectId, subjectOptions],
  );
  const availabilityKey =
    laboratory && isValidIsoDate(selectedDate)
      ? `${data?.school.id ?? ''}:${laboratory.id}:${selectedDate}:${availabilityVersion}`
      : null;
  const availability =
    availabilityKey && availabilityRequest.key === availabilityKey
      ? availabilityRequest.data
      : null;
  const availabilityError =
    availabilityKey && availabilityRequest.key === availabilityKey
      ? availabilityRequest.error
      : null;
  const isLoadingAvailability = Boolean(
    availabilityKey && availabilityRequest.key !== availabilityKey,
  );
  const periodShiftGroups = useMemo(
    () => groupPeriodsByShift(availability?.periods ?? []),
    [availability],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [laboratory]);

  useEffect(() => {
    if (!isValidIsoDate(queryDate) || appliedQueryDateRef.current === queryDate) {
      return;
    }

    appliedQueryDateRef.current = queryDate;
    setValue('date', queryDate, { shouldDirty: false, shouldValidate: true });
    setValue('periodIds', [], { shouldDirty: false, shouldValidate: false });
  }, [queryDate, setValue]);

  useEffect(() => {
    if (!data || !laboratory || !availabilityKey) {
      return;
    }

    let isCurrent = true;

    void client
      .getAvailability({
        schoolId: data.school.id,
        laboratoryId: laboratory.id,
        date: selectedDate,
      })
      .then((response) => {
        if (isCurrent) {
          setAvailabilityRequest({ key: availabilityKey, data: response, error: null });
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setAvailabilityRequest({
            key: availabilityKey,
            data: null,
            error: getFriendlyError(error),
          });
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [availabilityKey, client, data, laboratory, selectedDate]);

  useEffect(() => {
    if (
      !availability ||
      !queryPeriodId ||
      !queryLaboratoryId ||
      laboratory?.id !== queryLaboratoryId ||
      !isValidIsoDate(queryDate) ||
      selectedDate !== queryDate
    ) {
      return;
    }

    const querySelectionKey = `${availability.laboratoryId}:${queryDate}:${queryPeriodId}`;
    if (appliedQueryPeriodRef.current === querySelectionKey) {
      return;
    }

    appliedQueryPeriodRef.current = querySelectionKey;
    const requestedPeriod = availability.periods.find(
      (period) => period.periodId === queryPeriodId,
    );

    if (requestedPeriod?.status !== 'AVAILABLE') {
      return;
    }

    const currentPeriodIds = getValues('periodIds');
    if (!currentPeriodIds.includes(queryPeriodId)) {
      setValue('periodIds', [...currentPeriodIds, queryPeriodId], {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [
    availability,
    getValues,
    laboratory,
    queryDate,
    queryLaboratoryId,
    queryPeriodId,
    selectedDate,
    setValue,
  ]);

  function togglePeriod(periodId: string) {
    const current = getValues('periodIds');
    const next = current.includes(periodId)
      ? current.filter((candidate) => candidate !== periodId)
      : [...current, periodId];
    setValue('periodIds', next, { shouldDirty: true, shouldValidate: true });
  }

  function clearKnowledgeSelection() {
    const hadSelection =
      getValues('knowledgeObjectIds').length > 0 ||
      Boolean(getValues('otherKnowledgeObject').trim());
    setValue('knowledgeObjectIds', [], { shouldDirty: hadSelection, shouldValidate: false });
    setValue('otherKnowledgeObject', '', { shouldDirty: hadSelection, shouldValidate: false });
    setKnowledgeSelectionNotice(
      hadSelection
        ? 'As escolhas de objetos do conhecimento foram limpas para mostrar as opções da nova disciplina ou turma.'
        : '',
    );
  }

  function toggleKnowledgeObject(optionId: string) {
    const current = getValues('knowledgeObjectIds');
    const next = current.includes(optionId)
      ? current.filter((candidate) => candidate !== optionId)
      : [...current, optionId];
    setValue('knowledgeObjectIds', next, { shouldDirty: true, shouldValidate: true });
    setKnowledgeSelectionNotice('');
  }

  function toggleResource(optionId: string) {
    const current = getValues('resourceIds');
    let next: string[];

    if (optionId === NO_RESOURCE_ID) {
      next = current.includes(NO_RESOURCE_ID) ? [] : [NO_RESOURCE_ID];
    } else {
      const resourcesInUse = current.filter((candidate) => candidate !== NO_RESOURCE_ID);
      next = resourcesInUse.includes(optionId)
        ? resourcesInUse.filter((candidate) => candidate !== optionId)
        : [...resourcesInUse, optionId];
    }

    setValue('resourceIds', next, { shouldDirty: true, shouldValidate: true });
  }

  async function submitReservation(values: BookingFormData) {
    if (!data || !laboratory) {
      return;
    }

    const subject =
      values.subjectId === OTHER_SUBJECT_ID
        ? values.otherSubject
        : getOptionLabel(subjectOptions, values.subjectId);
    const classGroup =
      values.classGroupId === OTHER_CLASS_GROUP_ID
        ? values.otherClassGroup
        : getOptionLabel(classGroupOptions, values.classGroupId);
    const knowledgeObjects = values.knowledgeObjectIds
      .map((id) =>
        id === OTHER_KNOWLEDGE_OBJECT_ID
          ? values.otherKnowledgeObject
          : getOptionLabel(KNOWLEDGE_OBJECT_OPTIONS, id),
      )
      .filter(Boolean)
      .join('; ');
    const itemsUsed = values.resourceIds
      .map((id) =>
        id === OTHER_RESOURCE_ID ? values.otherResource : getOptionLabel(resourceOptions, id),
      )
      .filter(Boolean)
      .join('; ');

    setIsSubmitting(true);
    setRequestError(null);
    try {
      const reservation = await client.createReservation({
        schoolId: data.school.id,
        laboratoryId: laboratory.id,
        teacherName: values.teacherName,
        subject,
        classGroup,
        date: values.date,
        periodIds: values.periodIds,
        knowledgeObjects,
        itemsUsed,
        notes: showObservations ? values.notes : '',
      });

            navigate(
      `/?school=${encodeURIComponent(data.school.id)}&lab=${encodeURIComponent(laboratory.id)}&date=${encodeURIComponent(reservation.date)}`,
      {
        replace: true,
        state: { reservationId: reservation.id, reservationDate: reservation.date },
      },
    );
    } catch (error: unknown) {
      const friendlyError = getFriendlyError(error);
      setRequestError(friendlyError);
      if (friendlyError.code === 'TIME_CONFLICT') {
        setValue('periodIds', [], { shouldValidate: false });
        setAvailabilityVersion((version) => version + 1);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapLoading) {
    return (
      <div className={styles.statePage}>
        <Loading label="Carregando formulário…" size="large" />
      </div>
    );
  }

  if (bootstrapError || !data || !laboratory) {
    return (
      <div className={styles.statePage}>
        <ErrorMessage
          action={
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          }
        >
          {bootstrapError?.message ?? 'Nenhum laboratório foi encontrado para este link.'}
        </ErrorMessage>
      </div>
    );
  }

  if (isSubmitting) {
    return (
      <div className={styles.statePage}>
        <Loading
          label="Salvando agendamento. A agenda será atualizada em instantes…"
          size="large"
        />
      </div>
    );
  }

  const scheduleUrl = `/?school=${encodeURIComponent(data.school.id)}&lab=${encodeURIComponent(laboratory.id)}&date=${selectedDate}`;
  const dateRegistration = register('date');
  const subjectRegistration = register('subjectId');
  const classGroupRegistration = register('classGroupId');

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to={scheduleUrl}>
        <ArrowLeft size={19} aria-hidden="true" />
        Voltar para a agenda
      </Link>

      <header className={styles.heading}>
        <p>{data.school.name}</p>
        <h1 ref={headingRef} tabIndex={-1}>
          Fazer agendamento
        </h1>
        <span>{laboratory.name}</span>
      </header>

      <form className={styles.form} onSubmit={handleSubmit(submitReservation)} noValidate>
        <section className={styles.formSection} aria-labelledby="identification-title">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true">1</span>
            <div>
              <h2 id="identification-title">Dados da aula</h2>
              <p>Identifique o professor, a disciplina e a turma.</p>
            </div>
          </div>

          <div className={styles.identityFields}>
            <Input
              containerClassName={styles.teacherField}
              label="Nome do professor"
              placeholder="Digite seu nome completo"
              autoComplete="name"
              required
              error={errors.teacherName?.message}
              {...register('teacherName')}
            />

            <FormField id="subject" label="Disciplina" required error={errors.subjectId?.message}>
              <span className={controlStyles.selectContainer}>
                <select
                  id="subject"
                  className={`${controlStyles.control} ${controlStyles.select} ${
                    errors.subjectId ? controlStyles.hasError : ''
                  }`}
                  required
                  aria-invalid={Boolean(errors.subjectId)}
                  aria-describedby={errors.subjectId ? 'subject-error' : undefined}
                  {...subjectRegistration}
                  onChange={(event) => {
                    void subjectRegistration.onChange(event);
                    clearKnowledgeSelection();
                    if (event.target.value !== OTHER_SUBJECT_ID) {
                      setValue('otherSubject', '', { shouldValidate: false });
                    }
                  }}
                >
                  <option value="">Escolher disciplina</option>
                  {subjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>
            </FormField>

            <FormField id="class-group" label="Turma" required error={errors.classGroupId?.message}>
              <span className={controlStyles.selectContainer}>
                <select
                  id="class-group"
                  className={`${controlStyles.control} ${controlStyles.select} ${
                    errors.classGroupId ? controlStyles.hasError : ''
                  }`}
                  required
                  aria-invalid={Boolean(errors.classGroupId)}
                  aria-describedby={errors.classGroupId ? 'class-group-error' : undefined}
                  {...classGroupRegistration}
                  onChange={(event) => {
                    void classGroupRegistration.onChange(event);
                    clearKnowledgeSelection();
                    if (event.target.value !== OTHER_CLASS_GROUP_ID) {
                      setValue('otherClassGroup', '', { shouldValidate: false });
                    }
                  }}
                >
                  <option value="">Escolher turma</option>
                  {classGroupOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </span>
            </FormField>

            {selectedSubjectId === OTHER_SUBJECT_ID ? (
              <Input
                label="Qual disciplina?"
                placeholder="Digite a disciplina"
                required
                error={errors.otherSubject?.message}
                {...register('otherSubject')}
              />
            ) : null}

            {selectedClassGroupId === OTHER_CLASS_GROUP_ID ? (
              <Input
                label="Qual turma?"
                placeholder="Ex.: EJA 2 ou 8º A"
                required
                error={errors.otherClassGroup?.message}
                {...register('otherClassGroup')}
              />
            ) : null}
          </div>
        </section>

        <section className={styles.formSection} aria-labelledby="schedule-title">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true">2</span>
            <div>
              <h2 id="schedule-title">Data e aulas</h2>
              <p>Somente os horários livres podem ser selecionados.</p>
            </div>
          </div>

          <div className={styles.scheduleFields}>
            <Input
              containerClassName={styles.dateField}
              label="Data da aula"
              type="date"
              min={formatIsoDate(new Date())}
              required
              error={errors.date?.message}
              {...dateRegistration}
              onChange={(event) => {
                void dateRegistration.onChange(event);
                setValue('periodIds', [], { shouldValidate: false });
                setRequestError(null);
              }}
            />

            <fieldset
              className={styles.periodFieldset}
              aria-invalid={Boolean(errors.periodIds)}
              aria-describedby={errors.periodIds ? 'period-error' : undefined}
              aria-busy={isLoadingAvailability}
            >
              <legend>
                Aulas desejadas <span aria-hidden="true">*</span>
              </legend>
              {isLoadingAvailability ? (
                <Loading label="Buscando aulas livres…" size="small" />
              ) : null}
              {!isLoadingAvailability && availability ? (
                availability.periods.length > 0 ? (
                  <div
                    className={styles.periodShiftGrid}
                    data-shift-count={periodShiftGroups.length}
                    style={
                      {
                        '--shift-columns': Math.min(periodShiftGroups.length, 3),
                      } as CSSProperties
                    }
                  >
                    {periodShiftGroups.map((shift, shiftIndex) => {
                      const availableCount = shift.periods.filter(
                        (period) => period.status === 'AVAILABLE',
                      ).length;
                      const availabilityDescriptionId = `${periodAvailabilityDescriptionBaseId}-${shiftIndex}`;

                      return (
                        <fieldset
                          className={styles.periodShiftGroup}
                          aria-label={shift.name}
                          aria-describedby={availabilityDescriptionId}
                          key={shift.id}
                        >
                          <legend className={styles.periodShiftLegend}>
                            <strong>{shift.name}</strong>
                            <span className={styles.periodAvailabilityFull} aria-hidden="true">
                              {availableCount} de {shift.periods.length}{' '}
                              {shift.periods.length === 1 ? 'livre' : 'livres'}
                            </span>
                            <span className={styles.periodAvailabilityCompact} aria-hidden="true">
                              {availableCount}/{shift.periods.length}
                            </span>
                          </legend>
                          <span id={availabilityDescriptionId} className="srOnly">
                            {availableCount} de {shift.periods.length}{' '}
                            {shift.periods.length === 1 ? 'aula livre' : 'aulas livres'}.
                          </span>

                          <div className={styles.periodOptions}>
                            {shift.periods.map((period) => {
                              const isReserved = period.status === 'UNAVAILABLE';
                              const isChecked = selectedPeriodIds.includes(period.periodId);

                              return (
                                <label
                                  className={`${styles.periodOption} ${
                                    isReserved ? styles.periodReserved : styles.periodAvailable
                                  } ${isChecked ? styles.periodSelected : ''}`}
                                  key={period.periodId}
                                >
                                  <input
                                    className={styles.periodCheckbox}
                                    type="checkbox"
                                    name="periodIds"
                                    checked={isChecked}
                                    disabled={isReserved}
                                    onChange={() => togglePeriod(period.periodId)}
                                  />
                                  {isReserved ? (
                                    <LockKeyhole size={15} aria-hidden="true" />
                                  ) : (
                                    <Check size={16} aria-hidden="true" />
                                  )}
                                  <strong
                                    className={styles.periodLabelFull}
                                    data-period-label="full"
                                    aria-hidden="true"
                                  >
                                    {period.label}
                                  </strong>
                                  <strong
                                    className={styles.periodLabelCompact}
                                    data-period-label="compact"
                                    aria-hidden="true"
                                  >
                                    {period.classNumber}° aula
                                  </strong>
                                  <span className={styles.periodTime} aria-hidden="true">
                                    {period.startTime}–{period.endTime}
                                  </span>
                                  <span className="srOnly">
                                    {period.label}, {period.startTime} às {period.endTime}.{' '}
                                    {isReserved ? 'Reservado' : 'Livre'}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                ) : (
                  <p className={styles.noPeriods}>Nenhuma aula foi configurada para esta data.</p>
                )
              ) : null}
              {errors.periodIds?.message ? (
                <p id="period-error" className={styles.fieldError} role="alert">
                  {errors.periodIds.message}
                </p>
              ) : null}
              {availabilityError ? (
                <p className={styles.fieldError} role="alert">
                  {availabilityError.message}
                </p>
              ) : null}
            </fieldset>
          </div>
        </section>

        <section className={styles.formSection} aria-labelledby="knowledge-title">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true">3</span>
            <div>
              <h2 id="knowledge-title">Objetos do conhecimento</h2>
              <p>As opções mudam conforme a disciplina e a turma.</p>
            </div>
          </div>

          <fieldset
            className={`${styles.optionFieldset} ${
              errors.knowledgeObjectIds ? styles.optionFieldsetError : ''
            }`}
            aria-invalid={Boolean(errors.knowledgeObjectIds)}
            aria-describedby={
              errors.knowledgeObjectIds
                ? 'knowledge-objects-error'
                : selectedSubjectId && selectedClassGroupId
                  ? 'knowledge-options-status'
                  : undefined
            }
          >
            <legend className="srOnly">Objetos do conhecimento</legend>
            {!selectedSubjectId || !selectedClassGroupId ? (
              <p className={styles.emptyOptions}>
                Escolha a disciplina e a turma para ver os objetos disponíveis.
              </p>
            ) : (
              <>
                <p id="knowledge-options-status" className={styles.contextLabel} aria-live="polite">
                  {getOptionLabel(subjectOptions, selectedSubjectId)} ·{' '}
                  {getOptionLabel(classGroupOptions, selectedClassGroupId)} ·{' '}
                  {knowledgeObjectOptions.length}{' '}
                  {knowledgeObjectOptions.length === 1 ? 'opção' : 'opções'}
                </p>
                <div className={styles.checkboxGrid}>
                  {knowledgeObjectOptions.map((option) => {
                    const isChecked = selectedKnowledgeObjectIds.includes(option.id);
                    return (
                      <label
                        className={`${styles.choiceOption} ${
                          isChecked ? styles.choiceOptionSelected : ''
                        }`}
                        key={option.id}
                      >
                        <input
                          className={styles.choiceCheckbox}
                          type="checkbox"
                          name="knowledgeObjectIds"
                          checked={isChecked}
                          onChange={() => toggleKnowledgeObject(option.id)}
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {errors.knowledgeObjectIds?.message ? (
              <p id="knowledge-objects-error" className={styles.fieldError} role="alert">
                {errors.knowledgeObjectIds.message}
              </p>
            ) : null}

            {selectedKnowledgeObjectIds.includes(OTHER_KNOWLEDGE_OBJECT_ID) ? (
              <FormField
                id="other-knowledge-object"
                label="Descreva o outro objeto do conhecimento"
                required
                error={errors.otherKnowledgeObject?.message}
                className={styles.otherField}
              >
                <textarea
                  id="other-knowledge-object"
                  className={`${controlStyles.control} ${
                    errors.otherKnowledgeObject ? controlStyles.hasError : ''
                  }`}
                  rows={3}
                  required
                  aria-invalid={Boolean(errors.otherKnowledgeObject)}
                  aria-describedby={
                    errors.otherKnowledgeObject ? 'other-knowledge-object-error' : undefined
                  }
                  {...register('otherKnowledgeObject')}
                />
              </FormField>
            ) : null}
          </fieldset>
          <p className={styles.selectionNotice} aria-live="polite">
            {knowledgeSelectionNotice}
          </p>
        </section>

        <section className={styles.formSection} aria-labelledby="resources-title">
          <div className={styles.sectionHeading}>
            <span aria-hidden="true">4</span>
            <div>
              <h2 id="resources-title">Itens que serão utilizados</h2>
              <p>Marque todos os recursos necessários para a aula.</p>
            </div>
          </div>

          <fieldset
            className={`${styles.optionFieldset} ${
              errors.resourceIds ? styles.optionFieldsetError : ''
            }`}
            aria-invalid={Boolean(errors.resourceIds)}
            aria-describedby={errors.resourceIds ? 'resources-error' : undefined}
          >
            <legend className="srOnly">Itens que serão utilizados</legend>
            <div className={styles.checkboxGrid}>
              {resourceOptions.map((option) => {
                const isChecked = selectedResourceIds.includes(option.id);
                return (
                  <label
                    className={`${styles.choiceOption} ${
                      isChecked ? styles.choiceOptionSelected : ''
                    }`}
                    key={option.id}
                  >
                    <input
                      className={styles.choiceCheckbox}
                      type="checkbox"
                      name="resourceIds"
                      checked={isChecked}
                      onChange={() => toggleResource(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
            {errors.resourceIds?.message ? (
              <p id="resources-error" className={styles.fieldError} role="alert">
                {errors.resourceIds.message}
              </p>
            ) : null}
            {selectedResourceIds.includes(OTHER_RESOURCE_ID) ? (
              <Input
                containerClassName={styles.otherField}
                label="Qual outro item ou recurso?"
                required
                error={errors.otherResource?.message}
                {...register('otherResource')}
              />
            ) : null}
          </fieldset>
        </section>

        {showObservations ? (
          <section className={styles.formSection} aria-labelledby="notes-title">
            <div className={styles.sectionHeading}>
              <span aria-hidden="true">5</span>
              <div>
                <h2 id="notes-title">Observações</h2>
                <p>Use este espaço somente se precisar complementar o pedido.</p>
              </div>
            </div>

            <FormField
              id="booking-notes"
              label="Observações"
              labelHidden
              error={errors.notes?.message}
            >
              <textarea
                id="booking-notes"
                className={`${controlStyles.control} ${errors.notes ? controlStyles.hasError : ''}`}
                rows={3}
                placeholder="Opcional"
                aria-invalid={Boolean(errors.notes)}
                aria-describedby={errors.notes ? 'booking-notes-error' : undefined}
                {...register('notes')}
              />
            </FormField>
          </section>
        ) : null}

        {requestError ? <ErrorMessage>{requestError.message}</ErrorMessage> : null}

        <Button
          type="submit"
          fullWidth
          isLoading={isSubmitting}
          loadingLabel="Confirmando…"
          disabled={isLoadingAvailability || availability?.periods.length === 0}
        >
          Confirmar agendamento
        </Button>
      </form>
    </div>
  );
}
