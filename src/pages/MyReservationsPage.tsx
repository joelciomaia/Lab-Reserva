import { ClipboardList, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, ErrorMessage, Loading, PageHeader } from '../components';
import { useBootstrap } from '../app/BootstrapContext';
import { ReservationCard } from '../features/reservations/ReservationCard';
import type { AppError, Reservation } from '../types';
import { getFriendlyError } from '../types';
import styles from './Pages.module.css';

export function MyReservationsPage() {
  const {
    data,
    client,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    reload,
  } = useBootstrap();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requestVersion, setRequestVersion] = useState(0);
  const userId = data?.currentUser?.id;

  function retry() {
    setIsLoading(true);
    setError(null);
    setRequestVersion((value) => value + 1);
  }

  useEffect(() => {
    if (!userId) {
      return;
    }

    let isCurrentRequest = true;
    void client
      .getMyReservations(userId)
      .then((response) => {
        if (isCurrentRequest) {
          setReservations(response);
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
  }, [client, requestVersion, userId]);

  if (isBootstrapLoading && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Minhas reservas" description="Carregando seu perfil…" />
        <Loading label="Preparando suas reservas" />
      </div>
    );
  }

  if (bootstrapError && !data) {
    return (
      <div className={styles.page}>
        <PageHeader title="Minhas reservas" />
        <ErrorMessage action={<Button onClick={reload}>Tentar novamente</Button>}>
          {bootstrapError.message}
        </ErrorMessage>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Seu planejamento"
        title="Minhas reservas"
        description="Acompanhe os próximos usos de laboratórios e materiais vinculados ao seu perfil."
        actions={
          <Link className={styles.textLink} to="/reservar">
            <Plus size={18} aria-hidden="true" /> Nova reserva
          </Link>
        }
      />

      {!userId && data ? (
        <EmptyState
          icon={<ClipboardList size={34} />}
          title="Identificação necessária"
          description="Identifique-se como professor para consultar as reservas vinculadas ao seu perfil."
          action={
            <Link className={styles.textLink} to="/reservar">
              Iniciar identificação
            </Link>
          }
        />
      ) : null}

      {userId && isLoading ? <Loading label="Buscando suas reservas" /> : null}
      {error ? (
        <ErrorMessage action={<Button onClick={retry}>Tentar novamente</Button>}>
          {error.message}
        </ErrorMessage>
      ) : null}

      {userId && !isLoading && !error && reservations.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={34} />}
          title="Nenhuma reserva por aqui"
          description="Quando você reservar um laboratório, os detalhes aparecerão nesta página."
          action={
            <Link className={styles.textLink} to="/reservar">
              Fazer minha primeira reserva
            </Link>
          }
        />
      ) : null}

      {userId && !isLoading && !error && reservations.length > 0 ? (
        <section className={styles.section} aria-label="Lista de reservas">
          {reservations.map((reservation) => (
            <ReservationCard key={reservation.id} reservation={reservation} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
