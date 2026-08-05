interface ApiSuccess<T> {
  ok: true;
  data: T;
}

interface ApiFailure {
  ok: false;
  error?: {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
}

export type AppsScriptEnvelope<T> = ApiSuccess<T> | ApiFailure;

const RESPONSE_SOURCE = 'lab-reserva-apps-script';
const REQUEST_TIMEOUT_MS = 45_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function isTrustedAppsScriptOrigin(origin: string): boolean {
  if (origin === 'null') {
    return true;
  }

  try {
    const url = new URL(origin);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'script.google.com' ||
        url.hostname === 'script.googleusercontent.com' ||
        url.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

function appendHiddenInput(form: HTMLFormElement, name: string, value: string): void {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = name;
  input.value = value;
  form.append(input);
}

function encodePayload(payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

/**
 * Envia uma operação ao Web App do Apps Script por formulário e recebe a
 * resposta por postMessage. O payload segue em Base64 URL-safe para não ser
 * alterado pelo application/x-www-form-urlencoded usado pelo formulário.
 */
export function callAppsScriptViaForm<T>(
  endpoint: string,
  payload: Record<string, unknown>,
): Promise<AppsScriptEnvelope<T>> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.body) {
    return Promise.reject(
      new Error('O transporte do Apps Script só está disponível no navegador.'),
    );
  }

  const requestId = createRequestId();
  const frameName = `lab-reserva-apps-script-${requestId.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const iframe = document.createElement('iframe');
  iframe.name = frameName;
  iframe.tabIndex = -1;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = '';
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '-10000px';
  iframe.style.width = '1px';
  iframe.style.height = '1px';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = endpoint;
  form.target = frameName;
  form.hidden = true;
  form.style.display = 'none';

  appendHiddenInput(form, 'transport', 'iframe');
  appendHiddenInput(form, 'requestId', requestId);
  appendHiddenInput(form, 'origin', window.location.origin);
  appendHiddenInput(form, 'payloadBase64', encodePayload(payload));

  return new Promise<AppsScriptEnvelope<T>>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      iframe.remove();
      form.remove();
    };

    const finishWithError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      reject(error);
    };

    const handleMessage = (event: MessageEvent<unknown>) => {
      if (!isTrustedAppsScriptOrigin(event.origin) || !isRecord(event.data)) {
        return;
      }
      if (event.data.source !== RESPONSE_SOURCE || event.data.requestId !== requestId) {
        return;
      }

      const envelope = event.data.envelope;
      if (!isRecord(envelope) || typeof envelope.ok !== 'boolean') {
        finishWithError(new Error('O Apps Script retornou uma resposta inválida.'));
        return;
      }

      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(envelope as unknown as AppsScriptEnvelope<T>);
    };

    const timeoutId = window.setTimeout(() => {
      finishWithError(
        new Error(
          'O Apps Script não respondeu. Verifique se a implantação está publicada para qualquer pessoa e se a versão mais recente foi implantada.',
        ),
      );
    }, REQUEST_TIMEOUT_MS);

    window.addEventListener('message', handleMessage);
    document.body.append(iframe, form);

    try {
      form.submit();
    } catch (error: unknown) {
      finishWithError(error instanceof Error ? error : new Error('Não foi possível chamar o Apps Script.'));
    }
  });
}
