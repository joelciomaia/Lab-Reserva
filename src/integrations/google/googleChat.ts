export const GOOGLE_CHAT_SPACES_SETUP_API_URL = 'https://chat.googleapis.com/v1/spaces:setup';

const GOOGLE_CHAT_SPACE_NAME_PATTERN = /^spaces\/[A-Za-z0-9_-]+$/;
const GOOGLE_CHAT_SPACE_NAME_MAX_LENGTH = 256;

export type GoogleChatFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SetupPrivateGoogleChatOptions {
  accessToken: string;
  fetchImplementation?: GoogleChatFetch;
}

export interface GoogleChatPrivateSpace {
  name: string;
}

export type GoogleChatIntegrationErrorCode =
  'AUTHORIZATION_REQUIRED' | 'CHAT_API_ERROR' | 'INVALID_RESPONSE';

export class GoogleChatIntegrationError extends Error {
  public readonly code: GoogleChatIntegrationErrorCode;
  public readonly status: number | null;

  constructor(code: GoogleChatIntegrationErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = 'GoogleChatIntegrationError';
    this.code = code;
    this.status = status;
  }
}

export function isGoogleChatSpaceName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= GOOGLE_CHAT_SPACE_NAME_MAX_LENGTH &&
    GOOGLE_CHAT_SPACE_NAME_PATTERN.test(value)
  );
}

function requireAccessToken(accessToken: string): string {
  const normalizedToken = accessToken.trim();
  if (!normalizedToken) {
    throw new GoogleChatIntegrationError(
      'AUTHORIZATION_REQUIRED',
      'Autorize o Google Chat antes de conectar as notificações.',
    );
  }
  return normalizedToken;
}

function resolveFetch(fetchImplementation?: GoogleChatFetch): GoogleChatFetch {
  if (fetchImplementation) {
    return fetchImplementation;
  }
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch.bind(window);
  }
  if (typeof fetch === 'function') {
    return fetch;
  }
  throw new GoogleChatIntegrationError(
    'CHAT_API_ERROR',
    'O Google Chat não está disponível neste ambiente.',
  );
}

function invalidResponse(status: number | null): GoogleChatIntegrationError {
  return new GoogleChatIntegrationError(
    'INVALID_RESPONSE',
    'O Google Chat retornou uma conversa inválida.',
    status,
  );
}

export async function setupPrivateGoogleChat({
  accessToken,
  fetchImplementation,
}: SetupPrivateGoogleChatOptions): Promise<GoogleChatPrivateSpace> {
  const normalizedToken = requireAccessToken(accessToken);
  const request = resolveFetch(fetchImplementation);

  let response: Response;
  try {
    response = await request(GOOGLE_CHAT_SPACES_SETUP_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${normalizedToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        space: {
          spaceType: 'DIRECT_MESSAGE',
          singleUserBotDm: true,
        },
      }),
    });
  } catch {
    throw new GoogleChatIntegrationError(
      'CHAT_API_ERROR',
      'Não foi possível acessar o Google Chat. Verifique sua conexão e tente novamente.',
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new GoogleChatIntegrationError(
        'AUTHORIZATION_REQUIRED',
        'A autorização do Google expirou. Entre novamente para continuar.',
        response.status,
      );
    }
    if (response.status === 403) {
      throw new GoogleChatIntegrationError(
        'CHAT_API_ERROR',
        'O Google Chat recusou a conexão. Confirme a permissão e a configuração do aplicativo.',
        response.status,
      );
    }
    throw new GoogleChatIntegrationError(
      'CHAT_API_ERROR',
      'O Google Chat não conseguiu criar a conversa privada. Tente novamente.',
      response.status,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (payload === null || typeof payload !== 'object') {
    throw invalidResponse(response.status);
  }

  const space = payload as {
    name?: unknown;
    spaceType?: unknown;
    singleUserBotDm?: unknown;
  };
  if (!isGoogleChatSpaceName(space.name)) {
    throw invalidResponse(response.status);
  }
  if (space.spaceType !== undefined && space.spaceType !== 'DIRECT_MESSAGE') {
    throw invalidResponse(response.status);
  }
  if (space.singleUserBotDm !== undefined && space.singleUserBotDm !== true) {
    throw invalidResponse(response.status);
  }

  return { name: space.name };
}
