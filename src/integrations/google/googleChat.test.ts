import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CHAT_SPACES_SETUP_API_URL,
  GoogleChatIntegrationError,
  isGoogleChatSpaceName,
  setupPrivateGoogleChat,
  type GoogleChatFetch,
} from './googleChat';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('integração com o Google Chat', () => {
  it('cria somente uma conversa privada entre o usuário e o app', async () => {
    const fetchImplementation = vi.fn<GoogleChatFetch>();
    fetchImplementation.mockResolvedValue(
      jsonResponse({
        name: 'spaces/AAAA-private-dm',
        spaceType: 'DIRECT_MESSAGE',
        singleUserBotDm: true,
      }),
    );

    await expect(
      setupPrivateGoogleChat({
        accessToken: '  access-token-memory-only  ',
        fetchImplementation,
      }),
    ).resolves.toEqual({ name: 'spaces/AAAA-private-dm' });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(GOOGLE_CHAT_SPACES_SETUP_API_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer access-token-memory-only',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        space: {
          spaceType: 'DIRECT_MESSAGE',
          singleUserBotDm: true,
        },
      }),
    });
  });

  it('aceita apenas nomes de recurso no formato spaces/{id}', () => {
    expect(isGoogleChatSpaceName('spaces/AAAA-private_dm')).toBe(true);
    expect(isGoogleChatSpaceName('spaces/')).toBe(false);
    expect(isGoogleChatSpaceName('space/AAAA')).toBe(false);
    expect(isGoogleChatSpaceName('spaces/AAAA/messages/BBBB')).toBe(false);
    expect(isGoogleChatSpaceName(' spaces/AAAA ')).toBe(false);
    expect(isGoogleChatSpaceName(null)).toBe(false);
  });

  it('recusa resposta que não identifica uma DM privada do app', async () => {
    const fetchImplementation = vi.fn<GoogleChatFetch>();
    fetchImplementation.mockResolvedValue(
      jsonResponse({
        name: 'spaces/AAAA',
        spaceType: 'SPACE',
        singleUserBotDm: false,
      }),
    );

    await expect(
      setupPrivateGoogleChat({ accessToken: 'access-token', fetchImplementation }),
    ).rejects.toMatchObject({
      name: 'GoogleChatIntegrationError',
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });

  it('exige autorização antes de chamar a API', async () => {
    const fetchImplementation = vi.fn<GoogleChatFetch>();

    await expect(
      setupPrivateGoogleChat({ accessToken: '   ', fetchImplementation }),
    ).rejects.toMatchObject({
      name: 'GoogleChatIntegrationError',
      code: 'AUTHORIZATION_REQUIRED',
      status: null,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('transforma falhas da API em erro seguro sem expor o token', async () => {
    const secretAccessToken = 'secret-token-that-must-not-leak';
    const fetchImplementation = vi.fn<GoogleChatFetch>();
    fetchImplementation.mockResolvedValue(
      jsonResponse({ error: { message: secretAccessToken } }, 403),
    );

    let receivedError: unknown;
    try {
      await setupPrivateGoogleChat({ accessToken: secretAccessToken, fetchImplementation });
    } catch (error: unknown) {
      receivedError = error;
    }

    expect(receivedError).toBeInstanceOf(GoogleChatIntegrationError);
    expect(receivedError).toMatchObject({ code: 'CHAT_API_ERROR', status: 403 });
    expect(String(receivedError)).not.toContain(secretAccessToken);
  });

  it('informa quando a conexão com o Chat falha antes de receber resposta', async () => {
    const fetchImplementation = vi.fn<GoogleChatFetch>();
    fetchImplementation.mockRejectedValue(new Error('network unavailable'));

    await expect(
      setupPrivateGoogleChat({ accessToken: 'access-token', fetchImplementation }),
    ).rejects.toMatchObject({
      name: 'GoogleChatIntegrationError',
      code: 'CHAT_API_ERROR',
      status: null,
    });
  });
});
