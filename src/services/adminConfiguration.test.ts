import { describe, expect, it } from 'vitest';

import { createDefaultLaboratoryAdminConfiguration } from '../domain/configuration';
import type { AdminConfiguration, AdminConfigurationDraft } from '../types';
import { getSchoolWeek } from '../utils/week';
import { MockBackend } from './mockBackend';

function toDraft(configuration: AdminConfiguration): AdminConfigurationDraft {
  return {
    school: structuredClone(configuration.school),
    laboratories: structuredClone(configuration.laboratories),
    shifts: structuredClone(configuration.shifts),
    classGroups: structuredClone(configuration.classGroups),
    subjects: structuredClone(configuration.subjects),
    resources: structuredClone(configuration.resources),
    bookingForm: structuredClone(configuration.bookingForm),
    laboratorySettings: structuredClone(configuration.laboratorySettings),
    sedSc: structuredClone(configuration.sedSc),
  };
}

function createProjectedConfiguration(): AdminConfigurationDraft {
  return {
    school: {
      id: 'SCHOOL-CONFIGURED',
      name: 'Escola Configurada',
    },
    laboratories: [
      {
        id: 'LAB-ACTIVE',
        name: 'Laboratório Ativo',
        active: true,
      },
      {
        id: 'LAB-INACTIVE',
        name: 'Laboratório Inativo',
        active: false,
      },
    ],
    shifts: [
      {
        id: 'CUSTOM-SHIFT',
        name: 'Turno Personalizado',
        order: 1,
        startTime: '08:10',
        classDurationMinutes: 40,
        classCount: 3,
        breakAfterClass: 1,
        breakDurationMinutes: 10,
        activeWeekdays: [2, 4],
        active: true,
      },
      {
        id: 'INACTIVE-SHIFT',
        name: 'Turno Inativo',
        order: 2,
        startTime: '14:00',
        classDurationMinutes: 45,
        classCount: 1,
        breakAfterClass: null,
        breakDurationMinutes: 15,
        activeWeekdays: [1, 2, 3, 4, 5],
        active: false,
      },
    ],
    classGroups: [
      {
        id: 'CLASS-ACTIVE',
        label: '1ª série A',
        gradeId: 'high-school-1',
        studentCount: 30,
        order: 1,
        active: true,
      },
      {
        id: 'CLASS-INACTIVE',
        label: 'Turma arquivada',
        gradeId: 'other',
        studentCount: 0,
        order: 2,
        active: false,
      },
    ],
    subjects: [
      {
        id: 'SUBJECT-ACTIVE',
        label: 'Ciências',
        order: 1,
        active: true,
      },
      {
        id: 'SUBJECT-INACTIVE',
        label: 'Disciplina arquivada',
        order: 2,
        active: false,
      },
    ],
    resources: [
      {
        id: 'RESOURCE-ACTIVE',
        label: 'Recurso ativo',
        order: 1,
        active: true,
      },
      {
        id: 'RESOURCE-INACTIVE',
        label: 'Recurso arquivado',
        order: 2,
        active: false,
      },
    ],
    bookingForm: {
      showObservations: true,
    },
    laboratorySettings: [
      {
        ...createDefaultLaboratoryAdminConfiguration('LAB-ACTIVE'),
        responsibleName: 'Laboratorista Ativo',
        responsibleEmail: 'laboratorista@escola.edu.br',
        maxConcurrentClasses: 3,
        maxStudentCapacity: 42,
        allowPastBookings: true,
        pastBookingLimitDays: 60,
        sedIntegrationEnabled: true,
        googleChatEnabled: true,
        googleChatSpaceName: 'spaces/AAAA-active',
      },
      {
        ...createDefaultLaboratoryAdminConfiguration('LAB-INACTIVE'),
        responsibleName: 'Laboratorista Inativo',
        responsibleEmail: 'laboratorista@escola.edu.br',
      },
    ],
    sedSc: {
      enabled: true,
      formUrl: 'https://docs.google.com/forms/d/e/formulario/viewform',
      regionalName: 'Regional Configurada',
      municipalityName: 'Município Configurado',
      officialSchoolName: 'Escola Configurada',
      defaultArea: 'Tecnologia',
      defaultActivityType: 'Aula',
    },
  };
}

describe('MockBackend admin configuration', () => {
  it('starts a new school with only one editable class group', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    await expect(backend.getAdminConfiguration()).resolves.toMatchObject({
      classGroups: [
        {
          id: 'class-grade-1-a',
          label: '1ª série A',
          order: 1,
          active: true,
        },
      ],
    });
    expect((await backend.getAdminConfiguration()).classGroups).toHaveLength(1);
    await expect(backend.getAdminConfiguration()).resolves.toMatchObject({
      laboratorySettings: [
        {
          laboratoryId: 'LAB01',
          maxConcurrentClasses: 1,
          maxStudentCapacity: null,
          allowPastBookings: false,
          sedLinkLeadMinutes: 10,
        },
        { laboratoryId: 'LAB02' },
        { laboratoryId: 'LAB03' },
      ],
      sedSc: {
        enabled: false,
        formUrl: '',
      },
    });
  });

  it('returns and saves defensive clones of the complete configuration', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const firstRead = await backend.getAdminConfiguration();
    const initialSnapshot = structuredClone(firstRead);

    firstRead.school.name = 'Mutação externa';
    firstRead.laboratories[0]!.name = 'Laboratório alterado externamente';
    firstRead.shifts[0]!.activeWeekdays.push(7);
    firstRead.classGroups[0]!.label = 'Turma alterada externamente';
    firstRead.subjects[0]!.label = 'Disciplina alterada externamente';
    firstRead.resources[0]!.label = 'Recurso alterado externamente';
    firstRead.bookingForm.showObservations = !firstRead.bookingForm.showObservations;
    firstRead.laboratorySettings[0]!.responsibleName = 'Responsável alterado externamente';
    firstRead.sedSc.regionalName = 'Regional alterada externamente';

    expect(await backend.getAdminConfiguration()).toEqual(initialSnapshot);

    const draft = toDraft(initialSnapshot);
    draft.school.name = 'Escola salva';
    const saved = await backend.saveAdminConfiguration({
      expectedRevision: initialSnapshot.revision,
      configuration: draft,
    });
    const savedSnapshot = structuredClone(saved);

    draft.school.name = 'Mutação do payload após o save';
    draft.shifts[0]!.activeWeekdays.push(7);
    draft.laboratorySettings[0]!.responsibleName = 'Mutação das regras após o save';
    draft.sedSc.regionalName = 'Mutação da SED após o save';
    saved.school.name = 'Mutação da resposta';
    saved.laboratories[0]!.name = 'Mutação aninhada da resposta';
    saved.laboratorySettings[0]!.responsibleName = 'Mutação das regras na resposta';
    saved.sedSc.regionalName = 'Mutação da SED na resposta';

    expect(await backend.getAdminConfiguration()).toEqual(savedSnapshot);
  });

  it('rejects a stale revision without overwriting the latest configuration', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const initial = await backend.getAdminConfiguration();
    const firstDraft = toDraft(initial);
    firstDraft.school.name = 'Primeira alteração';

    const saved = await backend.saveAdminConfiguration({
      expectedRevision: initial.revision,
      configuration: firstDraft,
    });
    const staleDraft = toDraft(initial);
    staleDraft.school.name = 'Alteração obsoleta';

    await expect(
      backend.saveAdminConfiguration({
        expectedRevision: initial.revision,
        configuration: staleDraft,
      }),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_CONFLICT',
      message:
        'As configurações foram alteradas em outra tela. Recarregue antes de salvar novamente.',
    });

    expect(await backend.getAdminConfiguration()).toMatchObject({
      revision: saved.revision,
      school: { name: 'Primeira alteração' },
    });
  });

  it('projects only active laboratories, shifts, classes, and subjects into bootstrap', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const initial = await backend.getAdminConfiguration();

    const saved = await backend.saveAdminConfiguration({
      expectedRevision: initial.revision,
      configuration: createProjectedConfiguration(),
    });
    const bootstrap = await backend.getBootstrapData();

    expect(bootstrap.configurationRevision).toBe(saved.revision);
    expect(bootstrap.laboratories.map((laboratory) => laboratory.id)).toEqual(['LAB-ACTIVE']);
    expect(bootstrap.periods.map((period) => period.shiftId)).toEqual([
      'CUSTOM-SHIFT',
      'CUSTOM-SHIFT',
      'CUSTOM-SHIFT',
    ]);
    expect(bootstrap.classGroups.map((classGroup) => classGroup.id)).toEqual(['CLASS-ACTIVE']);
    expect(bootstrap.subjects.map((subject) => subject.id)).toEqual(['SUBJECT-ACTIVE']);
    expect(bootstrap.resources.map((resource) => resource.id)).toEqual(['RESOURCE-ACTIVE']);
    expect(bootstrap.bookingForm.showObservations).toBe(true);

    expect(saved.laboratories.map((laboratory) => laboratory.id)).toEqual([
      'LAB-ACTIVE',
      'LAB-INACTIVE',
    ]);
    expect(saved.shifts.map((shift) => shift.id)).toEqual(['CUSTOM-SHIFT', 'INACTIVE-SHIFT']);
    expect(saved.resources.map((resource) => resource.id)).toEqual([
      'RESOURCE-ACTIVE',
      'RESOURCE-INACTIVE',
    ]);
    expect(saved.laboratorySettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laboratoryId: 'LAB-ACTIVE',
          responsibleName: 'Laboratorista Ativo',
          responsibleEmail: 'laboratorista@escola.edu.br',
          maxConcurrentClasses: 3,
          maxStudentCapacity: 42,
          allowPastBookings: true,
        }),
        expect.objectContaining({
          laboratoryId: 'LAB-INACTIVE',
          responsibleEmail: 'laboratorista@escola.edu.br',
        }),
      ]),
    );
    expect(saved.sedSc).toMatchObject({
      enabled: true,
      regionalName: 'Regional Configurada',
      officialSchoolName: 'Escola Configurada',
    });
    expect(bootstrap).not.toHaveProperty('laboratorySettings');
    expect(bootstrap).not.toHaveProperty('sedSc');
  });

  it('creates default settings when a laboratory is added without an explicit rules record', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const initial = await backend.getAdminConfiguration();
    const draft = toDraft(initial);
    draft.laboratories.push({
      id: 'LAB-NEW',
      name: 'Novo laboratório',
      active: true,
    });

    const saved = await backend.saveAdminConfiguration({
      expectedRevision: initial.revision,
      configuration: draft,
    });

    expect(saved.laboratorySettings).toContainEqual(
      createDefaultLaboratoryAdminConfiguration('LAB-NEW'),
    );
  });

  it('regenerates period times and applicable weekdays after saving', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const initial = await backend.getAdminConfiguration();
    const week = getSchoolWeek(new Date(2099, 0, 5));

    await backend.saveAdminConfiguration({
      expectedRevision: initial.revision,
      configuration: createProjectedConfiguration(),
    });

    const bootstrap = await backend.getBootstrapData();
    expect(
      bootstrap.periods.map(({ id, classNumber, startTime, endTime, activeWeekdays }) => ({
        id,
        classNumber,
        startTime,
        endTime,
        activeWeekdays,
      })),
    ).toEqual([
      {
        id: 'CUSTOM-SHIFT-CLASS-1',
        classNumber: 1,
        startTime: '08:10',
        endTime: '08:50',
        activeWeekdays: [2, 4],
      },
      {
        id: 'CUSTOM-SHIFT-CLASS-2',
        classNumber: 2,
        startTime: '09:00',
        endTime: '09:40',
        activeWeekdays: [2, 4],
      },
      {
        id: 'CUSTOM-SHIFT-CLASS-3',
        classNumber: 3,
        startTime: '09:40',
        endTime: '10:20',
        activeWeekdays: [2, 4],
      },
    ]);

    const tuesdayAvailability = await backend.getAvailability({
      laboratoryId: 'LAB-ACTIVE',
      date: week[1]!.isoDate,
    });
    const wednesdayAvailability = await backend.getAvailability({
      laboratoryId: 'LAB-ACTIVE',
      date: week[2]!.isoDate,
    });

    expect(
      tuesdayAvailability.periods.map(({ periodId, startTime, endTime }) => ({
        periodId,
        startTime,
        endTime,
      })),
    ).toEqual([
      {
        periodId: 'CUSTOM-SHIFT-CLASS-1',
        startTime: '08:10',
        endTime: '08:50',
      },
      {
        periodId: 'CUSTOM-SHIFT-CLASS-2',
        startTime: '09:00',
        endTime: '09:40',
      },
      {
        periodId: 'CUSTOM-SHIFT-CLASS-3',
        startTime: '09:40',
        endTime: '10:20',
      },
    ]);
    expect(wednesdayAvailability.periods).toEqual([]);
  });
});
