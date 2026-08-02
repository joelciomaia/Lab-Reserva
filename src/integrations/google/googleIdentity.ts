import type { GoogleIdentityWindow, GoogleTokenResponse } from './googleIdentity.types';

export type {
  GoogleIdentityWindow,
  GoogleTokenClient,
  GoogleTokenClientConfig,
  GoogleTokenResponse,
} from './googleIdentity.types';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_IDENTITY_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';

let pendingScriptLoad: Promise<void> | null = null;

function googleIdentityWindow(): GoogleIdentityWindow {
  return window;
}

function hasGoogleIdentityServices(): boolean {
  return typeof googleIdentityWindow().google?.accounts.oauth2?.initTokenClient === 'function';
}

function getAuthorizationErrorMessage(response: GoogleTokenResponse): string {
  const description = response.error_description?.trim();
  if (description) {
    return description;
  }
  const code = response.error?.trim();
  if (code) {
    return code;
  }
  return 'A autorização do Google não foi concluída.';
}

export function getGoogleClientId(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error(
      'A conexão com o Google ainda não foi configurada para este endereço. O responsável pela implantação precisa cadastrar o Client ID do aplicativo.',
    );
  }
  if (!clientId.endsWith('.apps.googleusercontent.com')) {
    throw new Error('O Client ID configurado para a conexão com o Google não é válido.');
  }
  return clientId;
}

export function loadGoogleIdentityServices(): Promise<void> {
  if (hasGoogleIdentityServices()) {
    return Promise.resolve();
  }

  if (pendingScriptLoad) {
    return pendingScriptLoad;
  }

  pendingScriptLoad = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID);
    const script =
      existingScript instanceof HTMLScriptElement
        ? existingScript
        : Object.assign(document.createElement('script'), {
            id: GOOGLE_IDENTITY_SCRIPT_ID,
            src: GOOGLE_IDENTITY_SCRIPT_URL,
            async: true,
            defer: true,
          });

    const cleanup = () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
    const handleLoad = () => {
      cleanup();
      if (!hasGoogleIdentityServices()) {
        reject(new Error('O Google Identity Services foi carregado, mas não está disponível.'));
        return;
      }
      resolve();
    };
    const handleError = () => {
      cleanup();
      script.remove();
      reject(new Error('Não foi possível carregar o serviço de autenticação do Google.'));
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    if (!existingScript) {
      document.head.append(script);
    }
  }).finally(() => {
    pendingScriptLoad = null;
  });

  return pendingScriptLoad;
}

export interface GoogleAccessToken {
  accessToken: string;
  expiresInSeconds: number;
  grantedScope: string;
}

export async function requestGoogleSheetsAccessToken(
  clientId = getGoogleClientId(),
): Promise<GoogleAccessToken> {
  await loadGoogleIdentityServices();

  return new Promise<GoogleAccessToken>((resolve, reject) => {
    const oauth2 = googleIdentityWindow().google?.accounts.oauth2;
    if (!oauth2) {
      reject(new Error('O serviço de autorização do Google não está disponível.'));
      return;
    }

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(getAuthorizationErrorMessage(response)));
          return;
        }

        const grantedScopes = (response.scope ?? '').split(/\s+/).filter(Boolean);
        if (!grantedScopes.includes(GOOGLE_DRIVE_FILE_SCOPE)) {
          reject(
            new Error(
              'A permissão para criar e editar os arquivos do Lab Reserva não foi concedida.',
            ),
          );
          return;
        }

        const expiresInSeconds = Number(response.expires_in);
        resolve({
          accessToken: response.access_token,
          expiresInSeconds:
            Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 3600,
          grantedScope: response.scope ?? '',
        });
      },
      error_callback: (error) => {
        const providedMessage = error.message?.trim();
        const message =
          providedMessage && providedMessage.length > 0
            ? providedMessage
            : error.type === 'popup_closed'
              ? 'A janela de autorização do Google foi fechada.'
              : 'Não foi possível abrir a autorização do Google.';
        reject(new Error(message));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}
