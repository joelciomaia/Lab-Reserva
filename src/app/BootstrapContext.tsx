/* eslint-disable react-refresh/only-export-components -- o provider e seu hook formam uma única API */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { useLocation } from 'react-router-dom';
import { backendClient } from '../services/backend';
import { loadBookingOptions } from '../services/bookingOptionsLoader';
import type { AppError, BackendClient, BootstrapData, BootstrapParams } from '../types';
import { getFriendlyError } from '../types';
import { isValidIsoDate } from '../utils/dates';
import { getCurrentAgendaReferenceDate, getSchoolWeek } from '../utils/week';
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
  const isBookingRoute = location.pathname === '/agendar';
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
  const initialAvailability = useMemo(() => {
    if (isBookingRoute || !preselectedLaboratoryId) {
      return undefined;
    }

    const queryDate = new URLSearchParams(location.search).get('date');
    const referenceDate = isValidIsoDate(queryDate)
      ? new Date(`${queryDate}T12:00:00`)
      : getCurrentAgendaReferenceDate(new Date());
    return {
      laboratoryId: preselectedLaboratoryId,
      dates: getSchoolWeek(referenceDate).map((day) => day.isoDate),
    };
  }, [isBookingRoute, location.search, preselectedLaboratoryId]);
  const [data, setData] = useState<BootstrapData | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [bookingOptionsError, setBookingOptionsError] = useState<AppError | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(() => {
    setIsLoading(true);
    setError(null);
    setBookingOptionsError(null);
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
    ...(initialAvailability ? { initialAvailability } : {}),
  };

    // A agenda principal recebe primeiro apenas escola, laboratórios e horários.
    // Disciplinas, turmas e recursos são lidos em segundo plano, sem bloquear a tela.
    void Promise.resolve()
      .then(() => {
        if (!isCurrentRequest) {
          return null;
        }
        setIsLoading(true);
        setError(null);
        setBookingOptionsError(null);
        return client.getBootstrapData(params);
      })
      .then((bootstrapData) => {
        if (!isCurrentRequest || !bootstrapData) {
          return;
        }

        setData(bootstrapData);
        setIsLoading(false);

        void loadBookingOptions(bootstrapData.school.id)
          .then((options) => {
            if (!isCurrentRequest) {
              return;
            }
            setBookingOptionsError(null);
            setData((currentData) =>
              currentData?.school.id === bootstrapData.school.id
                ? { ...currentData, ...options }
                : currentData,
            );
          })
          .catch((requestError: unknown) => {
            if (isCurrentRequest) {
              setBookingOptionsError(getFriendlyError(requestError));
            }
          });
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
    initialAvailability,
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
      error:
        isManagerRoute || !shouldLoadPublicData
          ? null
          : error ?? (isBookingRoute ? bookingOptionsError : null),
      reload,
    }),
    [
      bookingOptionsError,
      client,
      data,
      error,
      isBookingRoute,
      isLoading,
      isManagerRoute,
      reload,
      shouldLoadPublicData,
    ],
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
