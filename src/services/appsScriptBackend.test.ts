import { describe, expect, it, vi } from 'vitest';

import type { BootstrapData, CreateReservationRequest, Reservation } from '../types';
import { AppsScriptBackend } from './appsScriptBackend';

const endpoint = 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AppsScriptBackend', () => {
  it('carrega o bootstrap real sem fallback para mocks', async () => {
    const data = {
      school: { id: 'SCHOOL-1', name: 'Escola' },
      laboratories: [],
      periods: [],
      classGroups: [],
      subjects: [],
      resources: [],
      bookingForm: { showObservations: false },
      configurationRevision: 'revision-1',
      sourceSpreadsheetFingerprint:
        'sha256-v1:a6fdb63321b550603a4a4328e023dd3d62b03f55013e49f5297f025440a7ccad',
    } satisfies BootstrapData;
    const fetchImplementation = vi
      .fn<typeof window.fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data }));
    const client = new AppsScriptBackend(endpoint, { fetchImplementation });

    await expect(client.getBootstrapData({ preselectedLaboratoryId: 'LAB 1' })).resolves.toEqual(
      data,
    );

    const [requestedUrl, init] = fetchImplementation.mock.calls[0]!;
    expect(requestedUrl).toBeInstanceOf(URL);
    if (!(requestedUrl instanceof URL)) {
      throw new TypeError('O backend deve chamar fetch com uma URL normalizada.');
    }
    const url = new URL(requestedUrl);
    expect(url.searchParams.get('action')).toBe('bootstrap');
    expect(url.searchParams.get('lab')).toBe('LAB 1');
    expect(init).toMatchObject({ method: 'GET', cache: 'no-store' });
  });

  it('envia a reserva como POST simples para evitar preflight', async () => {
    const request: CreateReservationRequest = {
      laboratoryId: 'LAB01',
      teacherName: 'Joana',
      subject: 'Biologia',
      classGroup: '1ª A',
      date: '2026-08-10',
      periodIds: ['P01'],
      knowledgeObjects: 'Células',
      itemsUsed: 'Microscópio',
      notes: '',
    };
    const reservation: Reservation = {
      id: 'RES-1',
      date: request.date,
      laboratoryId: request.laboratoryId,
      laboratoryName: 'Laboratório',
      teacherName: request.teacherName,
      classGroup: request.classGroup,
      subject: request.subject,
      periodIds: request.periodIds,
      periodLabels: ['1ª aula'],
      periodTimes: ['07:30–08:15'],
      knowledgeObjects: request.knowledgeObjects,
      itemsUsed: request.itemsUsed,
      notes: request.notes,
      createdAt: '2026-08-01T12:00:00.000Z',
    };
    const fetchImplementation = vi
      .fn<typeof window.fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data: reservation }));
    const client = new AppsScriptBackend(endpoint, { fetchImplementation });

    await expect(client.createReservation(request)).resolves.toEqual(reservation);

    const [, init] = fetchImplementation.mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    });
    expect(typeof init?.body).toBe('string');
    if (typeof init?.body !== 'string') {
      throw new TypeError('O corpo da reserva deve ser JSON textual.');
    }
    expect(JSON.parse(init.body) as unknown).toEqual({ action: 'createReservation', request });
  });

  it('mantém o payload público de disponibilidade sem dados pessoais da reserva', async () => {
    const fetchImplementation = vi.fn<typeof window.fetch>().mockResolvedValue(
      jsonResponse({
        ok: true,
        data: {
          date: '2026-08-10',
          laboratoryId: 'LAB01',
          periods: [
            {
              periodId: 'P01',
              shiftId: 'MORNING',
              shiftName: 'Manhã',
              shiftOrder: 1,
              classNumber: 1,
              label: '1ª aula',
              startTime: '07:30',
              endTime: '08:15',
              status: 'UNAVAILABLE',
              reservation: {
                id: 'RES-1',
                teacherName: 'Nome que um backend antigo ainda pode enviar',
                classGroup: 'Turma privada',
                subject: 'Disciplina privada',
              },
            },
          ],
        },
      }),
    );
    const client = new AppsScriptBackend(endpoint, { fetchImplementation });

    const availability = await client.getAvailability({
      laboratoryId: 'LAB01',
      date: '2026-08-10',
    });

    expect(availability.periods[0]?.reservation).toEqual({ id: 'RES-1' });
  });

  it('preserva os erros funcionais retornados pelo servidor', async () => {
    const fetchImplementation = vi.fn<typeof window.fetch>().mockResolvedValue(
      jsonResponse({
        ok: false,
        error: { code: 'TIME_CONFLICT', message: 'Horário ocupado.' },
      }),
    );
    const client = new AppsScriptBackend(endpoint, { fetchImplementation });

    await expect(
      client.getAvailability({ laboratoryId: 'LAB01', date: '2026-08-10' }),
    ).rejects.toMatchObject({ code: 'TIME_CONFLICT', message: 'Horário ocupado.' });
  });

  it('rejeita endpoints externos arbitrários', () => {
    expect(() => new AppsScriptBackend('https://example.com/collect')).toThrow(
      /Google Apps Script/i,
    );
  });
});
