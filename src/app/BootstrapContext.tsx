/* eslint-disable react-refresh/only-export-components -- o provider e seu hook formam uma única API */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { backendClient } from '../services/backend';
import type { AppError, BackendClient, BootstrapData, BootstrapParams } from '../types';
import { getFriendlyError } from '../types';

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

function getPreselectedLaboratoryId(searchParameters: URLSearchParams): string | undefined {
  return (
    normalizedPublicParameter(searchParameters.get('lab')) ??
    normalizedPublicParameter(new URLSearchParams(window.location.search).get('lab')) ??
    normalizedPublicParameter(window.APP_BOOTSTRAP?.preselectedLaboratoryId)
  );
}

function getPublicSchoolId(searchParameters: URLSearchParams): string | undefined {
  return (
    normalizedPublicParameter(searchParameters.get('school')) ??
    normalizedPublicParameter(new URLSearchParams(window.location.search).get('school'))
  );
}

export function BootstrapProvider({ children, client = backendClient }: BootstrapProviderProps) {
  const location = useLocation();
  const isManagerRoute = location.pathname.startsWith('/gerenciar');
  const publicParameters = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const publicSchoolId = getPublicSchoolId(publicParameters);
  const preselectedLaboratoryId = getPreselectedLaboratoryId(publicParameters);
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
    if (isManagerRoute) {
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
  }, [client, isManagerRoute, preselectedLaboratoryId, publicSchoolId, requestVersion]);

  const value = useMemo(
    () => ({
      data: isManagerRoute ? null : data,
      client,
      isLoading: isManagerRoute ? false : isLoading,
      error: isManagerRoute ? null : error,
      reload,
    }),
    [client, data, error, isLoading, isManagerRoute, reload],
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
