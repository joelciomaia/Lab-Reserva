import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CHAT_SPACES_CREATE_SCOPE,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_IDENTITY_SCRIPT_URL,
  loadGoogleIdentityServices,
  requestGoogleChatAccessToken,
  requestGoogleSheetsAccessToken,
} from './googleIdentity';
import type {
  GoogleIdentityWindow,
  GoogleTokenClient,
  GoogleTokenClientConfig,
} from './googleIdentity.types';

function removeGoogleIdentity(): void {
  document.getElementById('google-identity-services')?.remove();
  delete (window as GoogleIdentityWindow).google;
}

describe('Google Identity Services', () => {
  afterEach(() => {
    removeGoogleIdentity();
    vi.restoreAllMocks();
  });

  it('carrega dinamicamente somente o script oficial', async () => {
    const loading = loadGoogleIdentityServices();
    const script = document.getElementById('google-identity-services');

    expect(script).toBeInstanceOf(HTMLScriptElement);
    expect((script as HTMLScriptElement).src).toBe(GOOGLE_IDENTITY_SCRIPT_URL);

    (window as GoogleIdentityWindow).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(),
        },
      },
    };
    script?.dispatchEvent(new Event('load'));

    await expect(loading).resolves.toBeUndefined();
  });

  it('pede um token com apenas o escopo limitado aos arquivos do aplicativo', async () => {
    let receivedConfig: GoogleTokenClientConfig | null = null;
    const requestAccessToken = vi.fn();
    (window as GoogleIdentityWindow).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: GoogleTokenClientConfig) => {
            receivedConfig = config;
            return {
              requestAccessToken: (
                overrideConfig: Parameters<GoogleTokenClient['requestAccessToken']>[0],
              ) => {
                requestAccessToken(overrideConfig);
                config.callback({
                  access_token: 'access-token-memory-only',
                  expires_in: 3600,
                  scope: GOOGLE_DRIVE_FILE_SCOPE,
                  token_type: 'Bearer',
                });
              },
            };
          }),
        },
      },
    };

    await expect(
      requestGoogleSheetsAccessToken('client-id.apps.googleusercontent.com'),
    ).resolves.toEqual({
      accessToken: 'access-token-memory-only',
      expiresInSeconds: 3600,
      grantedScope: GOOGLE_DRIVE_FILE_SCOPE,
    });
    expect(receivedConfig).toMatchObject({
      client_id: 'client-id.apps.googleusercontent.com',
      scope: GOOGLE_DRIVE_FILE_SCOPE,
    });
    expect(receivedConfig).not.toHaveProperty('include_granted_scopes');
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'select_account' });
  });

  it('pede os escopos do Sheets e do Chat somente na autorização incremental', async () => {
    let receivedConfig: GoogleTokenClientConfig | null = null;
    const requestAccessToken = vi.fn();
    const grantedScope = `${GOOGLE_DRIVE_FILE_SCOPE} ${GOOGLE_CHAT_SPACES_CREATE_SCOPE}`;
    (window as GoogleIdentityWindow).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: GoogleTokenClientConfig) => {
            receivedConfig = config;
            return {
              requestAccessToken: (
                overrideConfig: Parameters<GoogleTokenClient['requestAccessToken']>[0],
              ) => {
                requestAccessToken(overrideConfig);
                config.callback({
                  access_token: 'token-chat-memory-only',
                  expires_in: 1800,
                  scope: grantedScope,
                  token_type: 'Bearer',
                });
              },
            };
          }),
        },
      },
    };

    await expect(
      requestGoogleChatAccessToken('client-id.apps.googleusercontent.com'),
    ).resolves.toEqual({
      accessToken: 'token-chat-memory-only',
      expiresInSeconds: 1800,
      grantedScope,
    });
    expect(receivedConfig).toMatchObject({
      client_id: 'client-id.apps.googleusercontent.com',
      scope: grantedScope,
      include_granted_scopes: true,
    });
    expect(requestAccessToken).toHaveBeenCalledWith({ prompt: 'consent' });
  });

  it('não ativa o Chat quando o usuário concede somente acesso aos arquivos', async () => {
    (window as GoogleIdentityWindow).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: GoogleTokenClientConfig) => ({
            requestAccessToken: () => {
              config.callback({
                access_token: 'token-sem-chat',
                expires_in: 3600,
                scope: GOOGLE_DRIVE_FILE_SCOPE,
                token_type: 'Bearer',
              });
            },
          })),
        },
      },
    };

    await expect(
      requestGoogleChatAccessToken('client-id.apps.googleusercontent.com'),
    ).rejects.toThrow('A permissão para conectar o Lab Reserva ao Google Chat não foi concedida.');
  });

  it('recusa continuar quando a permissão aos arquivos do aplicativo não foi concedida', async () => {
    (window as GoogleIdentityWindow).google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: GoogleTokenClientConfig) => ({
            requestAccessToken: () => {
              config.callback({
                access_token: 'token-sem-sheets',
                expires_in: 3600,
                scope: 'openid',
                token_type: 'Bearer',
              });
            },
          })),
        },
      },
    };

    await expect(
      requestGoogleSheetsAccessToken('client-id.apps.googleusercontent.com'),
    ).rejects.toThrow('A permissão para criar e editar os arquivos do Lab Reserva');
  });

  it('informa quando o script oficial não pode ser carregado', async () => {
    const loading = loadGoogleIdentityServices();
    document.getElementById('google-identity-services')?.dispatchEvent(new Event('error'));

    await expect(loading).rejects.toThrow(
      'Não foi possível carregar o serviço de autenticação do Google.',
    );
    expect(document.getElementById('google-identity-services')).toBeNull();
  });
});
