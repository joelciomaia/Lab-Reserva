import { describe, expect, it } from 'vitest';

import type { AdminConfigurationDraft, ShiftConfiguration } from '../types';
import {
  createClassPeriods,
  createDefaultLaboratoryAdminConfiguration,
  DEFAULT_SED_SC_CONFIGURATION,
  isDeferredSetupValidationIssue,
  validateAdminConfiguration,
} from './configuration';

function createShift(overrides: Partial<ShiftConfiguration> = {}): ShiftConfiguration {
  return {
    id: 'MORNING',
    name: 'Manhã',
    order: 1,
    startTime: '07:30',
    classDurationMinutes: 45,
    classCount: 3,
    breakAfterClass: null,
    breakDurationMinutes: 15,
    activeWeekdays: [1, 2, 3, 4, 5],
    active: true,
    ...overrides,
  };
}

function createConfiguration(
  shifts: ShiftConfiguration[] = [createShift()],
): AdminConfigurationDraft {
  return {
    school: {
      id: 'SCHOOL-TEST',
      name: 'Escola de Teste',
    },
    laboratories: [
      {
        id: 'LAB-TEST',
        name: 'Laboratório de Teste',
        active: true,
      },
    ],
    shifts,
    classGroups: [
      {
        id: 'CLASS-TEST',
        label: '1ª série A',
        gradeId: 'high-school-1',
        studentCount: 30,
        order: 1,
        active: true,
      },
    ],
    subjects: [
      {
        id: 'SUBJECT-TEST',
        label: 'Ciências',
        order: 1,
        active: true,
      },
    ],
    resources: [
      {
        id: 'RESOURCE-TEST',
        label: 'Computadores',
        order: 1,
        active: true,
      },
    ],
    bookingForm: {
      showObservations: false,
    },
    laboratorySettings: [createDefaultLaboratoryAdminConfiguration('LAB-TEST')],
    sedSc: {
      ...DEFAULT_SED_SC_CONFIGURATION,
    },
  };
}

describe('createClassPeriods', () => {
  it('creates the configured classes and propagates their specific weekdays', () => {
    const periods = createClassPeriods([
      createShift({
        id: 'WEDNESDAY-SHIFT',
        name: '  Reforço  ',
        order: 2,
        startTime: '08:00',
        classDurationMinutes: 50,
        classCount: 2,
        activeWeekdays: [3],
      }),
    ]);

    expect(periods).toEqual([
      {
        id: 'WEDNESDAY-SHIFT-CLASS-1',
        shiftId: 'WEDNESDAY-SHIFT',
        shiftName: 'Reforço',
        shiftOrder: 2,
        classNumber: 1,
        name: '1ª aula',
        startTime: '08:00',
        endTime: '08:50',
        order: 1,
        active: true,
        activeWeekdays: [3],
      },
      {
        id: 'WEDNESDAY-SHIFT-CLASS-2',
        shiftId: 'WEDNESDAY-SHIFT',
        shiftName: 'Reforço',
        shiftOrder: 2,
        classNumber: 2,
        name: '2ª aula',
        startTime: '08:50',
        endTime: '09:40',
        order: 2,
        active: true,
        activeWeekdays: [3],
      },
    ]);
  });

  it('inserts a configurable interval after the selected class', () => {
    const periods = createClassPeriods([
      createShift({
        classCount: 4,
        breakAfterClass: 2,
        breakDurationMinutes: 20,
      }),
    ]);

    expect(
      periods.map(({ classNumber, startTime, endTime }) => ({
        classNumber,
        startTime,
        endTime,
      })),
    ).toEqual([
      { classNumber: 1, startTime: '07:30', endTime: '08:15' },
      { classNumber: 2, startTime: '08:15', endTime: '09:00' },
      { classNumber: 3, startTime: '09:20', endTime: '10:05' },
      { classNumber: 4, startTime: '10:05', endTime: '10:50' },
    ]);
  });
});

describe('validateAdminConfiguration', () => {
  it('accepts equal schedules when the shifts run on different weekdays', () => {
    const configuration = createConfiguration([
      createShift({
        id: 'MONDAY',
        name: 'Segunda',
        activeWeekdays: [1],
      }),
      createShift({
        id: 'TUESDAY',
        name: 'Terça',
        order: 2,
        activeWeekdays: [2],
      }),
    ]);

    expect(validateAdminConfiguration(configuration)).toEqual([]);
  });

  it('reports overlapping classes when shifts share a weekday', () => {
    const configuration = createConfiguration([
      createShift({
        id: 'REGULAR',
        name: 'Regular',
        activeWeekdays: [3],
      }),
      createShift({
        id: 'REINFORCEMENT',
        name: 'Reforço',
        order: 2,
        startTime: '08:00',
        activeWeekdays: [3, 5],
      }),
    ]);

    expect(validateAdminConfiguration(configuration)).toContainEqual({
      path: 'shifts.1',
      message: 'Regular e Reforço possuem aulas sobrepostas nos mesmos dias.',
    });
  });

  it('requires at least one registered class group', () => {
    const configuration = createConfiguration();
    configuration.classGroups = [];

    expect(validateAdminConfiguration(configuration)).toContainEqual({
      path: 'classGroups',
      message: 'Cadastre pelo menos uma turma.',
    });
  });

  it('reports invalid required data, weekdays, duration, interval, and class size', () => {
    const configuration = createConfiguration([
      createShift({
        classDurationMinutes: 19,
        classCount: 2,
        breakAfterClass: 2,
        breakDurationMinutes: 4,
        activeWeekdays: [],
      }),
    ]);
    configuration.school.name = ' ';
    configuration.laboratories[0]!.active = false;
    configuration.classGroups[0]!.studentCount = 201;
    configuration.resources[0]!.active = false;

    expect(validateAdminConfiguration(configuration)).toEqual(
      expect.arrayContaining([
        { path: 'school.name', message: 'Informe o nome da escola.' },
        {
          path: 'laboratories',
          message: 'Mantenha pelo menos um laboratório disponível para agendamento.',
        },
        {
          path: 'shifts.0.classDurationMinutes',
          message: 'A duração das aulas de Manhã deve ficar entre 20 e 180 minutos.',
        },
        {
          path: 'shifts.0.activeWeekdays',
          message: 'Escolha pelo menos um dia para Manhã.',
        },
        {
          path: 'shifts.0.breakAfterClass',
          message: 'Escolha uma aula válida antes do intervalo de Manhã.',
        },
        {
          path: 'shifts.0.breakDurationMinutes',
          message: 'O intervalo de Manhã deve ficar entre 5 e 90 minutos.',
        },
        {
          path: 'classGroups.0.studentCount',
          message: 'A quantidade de estudantes de 1ª série A deve ficar entre 0 e 200.',
        },
        {
          path: 'resources',
          message: 'Mantenha pelo menos um recurso disponível no formulário.',
        },
      ]),
    );
  });

  it('reports repeated resource IDs and labels', () => {
    const configuration = createConfiguration();
    configuration.resources.push({
      ...configuration.resources[0]!,
      order: 2,
    });

    expect(validateAdminConfiguration(configuration)).toEqual(
      expect.arrayContaining([
        {
          path: 'resources.1.id',
          message: 'Há identificadores repetidos em resources.',
        },
        {
          path: 'resources.1',
          message: 'Não é possível repetir do recurso.',
        },
      ]),
    );
  });

  it('requires one settings record for each laboratory and rejects orphan records', () => {
    const missingSettings = createConfiguration();
    missingSettings.laboratorySettings = [];

    expect(validateAdminConfiguration(missingSettings)).toContainEqual({
      path: 'laboratorySettings',
      message: 'As regras de Laboratório de Teste não foram configuradas.',
    });

    const orphanSettings = createConfiguration();
    orphanSettings.laboratorySettings.push(
      createDefaultLaboratoryAdminConfiguration('LAB-INEXISTENTE'),
    );

    expect(validateAdminConfiguration(orphanSettings)).toContainEqual({
      path: 'laboratorySettings.1.laboratoryId',
      message: 'Há regras vinculadas a um laboratório que não existe mais (LAB-INEXISTENTE).',
    });
  });

  it('validates capacity, scheduling, responsible person, Chat, and enabled SED-SC fields', () => {
    const configuration = createConfiguration();
    configuration.laboratorySettings[0] = {
      ...configuration.laboratorySettings[0]!,
      responsibleName: '',
      responsibleEmail: 'email-invalido',
      maxConcurrentClasses: 0,
      maxStudentCapacity: 0,
      minimumLeadTimeValue: -1,
      pastBookingLimitDays: 0,
      sedIntegrationEnabled: true,
      sedLinkLeadMinutes: 1441,
      googleChatEnabled: true,
      googleChatSpaceName: '',
    };
    configuration.sedSc = {
      ...configuration.sedSc,
      enabled: true,
      formUrl: 'url-invalida',
    };

    expect(validateAdminConfiguration(configuration)).toEqual(
      expect.arrayContaining([
        {
          path: 'laboratorySettings.0.maxConcurrentClasses',
          message: 'O limite simultâneo de Laboratório de Teste deve ficar entre 1 e 50 turmas.',
        },
        {
          path: 'laboratorySettings.0.maxStudentCapacity',
          message: 'A capacidade de Laboratório de Teste deve ficar entre 1 e 2.000 estudantes.',
        },
        {
          path: 'laboratorySettings.0.minimumLeadTimeValue',
          message: 'A antecedência mínima de Laboratório de Teste deve ficar entre 0 e 10.080.',
        },
        {
          path: 'laboratorySettings.0.pastBookingLimitDays',
          message: 'O limite retroativo de Laboratório de Teste deve ficar entre 1 e 3.650 dias.',
        },
        {
          path: 'laboratorySettings.0.sedLinkLeadMinutes',
          message: 'O aviso da SED de Laboratório de Teste deve ficar entre 0 e 1.440 minutos.',
        },
        {
          path: 'laboratorySettings.0.responsibleName',
          message: 'Informe o laboratorista responsável por Laboratório de Teste.',
        },
        {
          path: 'laboratorySettings.0.responsibleEmail',
          message: 'Informe o e-mail do responsável por Laboratório de Teste.',
        },
        {
          path: 'laboratorySettings.0.googleChatSpaceName',
          message: 'Informe o espaço do Google Chat usado por Laboratório de Teste.',
        },
        {
          path: 'sedSc.formUrl',
          message: 'Informe uma URL válida para o formulário da SED-SC.',
        },
        {
          path: 'sedSc.regionalName',
          message: 'Informe a regional da SED-SC.',
        },
        {
          path: 'sedSc.municipalityName',
          message: 'Informe o município na SED-SC.',
        },
        {
          path: 'sedSc.officialSchoolName',
          message: 'Informe o nome oficial da escola na SED-SC.',
        },
      ]),
    );
  });

  it('allows the same responsible e-mail in independent laboratories', () => {
    const configuration = createConfiguration();
    configuration.laboratories.push({
      id: 'LAB-SECOND',
      name: 'Segundo laboratório',
      active: true,
    });
    configuration.laboratorySettings = configuration.laboratories.map((laboratory) => ({
      ...createDefaultLaboratoryAdminConfiguration(laboratory.id),
      responsibleName: 'Laboratorista compartilhado',
      responsibleEmail: 'laboratorista@escola.edu.br',
      sedIntegrationEnabled: true,
    }));
    configuration.sedSc = {
      enabled: true,
      formUrl: 'https://docs.google.com/forms/d/e/formulario/viewform',
      regionalName: 'Regional de Teste',
      municipalityName: 'Município de Teste',
      officialSchoolName: 'Escola de Teste',
      defaultArea: '',
      defaultActivityType: '',
    };

    expect(validateAdminConfiguration(configuration)).toEqual([]);
  });
});

describe('isDeferredSetupValidationIssue', () => {
  it('accepts only the three incomplete quick-setup requirements', () => {
    expect(
      [
        { path: 'shifts', message: 'Mantenha pelo menos um turno ativo.' },
        { path: 'classGroups', message: 'Cadastre pelo menos uma turma.' },
        {
          path: 'resources',
          message: 'Mantenha pelo menos um recurso disponível no formulário.',
        },
      ].every(isDeferredSetupValidationIssue),
    ).toBe(true);
  });

  it('does not defer structural errors even when they share a collection path', () => {
    expect(
      isDeferredSetupValidationIssue({
        path: 'shifts',
        message: 'Há identificadores repetidos em shifts.',
      }),
    ).toBe(false);
    expect(
      isDeferredSetupValidationIssue({
        path: 'shifts.0.classCount',
        message: 'A quantidade de aulas é inválida.',
      }),
    ).toBe(false);
    expect(
      isDeferredSetupValidationIssue({
        path: 'school.name',
        message: 'Informe o nome da escola.',
      }),
    ).toBe(false);
  });
});
