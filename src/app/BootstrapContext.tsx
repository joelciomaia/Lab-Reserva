/* eslint-disable react-refresh/only-export-components -- o provider e seu hook formam uma única API */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { backendClient } from '../services/backend';
import type { AppError, BackendClient, BootstrapData } from '../types';
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

function getPreselectedLaboratoryId(): string | undefined {
  const injectedValue = window.APP_BOOTSTRAP?.preselectedLaboratoryId;
  if (injectedValue) {
    return injectedValue;
  }

  const queryValue = new URLSearchParams(window.location.search).get('lab');
  return queryValue === null || queryValue === '' ? undefined : queryValue;
}

export function BootstrapProvider({ children, client = backendClient }: BootstrapProviderProps) {
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
    let isCurrentRequest = true;
    const preselectedLaboratoryId = getPreselectedLaboratoryId();
    const params = preselectedLaboratoryId ? { preselectedLaboratoryId } : {};

    void client
      .getBootstrapData(params)
      .then((bootstrapData) => {
        if (isCurrentRequest) {
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
  }, [client, requestVersion]);

  const value = useMemo(
    () => ({ data, client, isLoading, error, reload }),
    [client, data, error, isLoading, reload],
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
