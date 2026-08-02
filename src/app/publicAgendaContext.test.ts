import { describe, expect, it } from 'vitest';
import { getPublicAgendaContext, hasPublicAgendaContext } from './publicAgendaContext';

describe('contexto da agenda pública', () => {
  it('mantém a raiz sem parâmetros como apresentação', () => {
    expect(hasPublicAgendaContext('')).toBe(false);
    expect(hasPublicAgendaContext('?date=2026-08-10')).toBe(false);
  });

  it('reconhece uma tentativa de acesso público por escola ou laboratório', () => {
    expect(hasPublicAgendaContext('?school=SCHOOL-1')).toBe(true);
    expect(hasPublicAgendaContext('?lab=LAB-1')).toBe(true);
  });

  it('prioriza os parâmetros do HashRouter e preserva links legados', () => {
    expect(
      getPublicAgendaContext(
        '?school=SCHOOL-HASH&lab=LAB-HASH',
        '?school=SCHOOL-LEGACY&lab=LAB-LEGACY',
      ),
    ).toEqual({ schoolId: 'SCHOOL-HASH', laboratoryId: 'LAB-HASH' });
    expect(getPublicAgendaContext('', '?school=SCHOOL-LEGACY&lab=LAB-LEGACY')).toEqual({
      schoolId: 'SCHOOL-LEGACY',
      laboratoryId: 'LAB-LEGACY',
    });
  });
});
