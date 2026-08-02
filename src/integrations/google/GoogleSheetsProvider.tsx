/* eslint-disable react-refresh/only-export-components -- o provider e seu hook formam uma única API */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import type {
  AdminConfiguration,
  CancelReservationPeriodsRequest,
  ManagedReservation,
} from '../../types';
import {
  getAccessibleSpreadsheet,
  listLabReservaSpreadsheets,
  tagLabReservaSpreadsheet,
  type LabReservaSpreadsheet,
} from './googleDrive';
import { loadGoogleIdentityServices, requestGoogleSheetsAccessToken } from './googleIdentity';
import {
  GoogleSheetsIntegrationError,
  initializeEmptyGoogleSheetsWorkspace,
  readAdminConfigurationWithMetadataFromGoogleSheets,
  syncAdminConfigurationToGoogleSheets,
  type GoogleSheetsSyncResult,
} from './googleSheets';
import {
  clearPendingEmptySpreadsheetId,
  clearStoredSpreadsheetId,
  getKnownSpreadsheetIds,
  getSpreadsheetUrl,
  getStoredSpreadsheetId,
  storeSpreadsheetId,
} from './googleStorage';
import {
  cancelGoogleReservationPeriods,
  GoogleReservationsIntegrationError,
  listGoogleReservations,
} from './googleReservations';

export type GoogleSheetsStatus =
  | 'idle'
  | 'loading-script'
  | 'authorizing'
  | 'discovering'
  | 'creating-spreadsheet'
  | 'selecting-spreadsheet'
  | 'authorized'
  | 'loading-configuration'
  | 'loading-reservations'
  | 'cancelling-reservation'
  | 'syncing'
  | 'error';

export interface GoogleAuthorizationOptions {
  createNewSchool?: boolean;
}

export interface GoogleSheetsContextValue {
  authorize: (options?: GoogleAuthorizationOptions) => Promise<void>;
  isAuthorized: boolean;
  status: GoogleSheetsStatus;
  loadLinkedConfiguration: () => Promise<AdminConfiguration | null>;
  syncConfiguration: (configuration: AdminConfiguration) => Promise<GoogleSheetsSyncResult>;
  listReservations: () => Promise<ManagedReservation[]>;
  cancelReservationPeriods: (
    request: CancelReservationPeriodsRequest,
  ) => Promise<ManagedReservation>;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  availableSpreadsheets: readonly LabReservaSpreadsheet[];
  selectSpreadsheet: (spreadsheetId: string) => void;
  startNewSchool: () => Promise<void>;
  error: string | null;
}

const GoogleSheetsContext = createContext<GoogleSheetsContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Não foi possível concluir a integração com o Google Sheets.';
}

export function GoogleSheetsProvider({ children }: PropsWithChildren) {
  const accessTokenRef = useRef<string | null>(null);
  const tokenExpirationTimerRef = useRef<number | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [status, setStatus] = useState<GoogleSheetsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(() => getStoredSpreadsheetId());
  const [availableSpreadsheets, setAvailableSpreadsheets] = useState<
    readonly LabReservaSpreadsheet[]
  >([]);

  const clearTokenExpirationTimer = useCallback(() => {
    if (tokenExpirationTimerRef.current !== null) {
      window.clearTimeout(tokenExpirationTimerRef.current);
      tokenExpirationTimerRef.current = null;
    }
  }, []);

  const forgetAccessToken = useCallback(() => {
    clearTokenExpirationTimer();
    accessTokenRef.current = null;
    setIsAuthorized(false);
    setAvailableSpreadsheets([]);
  }, [clearTokenExpirationTimer]);

  useEffect(
    () => () => {
      clearTokenExpirationTimer();
      accessTokenRef.current = null;
    },
    [clearTokenExpirationTimer],
  );

  const startNewSchool = useCallback(async () => {
    const accessToken = accessTokenRef.current;
    if (!accessToken) {
      const authorizationError = new GoogleSheetsIntegrationError(
        'AUTHORIZATION_REQUIRED',
        'Entre com o Google antes de configurar uma nova escola.',
      );
      setIsAuthorized(false);
      setError(authorizationError.message);
      setStatus('error');
      throw authorizationError;
    }

    setError(null);
    setIsAuthorized(false);
    setStatus('creating-spreadsheet');
    const previousSpreadsheetId = getStoredSpreadsheetId() ?? spreadsheetId;

    try {
      const result = await initializeEmptyGoogleSheetsWorkspace({
        accessToken,
        previousSpreadsheetId,
      });
      setSpreadsheetId(result.spreadsheetId);
      setAvailableSpreadsheets([]);
      setIsAuthorized(true);
      setStatus('authorized');
    } catch (creationError: unknown) {
      setSpreadsheetId(getStoredSpreadsheetId() ?? spreadsheetId);
      setIsAuthorized(false);
      setError(errorMessage(creationError));
      setStatus('error');
      throw creationError;
    }
  }, [spreadsheetId]);

  const selectSpreadsheet = useCallback(
    (selectedSpreadsheetId: string) => {
      const selectedSpreadsheet = availableSpreadsheets.find(
        (candidate) => candidate.id === selectedSpreadsheetId,
      );
      if (!selectedSpreadsheet) {
        setError('A planilha selecionada não está disponível nesta conta Google.');
        setStatus('error');
        return;
      }

      try {
        storeSpreadsheetId(selectedSpreadsheet.id);
        setSpreadsheetId(selectedSpreadsheet.id);
        setAvailableSpreadsheets([]);
        setIsAuthorized(true);
        setStatus('authorized');
        setError(null);
      } catch (storageError: unknown) {
        setIsAuthorized(false);
        setError(errorMessage(storageError));
        setStatus('error');
      }
    },
    [availableSpreadsheets],
  );

  const authorize = useCallback(
    async (options: GoogleAuthorizationOptions = {}) => {
      setError(null);
      setStatus('loading-script');

      try {
        await loadGoogleIdentityServices();
        setStatus('authorizing');
        const authorization = await requestGoogleSheetsAccessToken();

        clearTokenExpirationTimer();
        accessTokenRef.current = authorization.accessToken;
        setIsAuthorized(false);
        setStatus('discovering');

        tokenExpirationTimerRef.current = window.setTimeout(() => {
          accessTokenRef.current = null;
          tokenExpirationTimerRef.current = null;
          setIsAuthorized(false);
          setAvailableSpreadsheets([]);
          setStatus('idle');
        }, authorization.expiresInSeconds * 1000);

        if (options.createNewSchool) {
          await startNewSchool();
          return;
        }

        const locallyLinkedId = getStoredSpreadsheetId();
        if (locallyLinkedId) {
          const linkedSpreadsheet = await getAccessibleSpreadsheet(locallyLinkedId, {
            accessToken: authorization.accessToken,
          });
          if (linkedSpreadsheet) {
            await tagLabReservaSpreadsheet(linkedSpreadsheet.id, {
              accessToken: authorization.accessToken,
            });
            clearPendingEmptySpreadsheetId(linkedSpreadsheet.id);
            setSpreadsheetId(linkedSpreadsheet.id);
            setAvailableSpreadsheets([]);
            setIsAuthorized(true);
            setStatus('authorized');
            return;
          }

          clearStoredSpreadsheetId();
          clearPendingEmptySpreadsheetId(locallyLinkedId);
          setSpreadsheetId(null);
        }

        const knownSpreadsheetIds = getKnownSpreadsheetIds().filter(
          (knownId) => knownId !== locallyLinkedId,
        );
        const accessibleKnownSpreadsheets = (
          await Promise.all(
            knownSpreadsheetIds.map(async (knownId) => {
              const spreadsheet = await getAccessibleSpreadsheet(knownId, {
                accessToken: authorization.accessToken,
              });
              if (spreadsheet) {
                return tagLabReservaSpreadsheet(spreadsheet.id, {
                  accessToken: authorization.accessToken,
                });
              }
              return null;
            }),
          )
        ).filter((spreadsheet): spreadsheet is LabReservaSpreadsheet => spreadsheet !== null);
        const taggedSpreadsheets = await listLabReservaSpreadsheets({
          accessToken: authorization.accessToken,
        });
        const discoveredSpreadsheets = [
          ...new Map(
            [...accessibleKnownSpreadsheets, ...taggedSpreadsheets].map((spreadsheet) => [
              spreadsheet.id,
              spreadsheet,
            ]),
          ).values(),
        ].toSorted(
          (left, right) =>
            right.modifiedTime.localeCompare(left.modifiedTime) ||
            left.name.localeCompare(right.name),
        );
        if (discoveredSpreadsheets.length === 0) {
          await startNewSchool();
          return;
        }
        if (discoveredSpreadsheets.length === 1) {
          const [onlySpreadsheet] = discoveredSpreadsheets;
          if (onlySpreadsheet) {
            storeSpreadsheetId(onlySpreadsheet.id);
            setSpreadsheetId(onlySpreadsheet.id);
            setAvailableSpreadsheets([]);
            setIsAuthorized(true);
            setStatus('authorized');
            return;
          }
        }

        setAvailableSpreadsheets(discoveredSpreadsheets);
        setStatus('selecting-spreadsheet');
      } catch (authorizationError: unknown) {
        forgetAccessToken();
        setError(errorMessage(authorizationError));
        setStatus('error');
        throw authorizationError;
      }
    },
    [clearTokenExpirationTimer, forgetAccessToken, startNewSchool],
  );

  const syncConfiguration = useCallback(
    async (configuration: AdminConfiguration): Promise<GoogleSheetsSyncResult> => {
      const accessToken = accessTokenRef.current;
      if (!accessToken) {
        const authorizationError = new GoogleSheetsIntegrationError(
          'AUTHORIZATION_REQUIRED',
          'Entre com o Google antes de salvar as configurações na planilha.',
        );
        setError(authorizationError.message);
        setStatus('error');
        throw authorizationError;
      }

      setError(null);
      setStatus('syncing');

      try {
        const result = await syncAdminConfigurationToGoogleSheets(configuration, {
          accessToken,
          spreadsheetId,
        });
        setSpreadsheetId(result.spreadsheetId);
        setStatus('authorized');
        return result;
      } catch (syncError: unknown) {
        if (
          syncError instanceof GoogleSheetsIntegrationError &&
          syncError.code === 'AUTHORIZATION_REQUIRED'
        ) {
          forgetAccessToken();
        }
        setError(errorMessage(syncError));
        setStatus('error');
        throw syncError;
      }
    },
    [forgetAccessToken, spreadsheetId],
  );

  const loadLinkedConfiguration = useCallback(async (): Promise<AdminConfiguration | null> => {
    if (!spreadsheetId) {
      return null;
    }

    const accessToken = accessTokenRef.current;
    if (!accessToken) {
      const authorizationError = new GoogleSheetsIntegrationError(
        'AUTHORIZATION_REQUIRED',
        'Entre com o Google antes de carregar as configurações da escola.',
      );
      setError(authorizationError.message);
      setStatus('error');
      throw authorizationError;
    }

    setError(null);
    setStatus('loading-configuration');
    try {
      const result = await readAdminConfigurationWithMetadataFromGoogleSheets(
        accessToken,
        spreadsheetId,
      );
      if (result.configuration && result.migrationRequired) {
        await syncAdminConfigurationToGoogleSheets(result.configuration, {
          accessToken,
          spreadsheetId,
        });
      }
      setStatus('authorized');
      return result.configuration;
    } catch (loadError: unknown) {
      if (
        loadError instanceof GoogleSheetsIntegrationError &&
        loadError.code === 'AUTHORIZATION_REQUIRED'
      ) {
        forgetAccessToken();
      }
      setError(errorMessage(loadError));
      setStatus('error');
      throw loadError;
    }
  }, [forgetAccessToken, spreadsheetId]);

  const listReservations = useCallback(async (): Promise<ManagedReservation[]> => {
    if (!spreadsheetId) {
      const linkError = new GoogleReservationsIntegrationError(
        'LINK_UNAVAILABLE',
        'Selecione a planilha da escola antes de acessar os agendamentos.',
      );
      setError(linkError.message);
      setStatus('error');
      throw linkError;
    }

    const accessToken = accessTokenRef.current;
    if (!accessToken) {
      const authorizationError = new GoogleReservationsIntegrationError(
        'AUTHORIZATION_REQUIRED',
        'Entre com o Google antes de acessar os agendamentos.',
      );
      setError(authorizationError.message);
      setStatus('error');
      throw authorizationError;
    }

    setError(null);
    setStatus('loading-reservations');
    try {
      const reservations = await listGoogleReservations({ accessToken, spreadsheetId });
      setStatus('authorized');
      return reservations;
    } catch (reservationError: unknown) {
      if (
        reservationError instanceof GoogleReservationsIntegrationError &&
        reservationError.code === 'AUTHORIZATION_REQUIRED'
      ) {
        forgetAccessToken();
      }
      setError(errorMessage(reservationError));
      setStatus('error');
      throw reservationError;
    }
  }, [forgetAccessToken, spreadsheetId]);

  const cancelReservationPeriods = useCallback(
    async (request: CancelReservationPeriodsRequest): Promise<ManagedReservation> => {
      if (!spreadsheetId) {
        const linkError = new GoogleReservationsIntegrationError(
          'LINK_UNAVAILABLE',
          'Selecione a planilha da escola antes de alterar os agendamentos.',
        );
        setError(linkError.message);
        setStatus('error');
        throw linkError;
      }

      const accessToken = accessTokenRef.current;
      if (!accessToken) {
        const authorizationError = new GoogleReservationsIntegrationError(
          'AUTHORIZATION_REQUIRED',
          'Entre com o Google antes de alterar os agendamentos.',
        );
        setError(authorizationError.message);
        setStatus('error');
        throw authorizationError;
      }

      setError(null);
      setStatus('cancelling-reservation');
      try {
        const result = await cancelGoogleReservationPeriods(request, {
          accessToken,
          spreadsheetId,
        });
        setStatus('authorized');
        return result.reservation;
      } catch (reservationError: unknown) {
        if (
          reservationError instanceof GoogleReservationsIntegrationError &&
          reservationError.code === 'AUTHORIZATION_REQUIRED'
        ) {
          forgetAccessToken();
        }
        setError(errorMessage(reservationError));
        setStatus('error');
        throw reservationError;
      }
    },
    [forgetAccessToken, spreadsheetId],
  );

  const value = useMemo<GoogleSheetsContextValue>(
    () => ({
      authorize,
      isAuthorized,
      status,
      loadLinkedConfiguration,
      syncConfiguration,
      listReservations,
      cancelReservationPeriods,
      spreadsheetId,
      spreadsheetUrl: getSpreadsheetUrl(spreadsheetId),
      availableSpreadsheets,
      selectSpreadsheet,
      startNewSchool,
      error,
    }),
    [
      authorize,
      availableSpreadsheets,
      error,
      isAuthorized,
      cancelReservationPeriods,
      loadLinkedConfiguration,
      listReservations,
      selectSpreadsheet,
      spreadsheetId,
      startNewSchool,
      status,
      syncConfiguration,
    ],
  );

  return <GoogleSheetsContext.Provider value={value}>{children}</GoogleSheetsContext.Provider>;
}

export function useGoogleSheets(): GoogleSheetsContextValue {
  const context = useContext(GoogleSheetsContext);
  if (!context) {
    throw new Error('useGoogleSheets deve ser usado dentro de GoogleSheetsProvider.');
  }
  return context;
}
