import { describe, expect, it } from 'vitest';

import { AppsScriptBackend, UnconfiguredBackend } from './appsScriptBackend';
import { createBackendClient } from './backend';

describe('createBackendClient', () => {
  it('usa o backend real do Apps Script quando a URL está configurada', () => {
    expect(
      createBackendClient({
        appsScriptUrl: 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec',
      }),
    ).toBeInstanceOf(AppsScriptBackend);
  });

  it('falha explicitamente sem configuração em vez de carregar dados mockados', async () => {
    const client = createBackendClient({ appsScriptUrl: ' ' });

    expect(client).toBeInstanceOf(UnconfiguredBackend);
    await expect(client.getBootstrapData()).rejects.toMatchObject({
      code: 'BACKEND_UNAVAILABLE',
    });
    await expect(client.getBootstrapData()).rejects.toThrow(/agenda real.*Google Sheets/i);
  });
});
