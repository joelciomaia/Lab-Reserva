export interface PublicAgendaContext {
  schoolId?: string;
  laboratoryId?: string;
}

function normalizedParameter(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized;
}

export function getPublicAgendaContext(
  routeSearch: string,
  browserSearch = '',
): PublicAgendaContext {
  const routeParameters = new URLSearchParams(routeSearch);
  const browserParameters = new URLSearchParams(browserSearch);
  const schoolId =
    normalizedParameter(routeParameters.get('school')) ??
    normalizedParameter(browserParameters.get('school'));
  const laboratoryId =
    normalizedParameter(routeParameters.get('lab')) ??
    normalizedParameter(browserParameters.get('lab'));

  return {
    ...(schoolId ? { schoolId } : {}),
    ...(laboratoryId ? { laboratoryId } : {}),
  };
}

export function hasPublicAgendaContext(routeSearch: string, browserSearch = ''): boolean {
  const context = getPublicAgendaContext(routeSearch, browserSearch);
  if (context.schoolId !== undefined) {
    return true;
  }

  return context.laboratoryId !== undefined;
}
