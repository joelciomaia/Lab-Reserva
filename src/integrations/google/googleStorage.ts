export const GOOGLE_SPREADSHEET_STORAGE_KEY = 'lab-reserva.google.spreadsheet-id.v1';
export const GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY = 'lab-reserva.google.known-spreadsheet-ids.v1';
export const GOOGLE_PENDING_EMPTY_SPREADSHEET_STORAGE_KEY =
  'lab-reserva.google.pending-empty-spreadsheet-id.v1';

const MAX_KNOWN_SPREADSHEETS = 20;

export type SpreadsheetIdStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: SpreadsheetIdStorage): SpreadsheetIdStorage | null {
  if (storage) {
    return storage;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getStoredSpreadsheetId(storage?: SpreadsheetIdStorage): string | null {
  try {
    const spreadsheetId = resolveStorage(storage)?.getItem(GOOGLE_SPREADSHEET_STORAGE_KEY)?.trim();
    if (spreadsheetId) {
      return spreadsheetId;
    }
    return null;
  } catch {
    return null;
  }
}

export function getPendingEmptySpreadsheetId(storage?: SpreadsheetIdStorage): string | null {
  try {
    const storedId = resolveStorage(storage)
      ?.getItem(GOOGLE_PENDING_EMPTY_SPREADSHEET_STORAGE_KEY)
      ?.trim();
    if (!storedId) {
      return null;
    }
    return storedId;
  } catch {
    return null;
  }
}

export function storePendingEmptySpreadsheetId(
  spreadsheetId: string,
  storage?: SpreadsheetIdStorage,
): void {
  const normalizedId = spreadsheetId.trim();
  if (!normalizedId) {
    throw new Error('Não foi possível guardar a criação pendente: o ID da planilha está vazio.');
  }

  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    throw new Error('O armazenamento local não está disponível neste navegador.');
  }

  try {
    targetStorage.setItem(GOOGLE_PENDING_EMPTY_SPREADSHEET_STORAGE_KEY, normalizedId);
  } catch {
    throw new Error('Não foi possível guardar a criação pendente da planilha.');
  }
}

export function clearPendingEmptySpreadsheetId(
  spreadsheetId: string,
  storage?: SpreadsheetIdStorage,
): void {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return;
  }

  try {
    if (getPendingEmptySpreadsheetId(targetStorage) === spreadsheetId.trim()) {
      targetStorage.removeItem(GOOGLE_PENDING_EMPTY_SPREADSHEET_STORAGE_KEY);
    }
  } catch {
    // A planilha já foi marcada; a limpeza local é apenas de melhor esforço.
  }
}

export function getKnownSpreadsheetIds(storage?: SpreadsheetIdStorage): string[] {
  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(
      targetStorage.getItem(GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY) ?? '[]',
    );
    const knownIds = Array.isArray(parsed)
      ? parsed.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        )
      : [];
    const currentId = getStoredSpreadsheetId(targetStorage);
    return [
      ...new Set([...(currentId ? [currentId] : []), ...knownIds.map((id) => id.trim())]),
    ].slice(0, MAX_KNOWN_SPREADSHEETS);
  } catch {
    const currentId = getStoredSpreadsheetId(targetStorage);
    return currentId ? [currentId] : [];
  }
}

export function storeSpreadsheetId(spreadsheetId: string, storage?: SpreadsheetIdStorage): void {
  const normalizedId = spreadsheetId.trim();
  if (!normalizedId) {
    throw new Error('Não foi possível guardar o vínculo: o ID da planilha está vazio.');
  }

  const targetStorage = resolveStorage(storage);
  if (!targetStorage) {
    throw new Error('O armazenamento local não está disponível neste navegador.');
  }

  try {
    const knownIds = getKnownSpreadsheetIds(targetStorage).filter((id) => id !== normalizedId);
    targetStorage.setItem(GOOGLE_SPREADSHEET_STORAGE_KEY, normalizedId);
    targetStorage.setItem(
      GOOGLE_KNOWN_SPREADSHEETS_STORAGE_KEY,
      JSON.stringify([normalizedId, ...knownIds].slice(0, MAX_KNOWN_SPREADSHEETS)),
    );
  } catch {
    throw new Error('Não foi possível guardar o vínculo local com a planilha.');
  }
}

export function clearStoredSpreadsheetId(storage?: SpreadsheetIdStorage): void {
  try {
    resolveStorage(storage)?.removeItem(GOOGLE_SPREADSHEET_STORAGE_KEY);
  } catch {
    // A remoção é apenas uma limpeza local de melhor esforço.
  }
}

export function getSpreadsheetUrl(spreadsheetId: string | null): string | null {
  return spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`
    : null;
}
