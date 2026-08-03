import type {
  GoogleIdentityWindow,
  GoogleTokenClientConfig,
  GoogleTokenResponse,
} from './googleIdentity.types';

export type {
  GoogleIdentityWindow,
  GoogleOAuthPrompt,
  GoogleTokenClient,
  GoogleTokenClientConfig,
  GoogleTokenClientOverrideConfig,
  GoogleTokenResponse,
} from './googleIdentity.types';

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_CHAT_SPACES_CREATE_SCOPE = 'https://www.googleapis.com/auth/chat.spaces.create';
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

interface GoogleAccessTokenRequest {
  clientId: string;
  scopes: readonly string[];
  prompt: 'consent' | 'select_account';
  includeGrantedScopes?: boolean;
  missingPermissionMessage: string;
}

async function requestGoogleAccessToken({
  clientId,
  scopes,
  prompt,
  includeGrantedScopes,
  missingPermissionMessage,
}: GoogleAccessTokenRequest): Promise<GoogleAccessToken> {
  await loadGoogleIdentityServices();

  return new Promise<GoogleAccessToken>((resolve, reject) => {
    const oauth2 = googleIdentityWindow().google?.accounts.oauth2;
    if (!oauth2) {
      reject(new Error('O serviço de autorização do Google não está disponível.'));
      return;
    }

    const tokenClientConfig: GoogleTokenClientConfig = {
      client_id: clientId,
      scope: scopes.join(' '),
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new Error(getAuthorizationErrorMessage(response)));
          return;
        }

        const grantedScopes = (response.scope ?? '').split(/\s+/).filter(Boolean);
        if (!scopes.every((scope) => grantedScopes.includes(scope))) {
          reject(new Error(missingPermissionMessage));
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
    };

    if (includeGrantedScopes !== undefined) {
      tokenClientConfig.include_granted_scopes = includeGrantedScopes;
    }

    const tokenClient = oauth2.initTokenClient(tokenClientConfig);

    tokenClient.requestAccessToken({ prompt });
  });
}

export function requestGoogleSheetsAccessToken(
  clientId = getGoogleClientId(),
): Promise<GoogleAccessToken> {
  return requestGoogleAccessToken({
    clientId,
    scopes: [GOOGLE_DRIVE_FILE_SCOPE],
    prompt: 'select_account',
    missingPermissionMessage:
      'A permissão para criar e editar os arquivos do Lab Reserva não foi concedida.',
  });
}

export function requestGoogleChatAccessToken(
  clientId = getGoogleClientId(),
): Promise<GoogleAccessToken> {
  return requestGoogleAccessToken({
    clientId,
    scopes: [GOOGLE_DRIVE_FILE_SCOPE, GOOGLE_CHAT_SPACES_CREATE_SCOPE],
    prompt: 'consent',
    includeGrantedScopes: true,
    missingPermissionMessage:
      'A permissão para conectar o Lab Reserva ao Google Chat não foi concedida.',
  });
}
