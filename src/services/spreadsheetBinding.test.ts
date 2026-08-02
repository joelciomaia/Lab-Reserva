import { describe, expect, it } from 'vitest';

import {
  createSpreadsheetBindingFingerprint,
  verifySpreadsheetBinding,
} from './spreadsheetBinding';

const selectedSpreadsheetId = 'planilha-existente';
const selectedSpreadsheetFingerprint =
  'sha256-v1:a6fdb63321b550603a4a4328e023dd3d62b03f55013e49f5297f025440a7ccad';

describe('vínculo entre painel e Web App', () => {
  it('gera o mesmo protocolo SHA-256 usado pelo Apps Script', async () => {
    await expect(createSpreadsheetBindingFingerprint(selectedSpreadsheetId)).resolves.toBe(
      selectedSpreadsheetFingerprint,
    );
  });

  it('confirma apenas a planilha selecionada no painel', async () => {
    await expect(
      verifySpreadsheetBinding(selectedSpreadsheetId, selectedSpreadsheetFingerprint),
    ).resolves.toBe(true);
    await expect(
      verifySpreadsheetBinding('outra-planilha', selectedSpreadsheetFingerprint),
    ).resolves.toBe(false);
  });

  it('falha de forma fechada quando o Web App não envia um verificador válido', async () => {
    await expect(verifySpreadsheetBinding(selectedSpreadsheetId, undefined)).resolves.toBe(false);
    await expect(
      verifySpreadsheetBinding(selectedSpreadsheetId, 'planilha-existente'),
    ).resolves.toBe(false);
  });
});
