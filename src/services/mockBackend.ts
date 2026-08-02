import type {
  AdminConfiguration,
  AdminConfigurationClient,
  AdminConfigurationDraft,
  AvailabilityRequest,
  AvailabilityResponse,
  BackendClient,
  BookingFormConfiguration,
  BootstrapData,
  BootstrapParams,
  ClassPeriod,
  CreateReservationRequest,
  ConfiguredClassGroup,
  ConfiguredResource,
  ConfiguredSubject,
  Laboratory,
  LaboratoryAdminConfiguration,
  Reservation,
  SaveAdminConfigurationRequest,
  SedScConfiguration,
  School,
  ShiftConfiguration,
} from '../types';
import { BackendError } from '../types';
import {
  createClassPeriods,
  createDefaultLaboratoryAdminConfiguration,
  DEFAULT_BOOKING_FORM_CONFIGURATION,
  DEFAULT_CLASS_GROUPS,
  DEFAULT_RESOURCES,
  DEFAULT_SED_SC_CONFIGURATION,
  DEFAULT_SHIFTS,
  DEFAULT_SUBJECTS,
  deriveShiftConfigurations,
  validateAdminConfiguration,
} from '../domain/configuration';
import { getApplicableClassPeriods, sortClassPeriods } from '../domain/periods';
import { isValidIsoDate } from '../utils/dates';
import { getSchoolWeek } from '../utils/week';

const defaultSchool: School = {
  id: 'SCHOOL-DEMO',
  name: 'EEM Paulo Freire',
};

const defaultLaboratories: Laboratory[] = [
  {
    id: 'LAB01',
    name: 'Laboratório de Informática',
    active: true,
  },
  {
    id: 'LAB02',
    name: 'Sala Maker',
    active: true,
  },
  {
    id: 'LAB03',
    name: 'Laboratório de Ciências',
    active: true,
  },
];

const defaultPeriods: ClassPeriod[] = createClassPeriods(DEFAULT_SHIFTS).map((period, index) => ({
  ...period,
  id: `P${String(index + 1).padStart(2, '0')}`,
}));

function createInitialReservations(): Reservation[] {
  const week = getSchoolWeek(new Date());
  const createdAt = new Date().toISOString();

  return [
    {
      id: 'RES-2026-0001',
      date: week[0]!.isoDate,
      laboratoryId: 'LAB01',
      laboratoryName: 'Laboratório de Informática',
      teacherName: 'Ana Paula Ribeiro',
      classGroup: '6º A',
      subject: 'História',
      periodIds: ['P01'],
      periodLabels: ['1ª aula'],
      knowledgeObjects: 'Patrimônio cultural e memória',
      itemsUsed: 'Computadores',
      notes: '',
      createdAt,
    },
    {
      id: 'RES-2026-0002',
      date: week[1]!.isoDate,
      laboratoryId: 'LAB01',
      laboratoryName: 'Laboratório de Informática',
      teacherName: 'Carlos Eduardo Lima',
      classGroup: '7º B',
      subject: 'Tecnologia',
      periodIds: ['P01', 'P02'],
      periodLabels: ['1ª aula', '2ª aula'],
      knowledgeObjects: 'Cultura digital',
      itemsUsed: 'Computadores e projetor',
      notes: '',
      createdAt,
    },
    {
      id: 'RES-2026-0003',
      date: week[2]!.isoDate,
      laboratoryId: 'LAB01',
      laboratoryName: 'Laboratório de Informática',
      teacherName: 'Marina Lopes',
      classGroup: '9º A',
      subject: 'Matemática',
      periodIds: ['P01', 'P02', 'P03'],
      periodLabels: ['1ª aula', '2ª aula', '3ª aula'],
      knowledgeObjects: 'Geometria plana e representações digitais',
      itemsUsed: 'Computadores',
      notes: 'Atividade em duplas.',
      createdAt,
    },
    {
      id: 'RES-2026-0004',
      date: week[3]!.isoDate,
      laboratoryId: 'LAB01',
      laboratoryName: 'Laboratório de Informática',
      teacherName: 'Rafael Nascimento',
      classGroup: '8º B',
      subject: 'Ciências',
      periodIds: ['P06', 'P07'],
      periodLabels: ['1ª aula', '2ª aula'],
      knowledgeObjects: 'Sistema solar e modelos astronômicos',
      itemsUsed: 'Computadores e projetor',
      notes: '',
      createdAt,
    },
  ];
}

const clone = <T>(value: T): T => structuredClone(value);

export interface MockBackendOptions {
  latencyMs?: number;
  failBootstrap?: boolean;
  periods?: ClassPeriod[];
  initialReservations?: Reservation[];
  configuration?: AdminConfiguration;
  sourceSpreadsheetFingerprint?: string;
}

export class MockBackend implements BackendClient, AdminConfigurationClient {
  private readonly latencyMs: number;
  private readonly failBootstrap: boolean;
  private readonly sourceSpreadsheetFingerprint: string;
  private school: School;
  private laboratories: Laboratory[];
  private periods: ClassPeriod[];
  private shifts: ShiftConfiguration[];
  private classGroups: ConfiguredClassGroup[];
  private subjects: ConfiguredSubject[];
  private resources: ConfiguredResource[];
  private bookingForm: BookingFormConfiguration;
  private laboratorySettings: LaboratoryAdminConfiguration[];
  private sedSc: SedScConfiguration;
  private configurationRevision: string;
  private configurationRevisionNumber = 1;
  private readonly reservations: Reservation[];
  private reservationSequence = 5;

  constructor(options: MockBackendOptions = {}) {
    this.latencyMs = options.latencyMs ?? 180;
    this.failBootstrap = options.failBootstrap ?? false;
    this.sourceSpreadsheetFingerprint =
      options.sourceSpreadsheetFingerprint ??
      'sha256-v1:0000000000000000000000000000000000000000000000000000000000000000';
    const suppliedConfiguration = options.configuration;
    this.school = clone(suppliedConfiguration?.school ?? defaultSchool);
    this.laboratories = clone(suppliedConfiguration?.laboratories ?? defaultLaboratories);
    this.shifts = clone([
      ...(suppliedConfiguration?.shifts ??
        (options.periods ? deriveShiftConfigurations(options.periods) : DEFAULT_SHIFTS)),
    ]);
    this.classGroups = clone([...(suppliedConfiguration?.classGroups ?? DEFAULT_CLASS_GROUPS)]);
    this.subjects = clone([...(suppliedConfiguration?.subjects ?? DEFAULT_SUBJECTS)]);
    this.resources = clone([...(suppliedConfiguration?.resources ?? DEFAULT_RESOURCES)]);
    this.bookingForm = clone(
      suppliedConfiguration?.bookingForm ?? DEFAULT_BOOKING_FORM_CONFIGURATION,
    );
    this.laboratorySettings = this.laboratories.map((laboratory) =>
      clone(
        suppliedConfiguration?.laboratorySettings?.find(
          (settings) => settings.laboratoryId === laboratory.id,
        ) ?? createDefaultLaboratoryAdminConfiguration(laboratory.id),
      ),
    );
    this.sedSc = clone(suppliedConfiguration?.sedSc ?? DEFAULT_SED_SC_CONFIGURATION);
    this.configurationRevision = suppliedConfiguration?.revision ?? 'configuration-1';
    this.periods = clone(
      options.periods ??
        (suppliedConfiguration
          ? createClassPeriods(suppliedConfiguration.shifts, defaultPeriods)
          : defaultPeriods),
    );
    this.reservations = clone(
      options.initialReservations ??
        (options.periods || suppliedConfiguration ? [] : createInitialReservations()),
    );
  }

  private async wait(): Promise<void> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, this.latencyMs));
    }
  }

  async getBootstrapData(params: BootstrapParams = {}): Promise<BootstrapData> {
    await this.wait();
    if (this.failBootstrap) {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'Não foi possível carregar os dados da escola.',
      );
    }

    const requestedLaboratory = this.laboratories.some(
      (laboratory) => laboratory.id === params.preselectedLaboratoryId && laboratory.active,
    )
      ? params.preselectedLaboratoryId
      : undefined;

    const result: BootstrapData = {
      school: clone(this.school),
      laboratories: clone(this.laboratories.filter((laboratory) => laboratory.active)),
      periods: clone(sortClassPeriods(this.periods.filter((period) => period.active))),
      classGroups: clone(
        this.classGroups
          .filter((classGroup) => classGroup.active)
          .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      ),
      subjects: clone(
        this.subjects
          .filter((subject) => subject.active)
          .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      ),
      resources: clone(
        this.resources
          .filter((resource) => resource.active)
          .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id)),
      ),
      bookingForm: clone(this.bookingForm),
      configurationRevision: this.configurationRevision,
      sourceSpreadsheetFingerprint: this.sourceSpreadsheetFingerprint,
    };

    if (requestedLaboratory) {
      result.preselectedLaboratoryId = requestedLaboratory;
    }

    return result;
  }

  async getAvailability(request: AvailabilityRequest): Promise<AvailabilityResponse> {
    await this.wait();
    if (!isValidIsoDate(request.date)) {
      throw new BackendError('VALIDATION_ERROR', 'Informe uma data válida.');
    }

    const laboratory = this.laboratories.find(
      (candidate) => candidate.id === request.laboratoryId && candidate.active,
    );
    if (!laboratory) {
      throw new BackendError('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
    }

    const mappedPeriods = getApplicableClassPeriods(this.periods, request.date).map((period) => {
      const reservation = this.reservations.find(
        (candidate) =>
          candidate.laboratoryId === request.laboratoryId &&
          candidate.date === request.date &&
          candidate.periodIds.includes(period.id),
      );

      return {
        periodId: period.id,
        shiftId: period.shiftId,
        shiftName: period.shiftName,
        shiftOrder: period.shiftOrder,
        classNumber: period.classNumber,
        label: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        status: reservation ? ('UNAVAILABLE' as const) : ('AVAILABLE' as const),
        ...(reservation
          ? {
              reservation: {
                id: reservation.id,
              },
            }
          : {}),
      };
    });

    return { date: request.date, laboratoryId: request.laboratoryId, periods: mappedPeriods };
  }

  async createReservation(request: CreateReservationRequest): Promise<Reservation> {
    await this.wait();
    const laboratory = this.laboratories.find(
      (candidate) => candidate.id === request.laboratoryId && candidate.active,
    );
    if (!laboratory) {
      throw new BackendError('LABORATORY_NOT_FOUND', 'Laboratório não encontrado ou inativo.');
    }

    if (!isValidIsoDate(request.date)) {
      throw new BackendError('VALIDATION_ERROR', 'Informe uma data válida.');
    }

    const selectedPeriods = getApplicableClassPeriods(this.periods, request.date).filter((period) =>
      request.periodIds.includes(period.id),
    );
    if (selectedPeriods.length !== request.periodIds.length || selectedPeriods.length === 0) {
      throw new BackendError('VALIDATION_ERROR', 'Selecione pelo menos uma aula válida.');
    }

    const availability = await this.getAvailability({
      laboratoryId: request.laboratoryId,
      date: request.date,
    });
    const hasConflict = request.periodIds.some((periodId) =>
      availability.periods.some(
        (period) => period.periodId === periodId && period.status === 'UNAVAILABLE',
      ),
    );
    if (hasConflict) {
      throw new BackendError(
        'TIME_CONFLICT',
        'Um dos horários selecionados não está mais disponível.',
      );
    }

    const reservation: Reservation = {
      id: `RES-2026-${String(this.reservationSequence).padStart(4, '0')}`,
      date: request.date,
      laboratoryId: laboratory.id,
      laboratoryName: laboratory.name,
      teacherName: request.teacherName.trim(),
      subject: request.subject.trim(),
      classGroup: request.classGroup.trim(),
      periodIds: selectedPeriods.map((period) => period.id),
      periodLabels: selectedPeriods.map((period) => period.name),
      knowledgeObjects: request.knowledgeObjects.trim(),
      itemsUsed: request.itemsUsed.trim(),
      notes: request.notes.trim(),
      createdAt: new Date().toISOString(),
    };

    this.reservationSequence += 1;
    this.reservations.unshift(reservation);
    return clone(reservation);
  }

  async getAdminConfiguration(): Promise<AdminConfiguration> {
    await this.wait();
    if (this.failBootstrap) {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'Não foi possível carregar as configurações da escola.',
      );
    }

    return clone({
      revision: this.configurationRevision,
      school: this.school,
      laboratories: this.laboratories,
      shifts: this.shifts,
      classGroups: this.classGroups,
      subjects: this.subjects,
      resources: this.resources,
      bookingForm: this.bookingForm,
      laboratorySettings: this.laboratorySettings,
      sedSc: this.sedSc,
    });
  }

  async saveAdminConfiguration(
    request: SaveAdminConfigurationRequest,
  ): Promise<AdminConfiguration> {
    await this.wait();
    if (this.failBootstrap) {
      throw new BackendError(
        'BACKEND_UNAVAILABLE',
        'Não foi possível salvar as configurações da escola.',
      );
    }
    if (request.expectedRevision !== this.configurationRevision) {
      throw new BackendError(
        'CONFIGURATION_CONFLICT',
        'As configurações foram alteradas em outra tela. Recarregue antes de salvar novamente.',
      );
    }

    const normalized = normalizeConfiguration(request.configuration);
    const issues = validateAdminConfiguration(normalized);
    if (issues.length > 0) {
      throw new BackendError(
        'VALIDATION_ERROR',
        'Revise os campos indicados antes de salvar.',
        issues,
      );
    }

    const generatedPeriods = createClassPeriods(normalized.shifts, this.periods);
    this.school = clone(normalized.school);
    this.laboratories = clone(normalized.laboratories);
    this.shifts = clone(normalized.shifts);
    this.classGroups = clone(normalized.classGroups);
    this.subjects = clone(normalized.subjects);
    this.resources = clone(normalized.resources);
    this.bookingForm = clone(normalized.bookingForm);
    this.laboratorySettings = clone(normalized.laboratorySettings);
    this.sedSc = clone(normalized.sedSc);
    this.periods = clone(generatedPeriods);
    this.configurationRevisionNumber += 1;
    this.configurationRevision = `configuration-${this.configurationRevisionNumber}`;

    return clone({
      revision: this.configurationRevision,
      school: this.school,
      laboratories: this.laboratories,
      shifts: this.shifts,
      classGroups: this.classGroups,
      subjects: this.subjects,
      resources: this.resources,
      bookingForm: this.bookingForm,
      laboratorySettings: this.laboratorySettings,
      sedSc: this.sedSc,
    });
  }
}

function normalizeConfiguration(configuration: AdminConfigurationDraft): AdminConfigurationDraft {
  const byOrderAndId = <T extends { order: number; id: string }>(left: T, right: T) =>
    left.order - right.order || left.id.localeCompare(right.id);

  return {
    school: { ...configuration.school, name: configuration.school.name.trim() },
    laboratories: configuration.laboratories.map((laboratory) => ({
      ...laboratory,
      name: laboratory.name.trim(),
    })),
    shifts: configuration.shifts.toSorted(byOrderAndId).map((shift, index) => ({
      ...shift,
      name: shift.name.trim(),
      order: index + 1,
      activeWeekdays: [...shift.activeWeekdays].toSorted((left, right) => left - right),
    })),
    classGroups: configuration.classGroups.toSorted(byOrderAndId).map((classGroup, index) => ({
      ...classGroup,
      label: classGroup.label.trim(),
      order: index + 1,
    })),
    subjects: configuration.subjects.toSorted(byOrderAndId).map((subject, index) => ({
      ...subject,
      label: subject.label.trim(),
      order: index + 1,
    })),
    resources: configuration.resources.toSorted(byOrderAndId).map((resource, index) => ({
      ...resource,
      label: resource.label.trim(),
      order: index + 1,
    })),
    bookingForm: {
      showObservations: configuration.bookingForm.showObservations,
    },
    laboratorySettings: configuration.laboratories.map((laboratory) => {
      const settings =
        configuration.laboratorySettings.find(
          (candidate) => candidate.laboratoryId === laboratory.id,
        ) ?? createDefaultLaboratoryAdminConfiguration(laboratory.id);
      return {
        ...settings,
        laboratoryId: laboratory.id,
        responsibleName: settings.responsibleName.trim(),
        responsibleEmail: settings.responsibleEmail.trim(),
        googleChatSpaceName: settings.googleChatSpaceName.trim(),
      };
    }),
    sedSc: {
      enabled: configuration.sedSc.enabled,
      formUrl: configuration.sedSc.formUrl.trim(),
      regionalName: configuration.sedSc.regionalName.trim(),
      municipalityName: configuration.sedSc.municipalityName.trim(),
      officialSchoolName: configuration.sedSc.officialSchoolName.trim(),
      defaultArea: configuration.sedSc.defaultArea.trim(),
      defaultActivityType: configuration.sedSc.defaultActivityType.trim(),
    },
  };
}
