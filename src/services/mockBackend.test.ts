import { describe, expect, it } from 'vitest';

import type { CreateReservationRequest } from '../types';
import { BackendError, getFriendlyError } from '../types';
import { MockBackend } from './mockBackend';

const createRequest = (
  overrides: Partial<CreateReservationRequest> = {},
): CreateReservationRequest => ({
  teacherId: 'TEACHER01',
  teacherEmail: 'ana.ribeiro@horizontedosaber.edu.br',
  laboratoryId: 'LAB01',
  date: '2026-09-10',
  classGroup: '8º A',
  subject: 'Matemática',
  purpose: 'Atividade com recursos digitais',
  studentCount: 30,
  periodIds: ['P01'],
  resources: [],
  notes: '',
  ...overrides,
});

describe('MockBackend bootstrap', () => {
  it('returns reference data without eagerly loading reservations', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    const bootstrap = await backend.getBootstrapData();

    expect(bootstrap.setupCompleted).toBe(true);
    expect(bootstrap.laboratories.length).toBeGreaterThan(0);
    expect(bootstrap.periods.length).toBeGreaterThan(0);
    expect('reservations' in bootstrap).toBe(false);
  });

  it('preserves a valid laboratory preselection received from a QR link', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    const bootstrap = await backend.getBootstrapData({ preselectedLaboratoryId: 'LAB02' });

    expect(bootstrap.preselectedLaboratoryId).toBe('LAB02');
  });

  it('ignores an unknown laboratory preselection', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    const bootstrap = await backend.getBootstrapData({ preselectedLaboratoryId: 'LAB404' });

    expect(bootstrap).not.toHaveProperty('preselectedLaboratoryId');
  });
});

describe('MockBackend availability', () => {
  it('returns the requested date and laboratory with available and unavailable periods', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    const availability = await backend.getAvailability({
      laboratoryId: 'LAB01',
      date: '2026-08-20',
    });

    expect(availability).toMatchObject({
      laboratoryId: 'LAB01',
      date: '2026-08-20',
    });
    expect(availability.periods.find((period) => period.periodId === 'P01')).toMatchObject({
      status: 'AVAILABLE',
      occupiedCapacity: 0,
      availableCapacity: 36,
      activeReservations: 0,
    });
    expect(availability.periods.find((period) => period.periodId === 'P03')).toMatchObject({
      status: 'UNAVAILABLE',
      occupiedCapacity: 36,
      availableCapacity: 0,
      activeReservations: 1,
    });
  });

  it('reports partial capacity for a shared laboratory', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    const availability = await backend.getAvailability({
      laboratoryId: 'LAB02',
      date: '2026-08-20',
    });

    expect(availability.periods.find((period) => period.periodId === 'P02')).toMatchObject({
      status: 'PARTIAL',
      occupiedCapacity: 12,
      availableCapacity: 12,
      activeReservations: 1,
    });
  });

  it('rejects an unknown laboratory with a domain error', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    await expect(
      backend.getAvailability({ laboratoryId: 'LAB404', date: '2026-08-20' }),
    ).rejects.toMatchObject({
      code: 'LABORATORY_NOT_FOUND',
      message: 'Laboratório não encontrado ou inativo.',
    });
  });
});

describe('MockBackend reservation rules', () => {
  it('rejects a reservation above the laboratory capacity', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    await expect(
      backend.createReservation(createRequest({ studentCount: 37 })),
    ).rejects.toMatchObject({
      code: 'CAPACITY_EXCEEDED',
      message: 'A capacidade máxima deste laboratório é de 36 pessoas.',
    });
  });

  it('rejects a reservation containing an unavailable period', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    await expect(
      backend.createReservation(createRequest({ periodIds: ['P02', 'P03'] })),
    ).rejects.toMatchObject({
      code: 'TIME_CONFLICT',
      message: 'Um dos horários selecionados não está mais disponível.',
    });
  });

  it('cancels a created reservation while retaining its record', async () => {
    const backend = new MockBackend({ latencyMs: 0 });
    const initialAdminData = await backend.getAdminData();
    const reservation = await backend.createReservation(createRequest());

    await backend.cancelReservation(reservation.id);

    await expect(backend.getReservation(reservation.id)).resolves.toMatchObject({
      id: reservation.id,
      status: 'CANCELLED',
    });
    await expect(backend.getAdminData()).resolves.toMatchObject({
      activeReservations: initialAdminData.activeReservations,
    });
  });

  it('returns a specific error when cancelling an unknown reservation', async () => {
    const backend = new MockBackend({ latencyMs: 0 });

    await expect(backend.cancelReservation('RES-UNKNOWN')).rejects.toMatchObject({
      code: 'RESERVATION_NOT_FOUND',
      message: 'Reserva não encontrada.',
    });
  });
});

describe('friendly backend errors', () => {
  it('exposes the controlled bootstrap failure without technical details', async () => {
    const backend = new MockBackend({ latencyMs: 0, failBootstrap: true });

    await expect(backend.getBootstrapData()).rejects.toMatchObject({
      code: 'BACKEND_UNAVAILABLE',
      message: 'Não foi possível carregar os dados da escola.',
    });
  });

  it('keeps controlled domain errors and hides unknown errors', () => {
    const domainError = new BackendError('UNAUTHORIZED', 'Acesso não autorizado.');

    expect(getFriendlyError(domainError)).toBe(domainError);
    expect(getFriendlyError(new Error('stack trace sensível'))).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Não foi possível concluir a operação. Tente novamente em instantes.',
    });
  });
});
