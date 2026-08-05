/* eslint-disable react-refresh/only-export-components -- o provider e seu hook formam uma única API */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { backendClient } from '../services/backend';
import type { AppError, BackendClient, BootstrapData, BootstrapParams } from '../types';
import { getFriendlyError } from '../types';
import { getPublicAgendaContext, hasPublicAgendaContext } from './publicAgendaContext';

interface BootstrapContextValue {
  data: BootstrapData | null;
  client: BackendClient;
  isLoading: boolean;
  error: AppError | null;
  reload: () => void;
}

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export interface BootstrapProviderProps extends PropsWithChildren {
  client?: BackendClient;
}

function normalizedPublicParameter(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }
  return normalized;
}

export function BootstrapProvider({ children, client = backendClient }: BootstrapProviderProps) {
  const location = useLocation();
  const isManagerRoute = location.pathname.startsWith('/gerenciar');
  const explicitPublicContext = useMemo(
    () => getPublicAgendaContext(location.search, window.location.search),
    [location.search],
  );
  const publicSchoolId = explicitPublicContext.schoolId;
  const preselectedLaboratoryId =
    explicitPublicContext.laboratoryId ??
    normalizedPublicParameter(window.APP_BOOTSTRAP?.preselectedLaboratoryId);
  const shouldLoadPublicData =
    location.pathname === '/agendar' ||
    (location.pathname === '/' && hasPublicAgendaContext(location.search, window.location.search));
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setRequestVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (isManagerRoute || !shouldLoadPublicData) {
      return;
    }

    let isCurrentRequest = true;
    const params: BootstrapParams = {
      ...(publicSchoolId ? { schoolId: publicSchoolId } : {}),
      ...(preselectedLaboratoryId ? { preselectedLaboratoryId } : {}),
    };

    // A fila assíncrona evita atualizações síncronas de estado dentro do efeito
    // e também impede que uma rota administrativa dispare o bootstrap público.
    void Promise.resolve()
      .then(() => {
        if (!isCurrentRequest) {
          return null;
        }
        setIsLoading(true);
        setError(null);
        return client.getBootstrapData(params);
      })
      .then((bootstrapData) => {
        if (isCurrentRequest && bootstrapData) {
          setData(bootstrapData);
        }
      })
      .catch((requestError: unknown) => {
        if (isCurrentRequest) {
          setError(getFriendlyError(requestError));
        }
      })
      .finally(() => {
        if (isCurrentRequest) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [
    client,
    isManagerRoute,
    preselectedLaboratoryId,
    publicSchoolId,
    requestVersion,
    shouldLoadPublicData,
  ]);

  const value = useMemo(
    () => ({
      data: isManagerRoute || !shouldLoadPublicData ? null : data,
      client,
      isLoading: isManagerRoute || !shouldLoadPublicData ? false : isLoading,
      error: isManagerRoute || !shouldLoadPublicData ? null : error,
      reload,
    }),
    [client, data, error, isLoading, isManagerRoute, reload, shouldLoadPublicData],
  );

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapContextValue {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error('useBootstrap deve ser usado dentro de BootstrapProvider.');
  }
  return context;
}
