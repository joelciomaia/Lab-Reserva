import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, ErrorMessage } from '../components';
import { useGoogleSheets } from '../integrations/google/GoogleSheetsProvider';
import styles from './GoogleLoginPage.module.css';

const DEFAULT_MANAGER_PATH = '/gerenciar/geral';
const LOGIN_PATH = '/gerenciar/entrar';

interface LoginRouteState {
  from?:
    | string
    | {
        pathname?: unknown;
        search?: unknown;
        hash?: unknown;
      };
}

function getReturnPath(state: unknown): string {
  const from = (state as LoginRouteState | null)?.from;

  if (typeof from === 'string') {
    return from.startsWith('/') && from !== LOGIN_PATH ? from : DEFAULT_MANAGER_PATH;
  }

  if (from && typeof from.pathname === 'string' && from.pathname.startsWith('/')) {
    const search = typeof from.search === 'string' ? from.search : '';
    const hash = typeof from.hash === 'string' ? from.hash : '';
    const path = `${from.pathname}${search}${hash}`;
    return from.pathname === LOGIN_PATH ? DEFAULT_MANAGER_PATH : path;
  }

  return DEFAULT_MANAGER_PATH;
}

function getErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Não foi possível entrar com o Google. Tente novamente.';
}

export function GoogleLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    authorize,
    availableSpreadsheets,
    error,
    isAuthorized,
    selectSpreadsheet,
    spreadsheetId,
    startNewSchool,
    status,
  } = useGoogleSheets();
  const [requestError, setRequestError] = useState<unknown>(null);
  const returnPath = getReturnPath(location.state);
  const isAuthorizing = [
    'loading-script',
    'authorizing',
    'discovering',
    'creating-spreadsheet',
  ].includes(String(status));
  const isSelectingSpreadsheet = status === 'selecting-spreadsheet';
  const errorMessage = getErrorMessage(requestError ?? error);

  useEffect(() => {
    if (isAuthorized) {
      navigate(returnPath, { replace: true });
    }
  }, [isAuthorized, navigate, returnPath]);

  async function handleAuthorize() {
    setRequestError(null);
    try {
      await authorize();
    } catch (authorizationError: unknown) {
      setRequestError(authorizationError);
    }
  }

  async function handleNewSchool() {
    setRequestError(null);
    if (isSelectingSpreadsheet) {
      try {
        await startNewSchool();
      } catch (creationError: unknown) {
        setRequestError(creationError);
      }
      return;
    }
    try {
      await authorize({ createNewSchool: true });
    } catch (authorizationError: unknown) {
      setRequestError(authorizationError);
    }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="google-login-title">
        <p className={styles.eyebrow}>Área do laboratorista</p>
        <h1 id="google-login-title" tabIndex={-1}>
          Conectar ao Google
        </h1>
        <p className={styles.description}>
          {isSelectingSpreadsheet
            ? 'Encontramos mais de uma escola nesta conta. Escolha qual deseja configurar.'
            : 'Entre com uma conta Google para criar ou recuperar a planilha de configurações e agendamentos da escola.'}
        </p>

        {errorMessage ? <ErrorMessage>{errorMessage}</ErrorMessage> : null}

        {isSelectingSpreadsheet ? (
          <div className={styles.spreadsheetChoices} role="group" aria-label="Escolas encontradas">
            {availableSpreadsheets.map((spreadsheet) => (
              <Button
                key={spreadsheet.id}
                fullWidth
                variant="secondary"
                onClick={() => selectSpreadsheet(spreadsheet.id)}
              >
                {spreadsheet.name}
              </Button>
            ))}
            <Button fullWidth onClick={() => void handleNewSchool()}>
              Configurar uma nova escola
            </Button>
          </div>
        ) : (
          <>
            <Button
              className={styles.loginButton}
              fullWidth
              isLoading={isAuthorizing}
              loadingLabel="Conectando ao Google…"
              onClick={() => void handleAuthorize()}
            >
              Entrar com Google
            </Button>
            {spreadsheetId ? (
              <Button
                className={styles.newSchoolButton}
                fullWidth
                variant="secondary"
                disabled={isAuthorizing}
                onClick={() => void handleNewSchool()}
              >
                Configurar uma nova escola
              </Button>
            ) : null}
          </>
        )}

        <p className={styles.note}>
          O acesso fica limitado às planilhas criadas ou escolhidas no Reserva Fácil.
        </p>
      </section>
    </div>
  );
}
