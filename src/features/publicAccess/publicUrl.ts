export interface BuildLaboratoryPublicUrlOptions {
  publicAppUrl?: string;
  currentUrl?: string;
}

function getBrowserUrl(): string {
  if (typeof window === 'undefined') {
    throw new Error('Informe a URL pública da aplicação fora do navegador.');
  }

  return window.location.href;
}

function getConfiguredPublicAppUrl(): string | undefined {
  const configuredUrl = import.meta.env.VITE_PUBLIC_APP_URL;
  return typeof configuredUrl === 'string' && configuredUrl.trim()
    ? configuredUrl.trim()
    : undefined;
}

function normalizeApplicationBaseUrl(rawBaseUrl: string, currentUrl: string): string {
  let baseUrl: URL;

  try {
    baseUrl = new URL(rawBaseUrl, currentUrl);
  } catch {
    throw new Error('A URL pública configurada para a aplicação é inválida.');
  }

  baseUrl.hash = '';
  baseUrl.search = '';

  if (!baseUrl.pathname.endsWith('/')) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }

  return baseUrl.toString();
}

/**
 * Builds the public HashRouter URL for a laboratory inside its school workspace.
 * Google Sheet identifiers, endpoints and tokens never become part of the link.
 */
export function buildLaboratoryPublicUrl(
  schoolId: string,
  laboratoryId: string,
  options: BuildLaboratoryPublicUrlOptions = {},
): string {
  const normalizedSchoolId = schoolId.trim();
  const normalizedLaboratoryId = laboratoryId.trim();

  if (!normalizedSchoolId) {
    throw new Error('O identificador público da escola é obrigatório.');
  }
  if (!normalizedLaboratoryId) {
    throw new Error('O identificador público do laboratório é obrigatório.');
  }

  const requestedCurrentUrl = options.currentUrl?.trim();
  const currentUrl =
    requestedCurrentUrl === undefined || requestedCurrentUrl === ''
      ? getBrowserUrl()
      : requestedCurrentUrl;
  const requestedPublicAppUrl = options.publicAppUrl?.trim();
  const rawBaseUrl =
    requestedPublicAppUrl === undefined || requestedPublicAppUrl === ''
      ? (getConfiguredPublicAppUrl() ?? currentUrl)
      : requestedPublicAppUrl;
  const baseUrl = normalizeApplicationBaseUrl(rawBaseUrl, currentUrl);

  return `${baseUrl}#/?school=${encodeURIComponent(normalizedSchoolId)}&lab=${encodeURIComponent(normalizedLaboratoryId)}`;
}
