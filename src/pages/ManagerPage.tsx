import {
  ArrowLeft,
  BookOpen,
  Building2,
  CalendarDays,
  CalendarClock,
  Check,
  ClipboardList,
  GraduationCap,
  MessageCircle,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { useBootstrap } from '../app/BootstrapContext';
import { Button, ErrorMessage, Loading } from '../components';
import controlStyles from '../components/FormField/Control.module.css';
import {
  createClassPeriods,
  createDefaultLaboratoryAdminConfiguration,
  DEFAULT_BOOKING_FORM_CONFIGURATION,
  DEFAULT_CLASS_GROUPS,
  DEFAULT_RESOURCES,
  DEFAULT_SED_SC_CONFIGURATION,
  DEFAULT_SHIFTS,
  DEFAULT_SUBJECTS,
  getShiftEndTime,
  isGoogleChatSpaceName,
  isDeferredSetupValidationIssue,
  validateAdminConfiguration,
} from '../domain/configuration';
import { LaboratoryPublicAccess } from '../features/publicAccess';
import { ManagerReservations } from '../features/managerReservations';
import { useGoogleSheets } from '../integrations/google/GoogleSheetsProvider';
import type {
  AdminConfiguration,
  AdminConfigurationClient,
  AdminConfigurationDraft,
  AppError,
  BackendClient,
  GradeId,
  IsoWeekday,
  LaboratoryAdminConfiguration,
} from '../types';
import { BackendError, getFriendlyError } from '../types';
import styles from './ManagerPage.module.css';

const MANAGER_SECTIONS = [
  'geral',
  'agendamentos',
  'horarios',
  'turmas',
  'disciplinas',
  'formulario',
] as const;
type ManagerSection = (typeof MANAGER_SECTIONS)[number];
const SECTION_LINKS: readonly {
  id: ManagerSection;
  label: string;
  icon: typeof Building2;
}[] = [
  { id: 'geral', label: 'Geral', icon: Building2 },
  { id: 'agendamentos', label: 'Agendamentos', icon: CalendarDays },
  { id: 'horarios', label: 'Horários', icon: CalendarClock },
  { id: 'turmas', label: 'Turmas', icon: GraduationCap },
  { id: 'disciplinas', label: 'Disciplinas', icon: BookOpen },
  { id: 'formulario', label: 'Formulário', icon: ClipboardList },
];

const WEEKDAYS: readonly { id: IsoWeekday; shortLabel: string; label: string }[] = [
  { id: 1, shortLabel: 'Seg', label: 'Segunda-feira' },
  { id: 2, shortLabel: 'Ter', label: 'Terça-feira' },
  { id: 3, shortLabel: 'Qua', label: 'Quarta-feira' },
  { id: 4, shortLabel: 'Qui', label: 'Quinta-feira' },
  { id: 5, shortLabel: 'Sex', label: 'Sexta-feira' },
  { id: 6, shortLabel: 'Sáb', label: 'Sábado' },
  { id: 7, shortLabel: 'Dom', label: 'Domingo' },
];

const GRADE_OPTIONS: readonly { id: GradeId; label: string }[] = [
  { id: 'high-school-1', label: '1ª série' },
  { id: 'high-school-2', label: '2ª série' },
  { id: 'high-school-3', label: '3ª série' },
  { id: 'eja', label: 'EJA' },
  { id: 'other', label: 'Outra etapa' },
];

let generatedIdSequence = 0;

function createGeneratedId(prefix: string): string {
  generatedIdSequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${generatedIdSequence}`;
}

function createRevision(): string {
  return `configuration-${crypto.randomUUID()}`;
}

function isValidResponsibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function hasQuickAccessMainData(
  configuration: AdminConfigurationDraft,
  laboratoryId: string,
): boolean {
  const laboratory = configuration.laboratories.find(({ id }) => id === laboratoryId);
  const settings = configuration.laboratorySettings.find(
    ({ laboratoryId: settingsLaboratoryId }) => settingsLaboratoryId === laboratoryId,
  );

  return Boolean(
    configuration.school.name.trim() &&
    laboratory?.active &&
    laboratory.name.trim() &&
    settings?.responsibleName.trim() &&
    isValidResponsibleEmail(settings?.responsibleEmail ?? ''),
  );
}

function supportsAdminConfiguration(
  client: BackendClient,
): client is BackendClient & AdminConfigurationClient {
  return 'getAdminConfiguration' in client && 'saveAdminConfiguration' in client;
}

function createEmptySchoolConfiguration(): AdminConfiguration {
  const schoolId = `SCHOOL-${crypto.randomUUID()}`;

  return {
    revision: createRevision(),
    school: { id: schoolId, name: '' },
    laboratories: [],
    shifts: [],
    classGroups: [],
    subjects: [],
    resources: [],
    bookingForm: structuredClone(DEFAULT_BOOKING_FORM_CONFIGURATION),
    laboratorySettings: [],
    sedSc: structuredClone(DEFAULT_SED_SC_CONFIGURATION),
  };
}

function withDefaultConfigurationValues(configuration: AdminConfigurationDraft): AdminConfigurationDraft {
  return {
    ...configuration,
    shifts: [...configuration.shifts],
    classGroups: [...configuration.classGroups],
    subjects: [...configuration.subjects],
    resources: [...configuration.resources],
  };
}

function createNextClassGroupLabel(classGroups: AdminConfigurationDraft['classGroups']): string {
  const existingLabels = new Set(classGroups.map(({ label }) => label.trim().toLocaleLowerCase()));
  let sequence = classGroups.length + 1;

  while (existingLabels.has(`nova turma ${sequence}`)) {
    sequence += 1;
  }

  return `Nova turma ${sequence}`;
}

function toDraft(configuration: AdminConfiguration): AdminConfigurationDraft {
  const cloned = structuredClone(configuration);
  return {
    school: cloned.school,
    laboratories: cloned.laboratories,
    shifts: cloned.shifts,
    classGroups: cloned.classGroups,
    subjects: cloned.subjects,
    resources: cloned.resources,
    bookingForm: cloned.bookingForm,
    laboratorySettings: cloned.laboratorySettings,
    sedSc: cloned.sedSc,
  };
}

function updateAt<T>(items: readonly T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function updateLaboratorySettings(
  configuration: AdminConfigurationDraft,
  laboratoryId: string,
  recipe: (settings: LaboratoryAdminConfiguration) => LaboratoryAdminConfiguration,
): AdminConfigurationDraft {
  const settingsIndex = configuration.laboratorySettings.findIndex(
    (settings) => settings.laboratoryId === laboratoryId,
  );
  const currentSettings =
    settingsIndex >= 0
      ? configuration.laboratorySettings[settingsIndex]!
      : createDefaultLaboratoryAdminConfiguration(laboratoryId);
  const nextSettings = recipe(currentSettings);

  return {
    ...configuration,
    laboratorySettings:
      settingsIndex >= 0
        ? updateAt(configuration.laboratorySettings, settingsIndex, nextSettings)
        : [...configuration.laboratorySettings, nextSettings],
  };
}

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.sectionHeading}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

export interface GoogleChatActivationResult {
  spaceName: string;
}

export type GoogleChatActivationCallback = (
  laboratoryId: string,
) => Promise<GoogleChatActivationResult>;

export interface ManagerPageProps {
  onActivateGoogleChat?: GoogleChatActivationCallback;
}

export function ManagerPage({ onActivateGoogleChat }: ManagerPageProps) {
  const { section } = useParams<{ section: string }>();
  const { client, reload } = useBootstrap();
  const {
    cancelReservationPeriods,
    connectPrivateGoogleChat,
    listReservations,
    loadLinkedConfiguration,
    publicSchoolError,
    publicSchoolReady,
    spreadsheetId,
    spreadsheetUrl,
    syncConfiguration,
  } = useGoogleSheets();
  const activateGoogleChat = onActivateGoogleChat ?? (async () => await connectPrivateGoogleChat());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [savedConfiguration, setSavedConfiguration] = useState<AdminConfiguration | null>(null);
  const [draft, setDraft] = useState<AdminConfigurationDraft | null>(null);
  const [pendingGoogleSync, setPendingGoogleSync] = useState<AdminConfiguration | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);
  const [saveError, setSaveError] = useState<AppError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [successMessage, setSuccessMessage] = useState('');

  const activeSection = MANAGER_SECTIONS.includes(section as ManagerSection)
    ? (section as ManagerSection)
    : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let isCurrent = true;

    void (async () => {
      try {
        let configuration: AdminConfiguration | null = null;
        if (spreadsheetId) {
          const linkedConfiguration = await loadLinkedConfiguration();
          if (!isCurrent) {
            return;
          }
          configuration = linkedConfiguration;
        }

        if (supportsAdminConfiguration(client)) {
          const localConfiguration = await client.getAdminConfiguration();
          if (!isCurrent) {
            return;
          }

          if (
            configuration &&
            JSON.stringify(toDraft(configuration)) !== JSON.stringify(toDraft(localConfiguration))
          ) {
            configuration = await client.saveAdminConfiguration({
              expectedRevision: localConfiguration.revision,
              configuration: toDraft(configuration),
            });
            if (!isCurrent) {
              return;
            }
            reload();
          } else {
            configuration ??= localConfiguration;
          }
        }

        configuration ??= createEmptySchoolConfiguration();

        setSavedConfiguration(configuration);
        setDraft(toDraft(configuration));
      } catch (error: unknown) {
        if (isCurrent) {
          setLoadError(
            error instanceof Error && error.message.trim()
              ? { code: 'BACKEND_UNAVAILABLE', message: error.message }
              : getFriendlyError(error),
          );
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [client, loadLinkedConfiguration, loadVersion, reload, spreadsheetId]);

  const validationIssues = useMemo(() => (draft ? validateAdminConfiguration(draft) : []), [draft]);
  const visibleValidationIssues = useMemo(
    () =>
      activeSection === 'geral'
        ? validationIssues.filter((issue) => !isDeferredSetupValidationIssue(issue))
        : validationIssues,
    [activeSection, validationIssues],
  );
  const isDirty = useMemo(
    () =>
      Boolean(
        draft &&
        savedConfiguration &&
        JSON.stringify(draft) !== JSON.stringify(toDraft(savedConfiguration)),
      ),
    [draft, savedConfiguration],
  );
  const needsGoogleSync = !spreadsheetId || pendingGoogleSync !== null;
  const publicLinksEnabled = Boolean(
    spreadsheetId && publicSchoolReady && !isDirty && !needsGoogleSync,
  );
  const publicLinksMessage =
    !publicSchoolReady && spreadsheetId && !isDirty && !pendingGoogleSync
      ? (publicSchoolError ?? 'Tente novamente para concluir o acesso público desta escola.')
      : 'Salve os dados principais para gerar o link e o QR Code.';

  useEffect(() => {
    if (!isDirty && !pendingGoogleSync) {
      return;
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty, pendingGoogleSync]);

  if (!activeSection) {
    return <Navigate to="/gerenciar/geral" replace />;
  }

  function changeDraft(recipe: (current: AdminConfigurationDraft) => AdminConfigurationDraft) {
    setDraft((current) => (current ? recipe(current) : current));
    setSaveError(null);
    setSuccessMessage('');
  }

  function discardChanges() {
    if (!savedConfiguration) {
      return;
    }
    if (
      !window.confirm(
        'Descartar o rascunho completo? Isso desfará alterações feitas em todas as seções.',
      )
    ) {
      return;
    }
    setDraft(toDraft(savedConfiguration));
    setSaveError(null);
    setSuccessMessage('Alterações descartadas.');
  }

  async function saveChanges(quickAccessLaboratoryId?: string) {
    const isQuickAccess = quickAccessLaboratoryId !== undefined;
    const blockingValidationIssues = isQuickAccess
      ? validationIssues.filter((issue) => !isDeferredSetupValidationIssue(issue))
      : validationIssues;
    if (
      !draft ||
      !savedConfiguration ||
      blockingValidationIssues.length > 0 ||
      (isQuickAccess && !hasQuickAccessMainData(draft, quickAccessLaboratoryId)) ||
      (!isQuickAccess && !isDirty && !needsGoogleSync)
    ) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSuccessMessage('');
    try {
      const normalizedDraft = withDefaultConfigurationValues(draft);
      let configurationForGoogle: AdminConfiguration | null = pendingGoogleSync;

      if (isDirty) {
        if (supportsAdminConfiguration(client)) {
          const saved = await client.saveAdminConfiguration({
            expectedRevision: savedConfiguration.revision,
            configuration: draft,
          });
          configurationForGoogle = saved;
          setSavedConfiguration(saved);
          setDraft(toDraft(saved));
        } else {
          let currentGoogleConfiguration: AdminConfiguration | null = null;
          if (spreadsheetId) {
            currentGoogleConfiguration = await loadLinkedConfiguration();
            const expectedCurrentRevision =
              pendingGoogleSync &&
              currentGoogleConfiguration?.revision === pendingGoogleSync.revision
                ? pendingGoogleSync.revision
                : savedConfiguration.revision;
            if (
              currentGoogleConfiguration &&
              currentGoogleConfiguration.revision !== expectedCurrentRevision
            ) {
              throw new BackendError(
                'CONFIGURATION_CONFLICT',
                'As configurações foram alteradas em outra tela. Recarregue antes de salvar novamente.',
              );
            }
          }
          const pendingConfigurationAlreadyWritten = Boolean(
            pendingGoogleSync &&
            currentGoogleConfiguration?.revision === pendingGoogleSync.revision &&
            JSON.stringify(normalizedDraft) === JSON.stringify(toDraft(pendingGoogleSync)),
          );
          if (pendingConfigurationAlreadyWritten && pendingGoogleSync) {
            configurationForGoogle = pendingGoogleSync;
          } else {
            configurationForGoogle = {
              revision: createRevision(),
              ...structuredClone(normalizedDraft),
            } as AdminConfiguration;
          }
        }
        setPendingGoogleSync(configurationForGoogle);
      }

      if (!configurationForGoogle) {
        configurationForGoogle = {
          revision: savedConfiguration.revision,
          ...structuredClone(normalizedDraft),
        } as AdminConfiguration;
      }

      try {
        await syncConfiguration(configurationForGoogle);
        setSavedConfiguration(configurationForGoogle);
        setDraft(toDraft(configurationForGoogle));
        setPendingGoogleSync(null);
        reload();

        setSuccessMessage(
          isQuickAccess
            ? 'Dados salvos. Link e QR Code prontos para compartilhar.'
            : 'Configurações salvas, sincronizadas e verificadas no Google Sheets.',
        );
      } catch (error: unknown) {
        setPendingGoogleSync(configurationForGoogle);
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Tente novamente em instantes.';
        setSaveError({
          code: 'BACKEND_UNAVAILABLE',
          message: `Os agendamentos foram preservados, mas o acesso público ainda não foi confirmado. Tente salvar novamente. ${message}`,
        });
      }
    } catch (error: unknown) {
      setSaveError(getFriendlyError(error));
    } finally {
      setIsSaving(false);
    }
  }

  function reloadConfiguration() {
    if (
      isDirty &&
      !window.confirm(
        'Recarregar a configuração salva? O rascunho atual de todas as seções será perdido.',
      )
    ) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    setSaveError(null);
    setSuccessMessage('');
    setLoadVersion((version) => version + 1);
  }

  function leaveManager(event: MouseEvent<HTMLAnchorElement>) {
    if (isSaving) {
      event.preventDefault();
      return;
    }
    if (isDirty && !window.confirm('Sair sem salvar? O rascunho atual será descartado.')) {
      event.preventDefault();
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <Link
          className={styles.backLink}
          to="/"
          aria-disabled={isSaving || undefined}
          onClick={leaveManager}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Voltar ao início
        </Link>
        <div className={styles.titleRow}>
          <div>
            <p className={styles.eyebrow}>Configuração da escola</p>
            <h1 ref={headingRef} tabIndex={-1}>
              Painel do gerenciador
            </h1>
            <p>Defina o que professores verão ao consultar e reservar o laboratório.</p>
          </div>
          <p className={styles.accessNotice}>
            {spreadsheetUrl ? (
              <a href={spreadsheetUrl} target="_blank" rel="noreferrer">
                Abrir planilha de configurações
              </a>
            ) : (
              'Controle de acesso será conectado posteriormente.'
            )}
          </p>
        </div>
      </header>

      <div className={styles.workspace}>
        <nav className={styles.navigation} aria-label="Seções do gerenciador">
          {SECTION_LINKS.map(({ id, label, icon: Icon }) => (
            <NavLink
              key={id}
              to={`/gerenciar/${id}`}
              className={({ isActive }) =>
                `${styles.navigationLink} ${isActive ? styles.navigationLinkActive : ''}`
              }
            >
              <Icon size={19} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.content} aria-busy={isLoading || isSaving}>
          {isLoading ? <Loading label="Carregando configurações…" size="large" /> : null}

          {!isLoading && loadError ? (
            <ErrorMessage
              action={
                <Button variant="secondary" onClick={reloadConfiguration}>
                  Tentar novamente
                </Button>
              }
            >
              {loadError.message}
            </ErrorMessage>
          ) : null}

          {!isLoading && draft ? (
            <>
              {successMessage ? (
                <p className={styles.successMessage} role="status">
                  <Check size={18} aria-hidden="true" />
                  {successMessage}
                </p>
              ) : null}

              {visibleValidationIssues.length > 0 ? (
                <div className={styles.validationSummary} role="alert">
                  <strong>Revise a configuração antes de salvar:</strong>
                  <ul>
                    {visibleValidationIssues.map((issue) => (
                      <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <fieldset className={styles.editorFieldset} disabled={isSaving}>
                {activeSection === 'geral' ? (
                  <GeneralSection
                    draft={draft}
                    changeDraft={changeDraft}
                    isSaving={isSaving}
                    validationIssues={validationIssues}
                    publicLinksEnabled={publicLinksEnabled}
                    publicLinksMessage={publicLinksMessage}
                    onActivateGoogleChat={activateGoogleChat}
                    onSaveAndGenerateQrCode={(laboratoryId) => void saveChanges(laboratoryId)}
                  />
                ) : null}
                {activeSection === 'agendamentos' && savedConfiguration ? (
                  <ManagerReservations
                    configuration={savedConfiguration}
                    loadReservations={listReservations}
                    cancelReservationPeriods={cancelReservationPeriods}
                  />
                ) : null}
                {activeSection === 'horarios' ? (
                  <ScheduleSection draft={draft} changeDraft={changeDraft} />
                ) : null}
                {activeSection === 'turmas' ? (
                  <ClassesSection draft={draft} changeDraft={changeDraft} />
                ) : null}
                {activeSection === 'disciplinas' ? (
                  <SubjectsSection draft={draft} changeDraft={changeDraft} />
                ) : null}
                {activeSection === 'formulario' ? (
                  <BookingFormSection draft={draft} changeDraft={changeDraft} />
                ) : null}
              </fieldset>

              {saveError ? (
                <ErrorMessage
                  action={
                    saveError.code === 'CONFIGURATION_CONFLICT' ? (
                      <Button variant="secondary" onClick={reloadConfiguration}>
                        Recarregar configuração publicada
                      </Button>
                    ) : undefined
                  }
                >
                  {saveError.message}
                </ErrorMessage>
              ) : null}

              <div className={styles.saveBar}>
                <p aria-live="polite">
                  {isDirty
                    ? 'Há alterações não salvas em uma ou mais seções.'
                    : pendingGoogleSync
                      ? 'A configuração está salva nesta sessão, mas a sincronização com o Google Sheets está pendente.'
                      : !spreadsheetId
                        ? 'A planilha de configurações será criada no primeiro salvamento.'
                        : validationIssues.length > 0
                          ? activeSection === 'geral' && visibleValidationIssues.length === 0
                            ? 'Os dados principais podem ser salvos agora. Horários, turmas e recursos podem ser configurados depois.'
                            : 'A planilha já foi criada. Complete a configuração para publicar os dados.'
                          : 'Todas as alterações estão salvas e sincronizadas.'}
                </p>
                <div className={styles.saveActions}>
                  <Button
                    variant="secondary"
                    disabled={!isDirty || isSaving}
                    onClick={discardChanges}
                  >
                    <RotateCcw size={17} aria-hidden="true" />
                    Descartar rascunho
                  </Button>
                  <Button
                    disabled={(!isDirty && !needsGoogleSync) || validationIssues.length > 0}
                    isLoading={isSaving}
                    loadingLabel="Salvando…"
                    onClick={() => void saveChanges()}
                  >
                    <Save size={17} aria-hidden="true" />
                    Salvar alterações
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ConfigurationSectionProps {
  draft: AdminConfigurationDraft;
  changeDraft: (recipe: (current: AdminConfigurationDraft) => AdminConfigurationDraft) => void;
}

interface GeneralSectionProps extends ConfigurationSectionProps {
  isSaving: boolean;
  validationIssues: ReturnType<typeof validateAdminConfiguration>;
  publicLinksEnabled: boolean;
  publicLinksMessage: string;
  onActivateGoogleChat: GoogleChatActivationCallback;
  onSaveAndGenerateQrCode: (laboratoryId: string) => void;
}

function GeneralSection({
  draft,
  changeDraft,
  isSaving,
  validationIssues,
  publicLinksEnabled,
  publicLinksMessage,
  onActivateGoogleChat,
  onSaveAndGenerateQrCode,
}: GeneralSectionProps) {
  const [openLaboratoryIds, setOpenLaboratoryIds] = useState<ReadonlySet<string>>(
    () => new Set(draft.laboratories[0] ? [draft.laboratories[0].id] : []),
  );
  const [activatingChatLaboratoryId, setActivatingChatLaboratoryId] = useState<string | null>(null);
  const [chatConnectionErrors, setChatConnectionErrors] = useState<
    Readonly<Record<string, string | undefined>>
  >({});

  function clearChatConnectionError(laboratoryId: string) {
    setChatConnectionErrors((current) => ({ ...current, [laboratoryId]: undefined }));
  }

  async function activateGoogleChat(laboratoryId: string) {
    setActivatingChatLaboratoryId(laboratoryId);
    clearChatConnectionError(laboratoryId);
    try {
      const result = await onActivateGoogleChat(laboratoryId);
      const spaceName = result.spaceName.trim();
      if (!isGoogleChatSpaceName(spaceName)) {
        throw new Error('O Google não retornou uma conversa privada válida. Tente novamente.');
      }
      changeDraft((current) =>
        updateLaboratorySettings(current, laboratoryId, (currentSettings) => ({
          ...currentSettings,
          googleChatEnabled: true,
          googleChatSpaceName: spaceName,
        })),
      );
    } catch (error: unknown) {
      setChatConnectionErrors((current) => ({
        ...current,
        [laboratoryId]:
          error instanceof Error && error.message.trim()
            ? error.message
            : 'Não foi possível ativar o Google Chat. Tente novamente.',
      }));
    } finally {
      setActivatingChatLaboratoryId(null);
    }
  }

  function deactivateGoogleChat(laboratoryId: string) {
    clearChatConnectionError(laboratoryId);
    changeDraft((current) =>
      updateLaboratorySettings(current, laboratoryId, (currentSettings) => ({
        ...currentSettings,
        googleChatEnabled: false,
        googleChatSpaceName: '',
      })),
    );
  }

  function addLaboratory() {
    const laboratoryId = createGeneratedId('LAB');
    setOpenLaboratoryIds((current) => new Set([...current, laboratoryId]));
    changeDraft((current) => {
      const laboratory = {
        id: laboratoryId,
        name: '',
        active: true,
      };
      return {
        ...current,
        laboratories: [...current.laboratories, laboratory],
        laboratorySettings: [
          ...current.laboratorySettings,
          createDefaultLaboratoryAdminConfiguration(laboratoryId),
        ],
      };
    });
  }

  const hasQuickAccessBlockingIssues = validationIssues.some(
    (issue) => !isDeferredSetupValidationIssue(issue),
  );

  return (
    <section>
      <SectionHeading
        title="Geral"
        description="Identificação da escola e laboratórios disponíveis para reserva."
      />

      <div className={styles.card}>
        <h3>Escola</h3>
        <label className={styles.field}>
          <span>Nome da escola</span>
          <input
            className={controlStyles.control}
            value={draft.school.name}
            maxLength={120}
            onChange={(event) => {
              const name = event.currentTarget.value;
              changeDraft((current) => ({ ...current, school: { ...current.school, name } }));
            }}
          />
        </label>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeading}>
          <div>
            <h3>Laboratórios</h3>
            <p>O nome aparece no topo do link público de cada laboratório.</p>
          </div>
          <Button variant="secondary" size="small" onClick={addLaboratory}>
            <Plus size={17} aria-hidden="true" />
            Adicionar
          </Button>
        </div>

        <div className={styles.scheduleList}>
          {draft.laboratories.map((laboratory, index) => {
            const settings =
              draft.laboratorySettings.find(
                (candidate) => candidate.laboratoryId === laboratory.id,
              ) ?? createDefaultLaboratoryAdminConfiguration(laboratory.id);
            const laboratoryNumber = index + 1;
            const hasMainData = hasQuickAccessMainData(draft, laboratory.id);
            const isGoogleChatConnected =
              settings.googleChatEnabled && isGoogleChatSpaceName(settings.googleChatSpaceName);
            const isActivatingGoogleChat = activatingChatLaboratoryId === laboratory.id;
            const chatConnectionError = chatConnectionErrors[laboratory.id];
            const canSaveAndGenerateQrCode = hasMainData && !hasQuickAccessBlockingIssues;
            const quickAccessMessage = !hasMainData
              ? 'Informe o nome da escola, o nome do laboratório, o responsável e um e-mail válido.'
              : hasQuickAccessBlockingIssues
                ? 'Revise os campos indicados antes de gerar o acesso.'
                : publicLinksMessage;

            return (
              <details
                className={styles.shiftCard}
                key={laboratory.id}
                open={openLaboratoryIds.has(laboratory.id)}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenLaboratoryIds((current) => {
                    if (current.has(laboratory.id) === isOpen) {
                      return current;
                    }
                    const next = new Set(current);
                    if (isOpen) {
                      next.add(laboratory.id);
                    } else {
                      next.delete(laboratory.id);
                    }
                    return next;
                  });
                }}
              >
                <summary>
                  <span>
                    <strong>{laboratory.name || `Laboratório ${laboratoryNumber}`}</strong>
                    <small>{settings.responsibleName || 'Responsável ainda não informado'}</small>
                  </span>
                  <span className={laboratory.active ? styles.activeBadge : styles.inactiveBadge}>
                    {laboratory.active ? 'Ativo' : 'Inativo'}
                  </span>
                </summary>

                <div className={styles.shiftBody}>
                  <label className={styles.toggle}>
                    <input
                      type="checkbox"
                      checked={laboratory.active}
                      onChange={(event) => {
                        const active = event.currentTarget.checked;
                        changeDraft((current) => ({
                          ...current,
                          laboratories: updateAt(current.laboratories, index, {
                            ...current.laboratories[index]!,
                            active,
                          }),
                        }));
                      }}
                    />
                    Disponível para agendamentos
                  </label>

                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      <span>Nome do laboratório {laboratoryNumber}</span>
                      <input
                        className={controlStyles.control}
                        value={laboratory.name}
                        maxLength={100}
                        onChange={(event) => {
                          const name = event.currentTarget.value;
                          changeDraft((current) => ({
                            ...current,
                            laboratories: updateAt(current.laboratories, index, {
                              ...current.laboratories[index]!,
                              name,
                            }),
                          }));
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Laboratorista responsável {laboratoryNumber}</span>
                      <input
                        className={controlStyles.control}
                        value={settings.responsibleName}
                        maxLength={120}
                        placeholder="Nome completo"
                        onChange={(event) => {
                          const responsibleName = event.currentTarget.value;
                          changeDraft((current) =>
                            updateLaboratorySettings(current, laboratory.id, (currentSettings) => ({
                              ...currentSettings,
                              responsibleName,
                            })),
                          );
                        }}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>E-mail do responsável {laboratoryNumber}</span>
                      <input
                        className={controlStyles.control}
                        type="email"
                        value={settings.responsibleEmail}
                        maxLength={180}
                        disabled={isActivatingGoogleChat}
                        placeholder="nome@escola.gov.br"
                        onChange={(event) => {
                          const responsibleEmail = event.currentTarget.value;
                          clearChatConnectionError(laboratory.id);
                          changeDraft((current) =>
                            updateLaboratorySettings(current, laboratory.id, (currentSettings) => ({
                              ...currentSettings,
                              responsibleEmail,
                              googleChatEnabled: false,
                              googleChatSpaceName: '',
                            })),
                          );
                        }}
                      />
                    </label>
                  </div>

                  {laboratory.active && hasMainData && publicLinksEnabled ? (
                    <LaboratoryPublicAccess
                      schoolId={draft.school.id}
                      laboratoryId={laboratory.id}
                      laboratoryName={laboratory.name || `Laboratório ${laboratoryNumber}`}
                    />
                  ) : laboratory.active ? (
                    <div className={styles.quickAccessPanel}>
                      <p className={styles.securityNote}>{quickAccessMessage}</p>
                      <Button
                        disabled={!canSaveAndGenerateQrCode}
                        isLoading={isSaving}
                        loadingLabel="Salvando e gerando…"
                        onClick={() => onSaveAndGenerateQrCode(laboratory.id)}
                      >
                        <QrCode size={17} aria-hidden="true" />
                        Salvar e gerar QR Code
                      </Button>
                    </div>
                  ) : (
                    <p className={styles.securityNote}>
                      Ative este laboratório para gerar seu link e QR Code.
                    </p>
                  )}

                  <div className={styles.configurationGroup}>
                    <div>
                      <h4>Capacidade</h4>
                      <p>Ative somente os limites que este laboratório precisa controlar.</p>
                    </div>
                    <div className={styles.optionGrid}>
                      <div className={styles.optionCard}>
                        <label className={styles.toggle}>
                          <input
                            type="checkbox"
                            checked={settings.maxConcurrentClasses !== null}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    maxConcurrentClasses: checked
                                      ? (currentSettings.maxConcurrentClasses ?? 1)
                                      : null,
                                  }),
                                ),
                              );
                            }}
                          />
                          Limitar turmas simultâneas
                        </label>
                        <label className={styles.field}>
                          <span>Máximo de turmas</span>
                          <input
                            className={controlStyles.control}
                            type="number"
                            min={1}
                            max={50}
                            disabled={settings.maxConcurrentClasses === null}
                            value={settings.maxConcurrentClasses ?? ''}
                            onChange={(event) => {
                              const maxConcurrentClasses = event.currentTarget.valueAsNumber;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    maxConcurrentClasses: Number.isNaN(maxConcurrentClasses)
                                      ? 0
                                      : maxConcurrentClasses,
                                  }),
                                ),
                              );
                            }}
                          />
                        </label>
                      </div>
                      <div className={styles.optionCard}>
                        <label className={styles.toggle}>
                          <input
                            type="checkbox"
                            checked={settings.maxStudentCapacity !== null}
                            onChange={(event) => {
                              const checked = event.currentTarget.checked;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    maxStudentCapacity: checked
                                      ? (currentSettings.maxStudentCapacity ?? 20)
                                      : null,
                                  }),
                                ),
                              );
                            }}
                          />
                          Controlar a capacidade de estudantes
                        </label>
                        <label className={styles.field}>
                          <span>Capacidade do laboratório</span>
                          <input
                            className={controlStyles.control}
                            type="number"
                            min={1}
                            max={2000}
                            disabled={settings.maxStudentCapacity === null}
                            value={settings.maxStudentCapacity ?? ''}
                            onChange={(event) => {
                              const maxStudentCapacity = event.currentTarget.valueAsNumber;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    maxStudentCapacity: Number.isNaN(maxStudentCapacity)
                                      ? 0
                                      : maxStudentCapacity,
                                  }),
                                ),
                              );
                            }}
                          />
                          <small>
                            Ao ultrapassar esse total, o professor receberá um aviso antes de
                            continuar.
                          </small>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className={styles.configurationGroup}>
                    <div>
                      <h4>Política de agendamento</h4>
                      <p>Estas regras serão aplicadas ao formulário do professor posteriormente.</p>
                    </div>
                    <div className={styles.fieldGrid}>
                      <label className={styles.field}>
                        <span>Antecedência mínima</span>
                        <input
                          className={controlStyles.control}
                          type="number"
                          min={0}
                          max={10080}
                          value={settings.minimumLeadTimeValue}
                          onChange={(event) => {
                            const minimumLeadTimeValue = event.currentTarget.valueAsNumber;
                            changeDraft((current) =>
                              updateLaboratorySettings(
                                current,
                                laboratory.id,
                                (currentSettings) => ({
                                  ...currentSettings,
                                  minimumLeadTimeValue: Number.isNaN(minimumLeadTimeValue)
                                    ? 0
                                    : minimumLeadTimeValue,
                                }),
                              ),
                            );
                          }}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Unidade da antecedência</span>
                        <select
                          className={controlStyles.control}
                          value={settings.minimumLeadTimeUnit}
                          onChange={(event) => {
                            const minimumLeadTimeUnit = event.currentTarget
                              .value as LaboratoryAdminConfiguration['minimumLeadTimeUnit'];
                            changeDraft((current) =>
                              updateLaboratorySettings(
                                current,
                                laboratory.id,
                                (currentSettings) => ({
                                  ...currentSettings,
                                  minimumLeadTimeUnit,
                                }),
                              ),
                            );
                          }}
                        >
                          <option value="MINUTES">Minutos</option>
                          <option value="HOURS">Horas</option>
                          <option value="DAYS">Dias</option>
                        </select>
                      </label>
                    </div>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={settings.allowPastBookings}
                        onChange={(event) => {
                          const allowPastBookings = event.currentTarget.checked;
                          changeDraft((current) =>
                            updateLaboratorySettings(current, laboratory.id, (currentSettings) => ({
                              ...currentSettings,
                              allowPastBookings,
                            })),
                          );
                        }}
                      />
                      Permitir registro de aulas em datas passadas
                    </label>
                    {settings.allowPastBookings ? (
                      <div className={styles.fieldGrid}>
                        <label className={styles.field}>
                          <span>Máximo de dias retroativos</span>
                          <input
                            className={controlStyles.control}
                            type="number"
                            min={1}
                            max={3650}
                            value={settings.pastBookingLimitDays ?? ''}
                            placeholder="Sem limite"
                            onChange={(event) => {
                              const pastBookingLimitDays = event.currentTarget.value.trim()
                                ? event.currentTarget.valueAsNumber
                                : null;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    pastBookingLimitDays:
                                      pastBookingLimitDays !== null &&
                                      Number.isNaN(pastBookingLimitDays)
                                        ? 0
                                        : pastBookingLimitDays,
                                  }),
                                ),
                              );
                            }}
                          />
                          <small>Deixe vazio para não limitar a quantidade de dias.</small>
                        </label>
                        <label className={styles.field}>
                          <span>Conflitos em registros passados</span>
                          <select
                            className={controlStyles.control}
                            value={settings.retroactiveConflictPolicy}
                            onChange={(event) => {
                              const retroactiveConflictPolicy = event.currentTarget
                                .value as LaboratoryAdminConfiguration['retroactiveConflictPolicy'];
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    retroactiveConflictPolicy,
                                  }),
                                ),
                              );
                            }}
                          >
                            <option value="WARN">Avisar e permitir</option>
                            <option value="BLOCK">Bloquear o registro</option>
                          </select>
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className={styles.configurationGroup}>
                    <div>
                      <h4>SED-SC e notificações</h4>
                      <p>Cada laboratório mantém responsável, avisos e espaço do Chat próprios.</p>
                    </div>
                    <div className={styles.optionGrid}>
                      <div className={styles.optionCard}>
                        <label className={styles.toggle}>
                          <input
                            type="checkbox"
                            checked={settings.notifyOnNewBooking}
                            onChange={(event) => {
                              const notifyOnNewBooking = event.currentTarget.checked;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    notifyOnNewBooking,
                                  }),
                                ),
                              );
                            }}
                          />
                          Avisar quando uma reserva for criada
                        </label>
                        <label className={styles.toggle}>
                          <input
                            type="checkbox"
                            checked={settings.sedIntegrationEnabled}
                            onChange={(event) => {
                              const sedIntegrationEnabled = event.currentTarget.checked;
                              changeDraft((current) =>
                                updateLaboratorySettings(
                                  current,
                                  laboratory.id,
                                  (currentSettings) => ({
                                    ...currentSettings,
                                    sedIntegrationEnabled,
                                  }),
                                ),
                              );
                            }}
                          />
                          Usar a integração SED-SC neste laboratório
                        </label>
                        <label className={styles.field}>
                          <span>Enviar o link antes da primeira aula</span>
                          <span className={styles.unitControl}>
                            <input
                              className={controlStyles.control}
                              type="number"
                              min={0}
                              max={1440}
                              disabled={!settings.sedIntegrationEnabled}
                              value={settings.sedLinkLeadMinutes}
                              onChange={(event) => {
                                const sedLinkLeadMinutes = event.currentTarget.valueAsNumber;
                                changeDraft((current) =>
                                  updateLaboratorySettings(
                                    current,
                                    laboratory.id,
                                    (currentSettings) => ({
                                      ...currentSettings,
                                      sedLinkLeadMinutes: Number.isNaN(sedLinkLeadMinutes)
                                        ? 0
                                        : sedLinkLeadMinutes,
                                    }),
                                  ),
                                );
                              }}
                            />
                            <small>min</small>
                          </span>
                        </label>
                      </div>
                      <div className={styles.optionCard}>
                        <div className={styles.chatConnectionHeading}>
                          <span className={styles.chatConnectionIcon} aria-hidden="true">
                            <MessageCircle size={20} />
                          </span>
                          <div>
                            <strong>Google Chat privado</strong>
                            <p>Receba os avisos diretamente na sua conversa com o Lab Reserva.</p>
                          </div>
                        </div>
                        <p
                          className={styles.chatConnectionStatus}
                          data-connected={isGoogleChatConnected || undefined}
                          role="status"
                        >
                          {isGoogleChatConnected ? (
                            <>
                              <Check size={17} aria-hidden="true" />
                              Conversa privada conectada
                            </>
                          ) : (
                            'Google Chat ainda não conectado'
                          )}
                        </p>
                        {isGoogleChatConnected ? (
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => deactivateGoogleChat(laboratory.id)}
                          >
                            Desativar Google Chat
                          </Button>
                        ) : (
                          <Button
                            size="small"
                            isLoading={isActivatingGoogleChat}
                            loadingLabel="Conectando…"
                            disabled={
                              activatingChatLaboratoryId !== null && !isActivatingGoogleChat
                            }
                            onClick={() => void activateGoogleChat(laboratory.id)}
                          >
                            <MessageCircle size={17} aria-hidden="true" />
                            Ativar Google Chat
                          </Button>
                        )}
                        {chatConnectionError ? (
                          <p className={styles.chatConnectionError} role="alert">
                            {chatConnectionError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <p className={styles.securityNote}>
                      A conversa será sempre privada. Nenhum token do Google Chat será salvo na
                      planilha.
                    </p>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScheduleSection({ draft, changeDraft }: ConfigurationSectionProps) {
  const [openShiftIds, setOpenShiftIds] = useState<ReadonlySet<string>>(
    () => new Set(draft.shifts[0] ? [draft.shifts[0].id] : []),
  );

  function addShift() {
    const shiftId = createGeneratedId('SHIFT');
    setOpenShiftIds((current) => new Set([...current, shiftId]));
    changeDraft((current) => ({
      ...current,
      shifts: [
        ...current.shifts,
        {
          id: shiftId,
          name: `Turno ${current.shifts.length + 1}`,
          order: current.shifts.length + 1,
          startTime: '07:30',
          classDurationMinutes: 45,
          classCount: 5,
          breakAfterClass: 3,
          breakDurationMinutes: 15,
          activeWeekdays: [1, 2, 3, 4, 5],
          active: true,
        },
      ],
    }));
  }

  return (
    <section>
      <SectionHeading
        title="Horários"
        description="Cada turno define seus dias, início, duração, número de aulas e intervalo."
        action={
          <Button variant="secondary" size="small" onClick={addShift}>
            <Plus size={17} aria-hidden="true" />
            Adicionar turno
          </Button>
        }
      />

      <p className={styles.sectionNote}>
        Para preservar reservas antigas, desative um turno que não será mais usado em vez de
        reaproveitar seu nome.
      </p>

      <div className={styles.scheduleList}>
        {draft.shifts.map((shift, index) => {
          const previewPeriods = createClassPeriods([shift]);
          const endTime = getShiftEndTime(shift);

          return (
            <details
              className={styles.shiftCard}
              key={shift.id}
              open={openShiftIds.has(shift.id)}
              onToggle={(event) => {
                const isOpen = event.currentTarget.open;
                setOpenShiftIds((current) => {
                  if (current.has(shift.id) === isOpen) {
                    return current;
                  }
                  const next = new Set(current);
                  if (isOpen) {
                    next.add(shift.id);
                  } else {
                    next.delete(shift.id);
                  }
                  return next;
                });
              }}
            >
              <summary>
                <span>
                  <strong>{shift.name || `Turno ${index + 1}`}</strong>
                  <small>
                    {shift.classCount} {shift.classCount === 1 ? 'aula' : 'aulas'} ·{' '}
                    {shift.startTime}
                    {endTime ? `–${endTime}` : ''}
                  </small>
                </span>
                <span className={shift.active ? styles.activeBadge : styles.inactiveBadge}>
                  {shift.active ? 'Ativo' : 'Inativo'}
                </span>
              </summary>

              <div className={styles.shiftBody}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={shift.active}
                    onChange={(event) => {
                      const active = event.currentTarget.checked;
                      changeDraft((current) => ({
                        ...current,
                        shifts: updateAt(current.shifts, index, {
                          ...current.shifts[index]!,
                          active,
                        }),
                      }));
                    }}
                  />
                  Turno disponível
                </label>

                <div className={styles.fieldGrid}>
                  <label className={styles.field}>
                    <span>Nome do turno</span>
                    <input
                      className={controlStyles.control}
                      value={shift.name}
                      maxLength={60}
                      onChange={(event) => {
                        const name = event.currentTarget.value;
                        changeDraft((current) => ({
                          ...current,
                          shifts: updateAt(current.shifts, index, {
                            ...current.shifts[index]!,
                            name,
                          }),
                        }));
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Início</span>
                    <input
                      className={controlStyles.control}
                      type="time"
                      value={shift.startTime}
                      onChange={(event) => {
                        const startTime = event.currentTarget.value;
                        changeDraft((current) => ({
                          ...current,
                          shifts: updateAt(current.shifts, index, {
                            ...current.shifts[index]!,
                            startTime,
                          }),
                        }));
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Duração da aula</span>
                    <span className={styles.unitControl}>
                      <input
                        className={controlStyles.control}
                        type="number"
                        min={20}
                        max={180}
                        value={shift.classDurationMinutes}
                        onChange={(event) => {
                          const classDurationMinutes = Number(event.currentTarget.value);
                          changeDraft((current) => ({
                            ...current,
                            shifts: updateAt(current.shifts, index, {
                              ...current.shifts[index]!,
                              classDurationMinutes,
                            }),
                          }));
                        }}
                      />
                      <small>min</small>
                    </span>
                  </label>
                  <label className={styles.field}>
                    <span>Número de aulas</span>
                    <input
                      className={controlStyles.control}
                      type="number"
                      min={1}
                      max={12}
                      value={shift.classCount}
                      onChange={(event) => {
                        const enteredCount = Number(event.currentTarget.value);
                        const classCount = Number.isFinite(enteredCount)
                          ? Math.min(12, Math.max(0, Math.trunc(enteredCount)))
                          : 0;
                        changeDraft((current) => {
                          const currentShift = current.shifts[index]!;
                          return {
                            ...current,
                            shifts: updateAt(current.shifts, index, {
                              ...currentShift,
                              classCount,
                              breakAfterClass:
                                currentShift.breakAfterClass !== null &&
                                currentShift.breakAfterClass < classCount
                                  ? currentShift.breakAfterClass
                                  : null,
                            }),
                          };
                        });
                      }}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>Intervalo</span>
                    <select
                      className={controlStyles.control}
                      value={shift.breakAfterClass ?? ''}
                      onChange={(event) => {
                        const breakAfterClass =
                          event.currentTarget.value === ''
                            ? null
                            : Number(event.currentTarget.value);
                        changeDraft((current) => ({
                          ...current,
                          shifts: updateAt(current.shifts, index, {
                            ...current.shifts[index]!,
                            breakAfterClass,
                          }),
                        }));
                      }}
                    >
                      <option value="">Sem intervalo</option>
                      {Array.from({ length: Math.max(0, shift.classCount - 1) }, (_, itemIndex) => {
                        const classNumber = itemIndex + 1;
                        return (
                          <option value={classNumber} key={classNumber}>
                            Após a {classNumber}ª aula
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Duração do intervalo</span>
                    <span className={styles.unitControl}>
                      <input
                        className={controlStyles.control}
                        type="number"
                        min={5}
                        max={90}
                        disabled={shift.breakAfterClass === null}
                        value={shift.breakDurationMinutes}
                        onChange={(event) => {
                          const breakDurationMinutes = Number(event.currentTarget.value);
                          changeDraft((current) => ({
                            ...current,
                            shifts: updateAt(current.shifts, index, {
                              ...current.shifts[index]!,
                              breakDurationMinutes,
                            }),
                          }));
                        }}
                      />
                      <small>min</small>
                    </span>
                  </label>
                </div>

                <fieldset className={styles.weekdayFieldset}>
                  <legend>Dias em que este turno existe</legend>
                  <div className={styles.weekdays}>
                    {WEEKDAYS.map((weekday) => (
                      <label key={weekday.id} title={weekday.label}>
                        <input
                          type="checkbox"
                          checked={shift.activeWeekdays.includes(weekday.id)}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            changeDraft((current) => {
                              const currentShift = current.shifts[index]!;
                              const activeWeekdays = checked
                                ? [...currentShift.activeWeekdays, weekday.id].toSorted(
                                    (left, right) => left - right,
                                  )
                                : currentShift.activeWeekdays.filter((day) => day !== weekday.id);
                              return {
                                ...current,
                                shifts: updateAt(current.shifts, index, {
                                  ...currentShift,
                                  activeWeekdays,
                                }),
                              };
                            });
                          }}
                        />
                        <span>{weekday.shortLabel}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className={styles.periodPreview}>
                  <strong>Prévia das aulas</strong>
                  <ol>
                    {previewPeriods.map((period) => (
                      <li key={period.id}>
                        <span>{period.name}</span>
                        <time>
                          {period.startTime}–{period.endTime}
                        </time>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function ClassesSection({ draft, changeDraft }: ConfigurationSectionProps) {
  function addClassGroup() {
    changeDraft((current) => ({
      ...current,
      classGroups: [
        ...current.classGroups,
        {
          id: createGeneratedId('CLASS'),
          label: createNextClassGroupLabel(current.classGroups),
          gradeId: 'other',
          studentCount: 30,
          order: current.classGroups.length + 1,
          active: true,
        },
      ],
    }));
  }

  function removeClassGroup(index: number) {
    changeDraft((current) => {
      if (current.classGroups.length <= 1) {
        return current;
      }

      return {
        ...current,
        classGroups: current.classGroups
          .filter((_classGroup, classGroupIndex) => classGroupIndex !== index)
          .map((classGroup, classGroupIndex) => ({
            ...classGroup,
            order: classGroupIndex + 1,
          })),
      };
    });
  }

  return (
    <section>
      <SectionHeading
        title="Turmas"
        description="Cadastre as turmas que poderão ser escolhidas pelo professor."
        action={
          <Button variant="secondary" size="small" onClick={addClassGroup}>
            <Plus size={17} aria-hidden="true" />
            Adicionar turma
          </Button>
        }
      />

      <div className={styles.catalogList}>
        {draft.classGroups.map((classGroup, index) => (
          <article
            className={styles.catalogItem}
            key={classGroup.id}
            aria-label={`Turma ${index + 1}: ${classGroup.label}`}
          >
            <div className={styles.catalogNumber} aria-hidden="true">
              {index + 1}
            </div>
            <div className={styles.catalogFields}>
              <label className={styles.field}>
                <span>Nome da turma</span>
                <input
                  className={controlStyles.control}
                  value={classGroup.label}
                  maxLength={80}
                  onChange={(event) => {
                    const label = event.currentTarget.value;
                    changeDraft((current) => ({
                      ...current,
                      classGroups: updateAt(current.classGroups, index, {
                        ...current.classGroups[index]!,
                        label,
                      }),
                    }));
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>Etapa</span>
                <select
                  className={controlStyles.control}
                  value={classGroup.gradeId}
                  onChange={(event) => {
                    const gradeId = event.currentTarget.value as GradeId;
                    changeDraft((current) => ({
                      ...current,
                      classGroups: updateAt(current.classGroups, index, {
                        ...current.classGroups[index]!,
                        gradeId,
                      }),
                    }));
                  }}
                >
                  {GRADE_OPTIONS.map((option) => (
                    <option value={option.id} key={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Estudantes</span>
                <input
                  className={controlStyles.control}
                  type="number"
                  min={0}
                  max={200}
                  value={classGroup.studentCount}
                  onChange={(event) => {
                    const studentCount = Number(event.currentTarget.value);
                    changeDraft((current) => ({
                      ...current,
                      classGroups: updateAt(current.classGroups, index, {
                        ...current.classGroups[index]!,
                        studentCount,
                      }),
                    }));
                  }}
                />
              </label>
            </div>
            <div className={styles.catalogActions}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={classGroup.active}
                  onChange={(event) => {
                    const active = event.currentTarget.checked;
                    changeDraft((current) => ({
                      ...current,
                      classGroups: updateAt(current.classGroups, index, {
                        ...current.classGroups[index]!,
                        active,
                      }),
                    }));
                  }}
                />
                Disponível
              </label>
              <Button
                className={styles.removeCatalogButton}
                variant="ghost"
                size="small"
                disabled={draft.classGroups.length <= 1}
                title={
                  draft.classGroups.length <= 1
                    ? 'Mantenha pelo menos uma turma cadastrada.'
                    : `Excluir ${classGroup.label}`
                }
                aria-label={`Excluir turma ${classGroup.label}`}
                onClick={() => removeClassGroup(index)}
              >
                <Trash2 size={16} aria-hidden="true" />
                Excluir
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SubjectsSection({ draft, changeDraft }: ConfigurationSectionProps) {
  function addSubject() {
    changeDraft((current) => ({
      ...current,
      subjects: [
        ...current.subjects,
        {
          id: createGeneratedId('SUBJECT'),
          label: `Nova disciplina ${current.subjects.length + 1}`,
          order: current.subjects.length + 1,
          active: true,
        },
      ],
    }));
  }

  return (
    <section>
      <SectionHeading
        title="Disciplinas"
        description="Defina as disciplinas exibidas no formulário de agendamento."
        action={
          <Button variant="secondary" size="small" onClick={addSubject}>
            <Plus size={17} aria-hidden="true" />
            Adicionar disciplina
          </Button>
        }
      />

      <p className={styles.sectionNote}>
        Disciplinas novas usarão inicialmente a opção “Outro” em objetos do conhecimento.
      </p>

      <div className={styles.catalogList}>
        {draft.subjects.map((subject, index) => (
          <article className={styles.subjectItem} key={subject.id}>
            <div className={styles.catalogNumber} aria-hidden="true">
              {index + 1}
            </div>
            <label className={styles.field}>
              <span>Nome da disciplina</span>
              <input
                className={controlStyles.control}
                value={subject.label}
                maxLength={100}
                onChange={(event) => {
                  const label = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    subjects: updateAt(current.subjects, index, {
                      ...current.subjects[index]!,
                      label,
                    }),
                  }));
                }}
              />
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={subject.active}
                onChange={(event) => {
                  const active = event.currentTarget.checked;
                  changeDraft((current) => ({
                    ...current,
                    subjects: updateAt(current.subjects, index, {
                      ...current.subjects[index]!,
                      active,
                    }),
                  }));
                }}
              />
              Disponível
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

function BookingFormSection({ draft, changeDraft }: ConfigurationSectionProps) {
  function addResource() {
    changeDraft((current) => ({
      ...current,
      resources: [
        ...current.resources,
        {
          id: createGeneratedId('RESOURCE'),
          label: `Novo recurso ${current.resources.length + 1}`,
          order: current.resources.length + 1,
          active: true,
        },
      ],
    }));
  }

  return (
    <section>
      <SectionHeading
        title="Formulário"
        description="Defina os itens disponíveis e os campos opcionais do agendamento."
      />

      <div className={styles.card}>
        <h3>Campos opcionais</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={draft.bookingForm.showObservations}
            onChange={(event) => {
              const showObservations = event.currentTarget.checked;
              changeDraft((current) => ({
                ...current,
                bookingForm: {
                  ...current.bookingForm,
                  showObservations,
                },
              }));
            }}
          />
          Exibir campo de observações
        </label>
      </div>

      <details className={`${styles.shiftCard} ${styles.integrationCard}`}>
        <summary>
          <span>
            <strong>Integração com a SED-SC</strong>
            <small>Dados fixos usados para preparar o link pré-preenchido</small>
          </span>
          <span className={draft.sedSc.enabled ? styles.activeBadge : styles.inactiveBadge}>
            {draft.sedSc.enabled ? 'Ativa' : 'Inativa'}
          </span>
        </summary>
        <div className={styles.shiftBody}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={draft.sedSc.enabled}
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                changeDraft((current) => ({
                  ...current,
                  sedSc: {
                    ...current.sedSc,
                    enabled,
                    officialSchoolName:
                      enabled && !current.sedSc.officialSchoolName.trim()
                        ? current.school.name
                        : current.sedSc.officialSchoolName,
                  },
                }));
              }}
            />
            Preparar integração com o formulário da SED-SC
          </label>

          <p className={styles.sectionNote}>
            O mapeamento técnico do formulário será versionado no backend. Aqui ficam apenas os
            dados que mudam entre escolas.
          </p>

          <div className={styles.fieldGrid}>
            <label className={`${styles.field} ${styles.wideField}`}>
              <span>URL do formulário da SED-SC</span>
              <input
                className={controlStyles.control}
                type="url"
                disabled={!draft.sedSc.enabled}
                value={draft.sedSc.formUrl}
                placeholder="https://docs.google.com/forms/…"
                onChange={(event) => {
                  const formUrl = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    sedSc: { ...current.sedSc, formUrl },
                  }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Regional</span>
              <input
                className={controlStyles.control}
                disabled={!draft.sedSc.enabled}
                value={draft.sedSc.regionalName}
                maxLength={120}
                onChange={(event) => {
                  const regionalName = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    sedSc: { ...current.sedSc, regionalName },
                  }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Município</span>
              <input
                className={controlStyles.control}
                disabled={!draft.sedSc.enabled}
                value={draft.sedSc.municipalityName}
                maxLength={120}
                onChange={(event) => {
                  const municipalityName = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    sedSc: { ...current.sedSc, municipalityName },
                  }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Nome oficial da escola na SED-SC</span>
              <input
                className={controlStyles.control}
                disabled={!draft.sedSc.enabled}
                value={draft.sedSc.officialSchoolName}
                maxLength={160}
                onChange={(event) => {
                  const officialSchoolName = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    sedSc: { ...current.sedSc, officialSchoolName },
                  }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Área padrão</span>
              <input
                className={controlStyles.control}
                disabled={!draft.sedSc.enabled}
                value={draft.sedSc.defaultArea}
                maxLength={120}
                placeholder="Valor fixo usado pela SED-SC"
                onChange={(event) => {
                  const defaultArea = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    sedSc: { ...current.sedSc, defaultArea },
                  }));
                }}
              />
            </label>
            <label className={styles.field}>
              <span>Tipo de atividade padrão</span>
              <input
                className={controlStyles.control}
                disabled={!draft.sedSc.enabled}
                value={draft.sedSc.defaultActivityType}
                maxLength={120}
                placeholder="Ex.: aula no laboratório"
                onChange={(event) => {
                  const defaultActivityType = event.currentTarget.value;
                  changeDraft((current) => ({
                    ...current,
                    sedSc: { ...current.sedSc, defaultActivityType },
                  }));
                }}
              />
            </label>
          </div>
        </div>
      </details>

      <div className={styles.card}>
        <div className={styles.cardHeading}>
          <div>
            <h3>Itens que serão utilizados</h3>
            <p>Estes recursos serão exibidos para o professor no formulário de agendamento.</p>
          </div>
          <Button variant="secondary" size="small" onClick={addResource}>
            <Plus size={17} aria-hidden="true" />
            Adicionar recurso
          </Button>
        </div>

        <div className={styles.catalogList}>
          {draft.resources.map((resource, index) => (
            <article className={styles.subjectItem} key={resource.id}>
              <div className={styles.catalogNumber} aria-hidden="true">
                {index + 1}
              </div>
              <label className={styles.field}>
                <span>Nome do recurso</span>
                <input
                  className={controlStyles.control}
                  value={resource.label}
                  maxLength={100}
                  onChange={(event) => {
                    const label = event.currentTarget.value;
                    changeDraft((current) => ({
                      ...current,
                      resources: updateAt(current.resources, index, {
                        ...current.resources[index]!,
                        label,
                      }),
                    }));
                  }}
                />
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={resource.active}
                  onChange={(event) => {
                    const active = event.currentTarget.checked;
                    changeDraft((current) => ({
                      ...current,
                      resources: updateAt(current.resources, index, {
                        ...current.resources[index]!,
                        active,
                      }),
                    }));
                  }}
                />
                Disponível no formulário
              </label>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
