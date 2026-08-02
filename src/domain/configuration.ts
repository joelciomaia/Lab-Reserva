import type {
  AdminConfigurationDraft,
  BookingFormConfiguration,
  ClassPeriod,
  ConfiguredClassGroup,
  ConfiguredResource,
  ConfiguredSubject,
  IsoWeekday,
  LaboratoryAdminConfiguration,
  SedScConfiguration,
  ShiftConfiguration,
} from '../types';

export interface ConfigurationValidationIssue {
  path: string;
  message: string;
}

const DEFERRED_SETUP_VALIDATION_ISSUES = [
  { path: 'shifts', message: 'Mantenha pelo menos um turno ativo.' },
  { path: 'classGroups', message: 'Cadastre pelo menos uma turma.' },
  {
    path: 'resources',
    message: 'Mantenha pelo menos um recurso disponível no formulário.',
  },
] as const satisfies readonly ConfigurationValidationIssue[];

export function isDeferredSetupValidationIssue(issue: ConfigurationValidationIssue): boolean {
  return DEFERRED_SETUP_VALIDATION_ISSUES.some(
    (deferredIssue) => deferredIssue.path === issue.path && deferredIssue.message === issue.message,
  );
}

export const DEFAULT_SHIFTS: readonly ShiftConfiguration[] = [
  {
    id: 'MORNING',
    name: 'Manhã',
    order: 1,
    startTime: '07:30',
    classDurationMinutes: 45,
    classCount: 5,
    breakAfterClass: 3,
    breakDurationMinutes: 15,
    activeWeekdays: [1, 2, 3, 4, 5],
    active: true,
  },
  {
    id: 'AFTERNOON',
    name: 'Tarde',
    order: 2,
    startTime: '13:15',
    classDurationMinutes: 45,
    classCount: 5,
    breakAfterClass: 3,
    breakDurationMinutes: 15,
    activeWeekdays: [1, 2, 3, 4, 5],
    active: true,
  },
  {
    id: 'NIGHT',
    name: 'Noite',
    order: 3,
    startTime: '19:30',
    classDurationMinutes: 45,
    classCount: 5,
    breakAfterClass: 3,
    breakDurationMinutes: 15,
    activeWeekdays: [1, 2, 3, 4, 5],
    active: true,
  },
];

export const DEFAULT_SUBJECTS: readonly ConfiguredSubject[] = [
  { id: 'subject-portuguese', label: 'Língua Portuguesa', order: 1, active: true },
  { id: 'subject-mathematics', label: 'Matemática', order: 2, active: true },
  { id: 'subject-biology', label: 'Biologia', order: 3, active: true },
  { id: 'subject-physics', label: 'Física', order: 4, active: true },
  { id: 'subject-chemistry', label: 'Química', order: 5, active: true },
  { id: 'subject-history', label: 'História', order: 6, active: true },
  { id: 'subject-geography', label: 'Geografia', order: 7, active: true },
  { id: 'subject-physical-education', label: 'Educação Física', order: 8, active: true },
  { id: 'subject-art', label: 'Arte', order: 9, active: true },
  { id: 'subject-english', label: 'Língua Inglesa', order: 10, active: true },
  { id: 'subject-technology', label: 'Tecnologia e Inovação', order: 11, active: true },
  { id: 'subject-life-project', label: 'Projeto de Vida', order: 12, active: true },
];

export const DEFAULT_RESOURCES: readonly ConfiguredResource[] = [
  { id: 'technology-digital-whiteboard', label: 'Lousa digital', order: 1, active: true },
  {
    id: 'technology-computers-research',
    label: 'Computadores (pesquisa)',
    order: 2,
    active: true,
  },
  {
    id: 'technology-computers-software',
    label: 'Computadores (software ou programa)',
    order: 3,
    active: true,
  },
  {
    id: 'technology-computers-media-editing',
    label: 'Computadores (edição de imagens ou vídeos)',
    order: 4,
    active: true,
  },
  {
    id: 'technology-computers-educational-sites',
    label: 'Computadores (sites educacionais)',
    order: 5,
    active: true,
  },
  { id: 'technology-mobile-phones', label: 'Celulares', order: 6, active: true },
  { id: 'technology-tablets', label: 'Tablets', order: 7, active: true },
  { id: 'technology-notebooks', label: 'Notebooks', order: 8, active: true },
  { id: 'technology-projector', label: 'Projetor multimídia', order: 9, active: true },
  { id: 'technology-headphones', label: 'Fones de ouvido', order: 10, active: true },
  { id: 'technology-robotics-kits', label: 'Kits de robótica', order: 11, active: true },
  {
    id: 'technology-none',
    label: 'Nenhum recurso tecnológico',
    order: 12,
    active: true,
  },
  { id: 'technology-other', label: 'Outro', order: 13, active: true },
];

export const DEFAULT_BOOKING_FORM_CONFIGURATION: Readonly<BookingFormConfiguration> = {
  showObservations: false,
};

export const DEFAULT_SED_SC_CONFIGURATION: Readonly<SedScConfiguration> = {
  enabled: false,
  formUrl: '',
  regionalName: '',
  municipalityName: '',
  officialSchoolName: '',
  defaultArea: '',
  defaultActivityType: '',
};

export function createDefaultLaboratoryAdminConfiguration(
  laboratoryId: string,
): LaboratoryAdminConfiguration {
  return {
    laboratoryId,
    responsibleName: '',
    responsibleEmail: '',
    maxConcurrentClasses: 1,
    maxStudentCapacity: null,
    minimumLeadTimeValue: 0,
    minimumLeadTimeUnit: 'MINUTES',
    allowPastBookings: false,
    pastBookingLimitDays: 30,
    retroactiveConflictPolicy: 'WARN',
    notifyOnNewBooking: true,
    sedIntegrationEnabled: false,
    sedLinkLeadMinutes: 10,
    googleChatEnabled: false,
    googleChatSpaceName: '',
    sendSedLinkToChat: true,
  };
}

export const DEFAULT_CLASS_GROUPS: readonly ConfiguredClassGroup[] = [
  {
    id: 'class-grade-1-a',
    label: '1ª série A',
    gradeId: 'high-school-1',
    studentCount: 30,
    order: 1,
    active: true,
  },
];

export function parseClockTime(value: string): number | null {
  const match = /^(?<hours>[01]\d|2[0-3]):(?<minutes>[0-5]\d)$/.exec(value);
  if (!match?.groups) {
    return null;
  }

  return Number(match.groups.hours) * 60 + Number(match.groups.minutes);
}

export function formatClockTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getShiftEndTime(shift: ShiftConfiguration): string | null {
  const start = parseClockTime(shift.startTime);
  if (start === null) {
    return null;
  }

  const hasUsefulBreak =
    shift.breakAfterClass !== null &&
    shift.breakAfterClass > 0 &&
    shift.breakAfterClass < shift.classCount;
  const end =
    start +
    shift.classDurationMinutes * shift.classCount +
    (hasUsefulBreak ? shift.breakDurationMinutes : 0);

  return end <= 24 * 60 - 1 ? formatClockTime(end) : null;
}

function buildGeneratedPeriodId(shiftId: string, classNumber: number): string {
  const normalizedShiftId = shiftId.replaceAll(/[^a-zA-Z0-9_-]/g, '-');
  return `${normalizedShiftId}-CLASS-${classNumber}`;
}

export function createClassPeriods(
  shifts: readonly ShiftConfiguration[],
  existingPeriods: readonly ClassPeriod[] = [],
): ClassPeriod[] {
  const existingIds = new Map(
    existingPeriods.map((period) => [`${period.shiftId}:${period.classNumber}`, period.id]),
  );

  return shifts
    .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .flatMap((shift) => {
      const start = parseClockTime(shift.startTime);
      if (
        start === null ||
        !Number.isInteger(shift.classCount) ||
        shift.classCount < 1 ||
        shift.classCount > 100 ||
        shift.classDurationMinutes < 1
      ) {
        return [];
      }

      let cursor = start;

      return Array.from({ length: shift.classCount }, (_, index): ClassPeriod => {
        const classNumber = index + 1;
        const periodStart = cursor;
        const periodEnd = periodStart + shift.classDurationMinutes;
        cursor = periodEnd;

        if (shift.breakAfterClass === classNumber && classNumber < shift.classCount) {
          cursor += shift.breakDurationMinutes;
        }

        return {
          id:
            existingIds.get(`${shift.id}:${classNumber}`) ??
            buildGeneratedPeriodId(shift.id, classNumber),
          shiftId: shift.id,
          shiftName: shift.name.trim(),
          shiftOrder: shift.order,
          classNumber,
          name: `${classNumber}ª aula`,
          startTime: formatClockTime(periodStart),
          endTime: formatClockTime(periodEnd),
          order: classNumber,
          active: shift.active,
          activeWeekdays: [...shift.activeWeekdays],
        };
      });
    });
}

export function deriveShiftConfigurations(periods: readonly ClassPeriod[]): ShiftConfiguration[] {
  const groups = new Map<string, ClassPeriod[]>();
  periods.forEach((period) => {
    const group = groups.get(period.shiftId) ?? [];
    group.push(period);
    groups.set(period.shiftId, group);
  });

  return [...groups.values()]
    .map((group): ShiftConfiguration => {
      const sortedPeriods = group.toSorted(
        (left, right) =>
          left.classNumber - right.classNumber ||
          left.startTime.localeCompare(right.startTime) ||
          left.id.localeCompare(right.id),
      );
      const firstPeriod = sortedPeriods[0]!;
      const firstStart = parseClockTime(firstPeriod.startTime) ?? 0;
      const firstEnd = parseClockTime(firstPeriod.endTime) ?? firstStart + 45;
      let breakAfterClass: number | null = null;
      let breakDurationMinutes = 15;

      for (let index = 0; index < sortedPeriods.length - 1; index += 1) {
        const currentEnd = parseClockTime(sortedPeriods[index]!.endTime);
        const nextStart = parseClockTime(sortedPeriods[index + 1]!.startTime);
        if (currentEnd !== null && nextStart !== null && nextStart > currentEnd) {
          breakAfterClass = sortedPeriods[index]!.classNumber;
          breakDurationMinutes = nextStart - currentEnd;
          break;
        }
      }

      const activeWeekdays: IsoWeekday[] = [
        ...new Set(
          sortedPeriods.flatMap(
            (period): readonly IsoWeekday[] =>
              period.activeWeekdays ?? ([1, 2, 3, 4, 5, 6, 7] as const),
          ),
        ),
      ].toSorted((left, right) => left - right);

      return {
        id: firstPeriod.shiftId,
        name: firstPeriod.shiftName,
        order: firstPeriod.shiftOrder,
        startTime: firstPeriod.startTime,
        classDurationMinutes: Math.max(1, firstEnd - firstStart),
        classCount: sortedPeriods.length,
        breakAfterClass,
        breakDurationMinutes,
        activeWeekdays,
        active: sortedPeriods.some((period) => period.active),
      };
    })
    .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function normalizedLabel(value: string): string {
  return value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function addUniqueIdIssues(
  issues: ConfigurationValidationIssue[],
  collection: readonly { id: string }[],
  path: string,
): void {
  const seenIds = new Set<string>();
  collection.forEach((item, index) => {
    if (!item.id.trim()) {
      issues.push({ path: `${path}.${index}.id`, message: 'O item precisa ter um identificador.' });
      return;
    }

    if (seenIds.has(item.id)) {
      issues.push({
        path: `${path}.${index}.id`,
        message: `Há identificadores repetidos em ${path}.`,
      });
    }
    seenIds.add(item.id);
  });
}

function addUniqueLabelIssues(
  issues: ConfigurationValidationIssue[],
  collection: readonly { label?: string; name?: string }[],
  path: string,
  itemName: string,
): void {
  const seenLabels = new Set<string>();
  collection.forEach((item, index) => {
    const rawLabel = item.label ?? item.name ?? '';
    const label = normalizedLabel(rawLabel);
    if (!label) {
      issues.push({
        path: `${path}.${index}`,
        message: `Informe o nome ${itemName}.`,
      });
      return;
    }

    if (seenLabels.has(label)) {
      issues.push({
        path: `${path}.${index}`,
        message: `Não é possível repetir ${itemName}.`,
      });
    }
    seenLabels.add(label);
  });
}

function hasCommonWeekday(left: readonly IsoWeekday[], right: readonly IsoWeekday[]): boolean {
  return left.some((weekday) => right.includes(weekday));
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateAdminConfiguration(
  configuration: AdminConfigurationDraft,
): ConfigurationValidationIssue[] {
  const issues: ConfigurationValidationIssue[] = [];

  if (!configuration.school.name.trim()) {
    issues.push({ path: 'school.name', message: 'Informe o nome da escola.' });
  }

  addUniqueIdIssues(issues, configuration.laboratories, 'laboratories');
  addUniqueLabelIssues(
    issues,
    configuration.laboratories.map((laboratory) => ({ label: laboratory.name })),
    'laboratories',
    'do laboratório',
  );
  if (!configuration.laboratories.some((laboratory) => laboratory.active)) {
    issues.push({
      path: 'laboratories',
      message: 'Mantenha pelo menos um laboratório disponível para agendamento.',
    });
  }

  addUniqueIdIssues(
    issues,
    configuration.laboratorySettings.map((settings) => ({ id: settings.laboratoryId })),
    'laboratorySettings',
  );
  const laboratoryIds = new Set(configuration.laboratories.map((laboratory) => laboratory.id));
  configuration.laboratories.forEach((laboratory) => {
    if (
      !configuration.laboratorySettings.some((settings) => settings.laboratoryId === laboratory.id)
    ) {
      issues.push({
        path: 'laboratorySettings',
        message: `As regras de ${laboratory.name} não foram configuradas.`,
      });
    }
  });

  configuration.laboratorySettings.forEach((settings, index) => {
    const path = `laboratorySettings.${index}`;
    const laboratory =
      configuration.laboratories.find(({ id }) => id === settings.laboratoryId) ?? null;
    const laboratoryName = laboratory?.name ?? `laboratório ${index + 1}`;

    if (!laboratoryIds.has(settings.laboratoryId)) {
      issues.push({
        path: `${path}.laboratoryId`,
        message: `Há regras vinculadas a um laboratório que não existe mais (${settings.laboratoryId}).`,
      });
    }
    if (settings.responsibleEmail.trim() && !isValidEmail(settings.responsibleEmail.trim())) {
      issues.push({
        path: `${path}.responsibleEmail`,
        message: `Informe um e-mail válido para o responsável por ${laboratoryName}.`,
      });
    }
    if (
      settings.maxConcurrentClasses !== null &&
      (!Number.isInteger(settings.maxConcurrentClasses) ||
        settings.maxConcurrentClasses < 1 ||
        settings.maxConcurrentClasses > 50)
    ) {
      issues.push({
        path: `${path}.maxConcurrentClasses`,
        message: `O limite simultâneo de ${laboratoryName} deve ficar entre 1 e 50 turmas.`,
      });
    }
    if (
      settings.maxStudentCapacity !== null &&
      (!Number.isInteger(settings.maxStudentCapacity) ||
        settings.maxStudentCapacity < 1 ||
        settings.maxStudentCapacity > 2000)
    ) {
      issues.push({
        path: `${path}.maxStudentCapacity`,
        message: `A capacidade de ${laboratoryName} deve ficar entre 1 e 2.000 estudantes.`,
      });
    }
    if (
      !Number.isInteger(settings.minimumLeadTimeValue) ||
      settings.minimumLeadTimeValue < 0 ||
      settings.minimumLeadTimeValue > 10080
    ) {
      issues.push({
        path: `${path}.minimumLeadTimeValue`,
        message: `A antecedência mínima de ${laboratoryName} deve ficar entre 0 e 10.080.`,
      });
    }
    if (!['MINUTES', 'HOURS', 'DAYS'].includes(settings.minimumLeadTimeUnit)) {
      issues.push({
        path: `${path}.minimumLeadTimeUnit`,
        message: `Escolha uma unidade válida para a antecedência de ${laboratoryName}.`,
      });
    }
    if (
      settings.pastBookingLimitDays !== null &&
      (!Number.isInteger(settings.pastBookingLimitDays) ||
        settings.pastBookingLimitDays < 1 ||
        settings.pastBookingLimitDays > 3650)
    ) {
      issues.push({
        path: `${path}.pastBookingLimitDays`,
        message: `O limite retroativo de ${laboratoryName} deve ficar entre 1 e 3.650 dias.`,
      });
    }
    if (!['WARN', 'BLOCK'].includes(settings.retroactiveConflictPolicy)) {
      issues.push({
        path: `${path}.retroactiveConflictPolicy`,
        message: `Escolha como tratar conflitos retroativos em ${laboratoryName}.`,
      });
    }
    if (
      !Number.isInteger(settings.sedLinkLeadMinutes) ||
      settings.sedLinkLeadMinutes < 0 ||
      settings.sedLinkLeadMinutes > 1440
    ) {
      issues.push({
        path: `${path}.sedLinkLeadMinutes`,
        message: `O aviso da SED de ${laboratoryName} deve ficar entre 0 e 1.440 minutos.`,
      });
    }
    if (settings.sedIntegrationEnabled && !configuration.sedSc.enabled) {
      issues.push({
        path: `${path}.sedIntegrationEnabled`,
        message: `Ative e configure o formulário da SED-SC antes de usá-lo em ${laboratoryName}.`,
      });
    }
    if (
      (settings.sedIntegrationEnabled || settings.googleChatEnabled) &&
      !settings.responsibleName.trim()
    ) {
      issues.push({
        path: `${path}.responsibleName`,
        message: `Informe o laboratorista responsável por ${laboratoryName}.`,
      });
    }
    if (
      (settings.sedIntegrationEnabled || settings.googleChatEnabled) &&
      !isValidEmail(settings.responsibleEmail.trim())
    ) {
      issues.push({
        path: `${path}.responsibleEmail`,
        message: `Informe o e-mail do responsável por ${laboratoryName}.`,
      });
    }
    if (settings.googleChatEnabled && !settings.googleChatSpaceName.trim()) {
      issues.push({
        path: `${path}.googleChatSpaceName`,
        message: `Informe o espaço do Google Chat usado por ${laboratoryName}.`,
      });
    }
  });

  addUniqueIdIssues(issues, configuration.shifts, 'shifts');
  addUniqueLabelIssues(issues, configuration.shifts, 'shifts', 'do turno');
  if (!configuration.shifts.some((shift) => shift.active)) {
    issues.push(DEFERRED_SETUP_VALIDATION_ISSUES[0]);
  }

  configuration.shifts.forEach((shift, index) => {
    const path = `shifts.${index}`;
    if (parseClockTime(shift.startTime) === null) {
      issues.push({
        path: `${path}.startTime`,
        message: `Informe um início válido para ${shift.name}.`,
      });
    }
    if (
      !Number.isInteger(shift.classDurationMinutes) ||
      shift.classDurationMinutes < 20 ||
      shift.classDurationMinutes > 180
    ) {
      issues.push({
        path: `${path}.classDurationMinutes`,
        message: `A duração das aulas de ${shift.name} deve ficar entre 20 e 180 minutos.`,
      });
    }
    if (!Number.isInteger(shift.classCount) || shift.classCount < 1 || shift.classCount > 12) {
      issues.push({
        path: `${path}.classCount`,
        message: `${shift.name} deve ter entre 1 e 12 aulas.`,
      });
    }
    if (shift.active && shift.activeWeekdays.length === 0) {
      issues.push({
        path: `${path}.activeWeekdays`,
        message: `Escolha pelo menos um dia para ${shift.name}.`,
      });
    }
    if (
      new Set(shift.activeWeekdays).size !== shift.activeWeekdays.length ||
      shift.activeWeekdays.some((weekday) => weekday < 1 || weekday > 7)
    ) {
      issues.push({
        path: `${path}.activeWeekdays`,
        message: `Os dias configurados para ${shift.name} são inválidos.`,
      });
    }
    if (
      shift.breakAfterClass !== null &&
      (!Number.isInteger(shift.breakAfterClass) ||
        shift.breakAfterClass < 1 ||
        shift.breakAfterClass >= shift.classCount)
    ) {
      issues.push({
        path: `${path}.breakAfterClass`,
        message: `Escolha uma aula válida antes do intervalo de ${shift.name}.`,
      });
    }
    if (
      shift.breakAfterClass !== null &&
      (!Number.isInteger(shift.breakDurationMinutes) ||
        shift.breakDurationMinutes < 5 ||
        shift.breakDurationMinutes > 90)
    ) {
      issues.push({
        path: `${path}.breakDurationMinutes`,
        message: `O intervalo de ${shift.name} deve ficar entre 5 e 90 minutos.`,
      });
    }
    if (getShiftEndTime(shift) === null) {
      issues.push({
        path: `${path}.startTime`,
        message: `${shift.name} ultrapassa o fim do dia. Ajuste o início ou a quantidade de aulas.`,
      });
    }
  });

  const activeShifts = configuration.shifts.filter((shift) => shift.active);
  const generatedPeriods = createClassPeriods(activeShifts);
  for (let leftIndex = 0; leftIndex < activeShifts.length; leftIndex += 1) {
    const leftShift = activeShifts[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < activeShifts.length; rightIndex += 1) {
      const rightShift = activeShifts[rightIndex]!;
      if (!hasCommonWeekday(leftShift.activeWeekdays, rightShift.activeWeekdays)) {
        continue;
      }

      const leftPeriods = generatedPeriods.filter((period) => period.shiftId === leftShift.id);
      const rightPeriods = generatedPeriods.filter((period) => period.shiftId === rightShift.id);
      const overlaps = leftPeriods.some((leftPeriod) =>
        rightPeriods.some(
          (rightPeriod) =>
            leftPeriod.startTime < rightPeriod.endTime &&
            rightPeriod.startTime < leftPeriod.endTime,
        ),
      );

      if (overlaps) {
        issues.push({
          path: `shifts.${rightIndex}`,
          message: `${leftShift.name} e ${rightShift.name} possuem aulas sobrepostas nos mesmos dias.`,
        });
      }
    }
  }

  if (configuration.classGroups.length === 0) {
    issues.push(DEFERRED_SETUP_VALIDATION_ISSUES[1]);
  }
  addUniqueIdIssues(issues, configuration.classGroups, 'classGroups');
  addUniqueLabelIssues(issues, configuration.classGroups, 'classGroups', 'da turma');
  configuration.classGroups.forEach((classGroup, index) => {
    if (
      !Number.isInteger(classGroup.studentCount) ||
      classGroup.studentCount < 0 ||
      classGroup.studentCount > 200
    ) {
      issues.push({
        path: `classGroups.${index}.studentCount`,
        message: `A quantidade de estudantes de ${classGroup.label} deve ficar entre 0 e 200.`,
      });
    }
  });

  addUniqueIdIssues(issues, configuration.subjects, 'subjects');
  addUniqueLabelIssues(issues, configuration.subjects, 'subjects', 'da disciplina');

  addUniqueIdIssues(issues, configuration.resources, 'resources');
  addUniqueLabelIssues(issues, configuration.resources, 'resources', 'do recurso');
  if (!configuration.resources.some((resource) => resource.active)) {
    issues.push(DEFERRED_SETUP_VALIDATION_ISSUES[2]);
  }

  if (typeof configuration.bookingForm.showObservations !== 'boolean') {
    issues.push({
      path: 'bookingForm.showObservations',
      message: 'Defina se o campo de observações será exibido.',
    });
  }

  if (configuration.sedSc.enabled) {
    if (!isValidHttpUrl(configuration.sedSc.formUrl.trim())) {
      issues.push({
        path: 'sedSc.formUrl',
        message: 'Informe uma URL válida para o formulário da SED-SC.',
      });
    }
    if (!configuration.sedSc.regionalName.trim()) {
      issues.push({ path: 'sedSc.regionalName', message: 'Informe a regional da SED-SC.' });
    }
    if (!configuration.sedSc.municipalityName.trim()) {
      issues.push({ path: 'sedSc.municipalityName', message: 'Informe o município na SED-SC.' });
    }
    if (!configuration.sedSc.officialSchoolName.trim()) {
      issues.push({
        path: 'sedSc.officialSchoolName',
        message: 'Informe o nome oficial da escola na SED-SC.',
      });
    }
  }

  return issues;
}
