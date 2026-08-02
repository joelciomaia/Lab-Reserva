import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingEmptySpreadsheetId,
  clearStoredSpreadsheetId,
  getKnownSpreadsheetIds,
  getPendingEmptySpreadsheetId,
  getSpreadsheetUrl,
  getStoredSpreadsheetId,
  GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY,
  GOOGLE_PENDING_EMPTY_SPREADSHEET_STORAGE_KEY,
  GOOGLE_SPREADSHEET_STORAGE_KEY,
  storePendingEmptySpreadsheetId,
  storeSpreadsheetId,
} from './googleStorage';

describe('vínculo local temporário com a planilha', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('guarda somente o spreadsheetId e o recupera', () => {
    storeSpreadsheetId(' sheet-123 ');

    expect(getStoredSpreadsheetId()).toBe('sheet-123');
    expect(window.localStorage).toHaveLength(2);
    expect(window.localStorage.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)).toBe('sheet-123');
    expect(window.localStorage.getItem(GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY)).toBe(
      '["sheet-123"]',
    );
  });

  it('remove o vínculo local sem afetar outras chaves', () => {
    window.localStorage.setItem('outra-chave', 'preservar');
    storeSpreadsheetId('sheet-123');

    clearStoredSpreadsheetId();

    expect(getStoredSpreadsheetId()).toBeNull();
    expect(getKnownSpreadsheetIds()).toEqual(['sheet-123']);
    expect(window.localStorage.getItem('outra-chave')).toBe('preservar');
  });

  it('mantém um histórico local para troca de conta e migra o vínculo antigo', () => {
    window.localStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, 'sheet-legada');

    expect(getKnownSpreadsheetIds()).toEqual(['sheet-legada']);

    storeSpreadsheetId('sheet-nova');
    expect(getKnownSpreadsheetIds()).toEqual(['sheet-nova', 'sheet-legada']);
  });

  it('monta o link editável da planilha', () => {
    expect(getSpreadsheetUrl('sheet com espaço')).toBe(
      'https://docs.google.com/spreadsheets/d/sheet%20com%20espa%C3%A7o/edit',
    );
    expect(getSpreadsheetUrl(null)).toBeNull();
  });

  it('recusa um identificador vazio', () => {
    expect(() => storeSpreadsheetId('   ')).toThrow(/ID da planilha está vazio/);
  });

  it('mantém e limpa somente a criação vazia correspondente', () => {
    storePendingEmptySpreadsheetId(' sheet-pendente ');

    expect(getPendingEmptySpreadsheetId()).toBe('sheet-pendente');
    expect(window.localStorage.getItem(GOOGLE_PENDING_EMPTY_SPREADSHEET_STORAGE_KEY)).toBe(
      'sheet-pendente',
    );

    clearPendingEmptySpreadsheetId('outra-planilha');
    expect(getPendingEmptySpreadsheetId()).toBe('sheet-pendente');

    clearPendingEmptySpreadsheetId('sheet-pendente');
    expect(getPendingEmptySpreadsheetId()).toBeNull();
  });
});
