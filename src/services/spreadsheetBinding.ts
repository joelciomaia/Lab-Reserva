const SPREADSHEET_BINDING_NAMESPACE = 'lab-reservas:spreadsheet:v1:';
const SPREADSHEET_BINDING_PATTERN = /^sha256-v1:[0-9a-f]{64}$/;

function requireCrypto(): Crypto {
  const cryptoImplementation = globalThis.crypto;
  if (!cryptoImplementation?.subtle) {
    throw new Error(
      'Este navegador não oferece a validação segura necessária para liberar o QR Code.',
    );
  }
  return cryptoImplementation;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Identificador público e irreversível usado somente para confirmar que o
 * painel e o Web App apontam para a mesma planilha. Não é credencial de acesso.
 */
export async function createSpreadsheetBindingFingerprint(spreadsheetId: string): Promise<string> {
  const normalizedSpreadsheetId = spreadsheetId.trim();
  if (!normalizedSpreadsheetId) {
    throw new Error('Não foi possível validar uma planilha sem ID.');
  }

  const source = new TextEncoder().encode(
    `${SPREADSHEET_BINDING_NAMESPACE}${normalizedSpreadsheetId}`,
  );
  const digest = await requireCrypto().subtle.digest('SHA-256', source);
  return `sha256-v1:${bytesToHex(new Uint8Array(digest))}`;
}

export async function verifySpreadsheetBinding(
  spreadsheetId: string,
  sourceSpreadsheetFingerprint: unknown,
): Promise<boolean> {
  if (
    typeof sourceSpreadsheetFingerprint !== 'string' ||
    !SPREADSHEET_BINDING_PATTERN.test(sourceSpreadsheetFingerprint)
  ) {
    return false;
  }

  return (
    (await createSpreadsheetBindingFingerprint(spreadsheetId)) === sourceSpreadsheetFingerprint
  );
}
