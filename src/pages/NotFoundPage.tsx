import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components';
import styles from './Pages.module.css';

export function NotFoundPage() {
  return (
    <div className={styles.emptyPage}>
      <EmptyState
        icon={<Compass size={38} />}
        title={
          <>
            <span className={styles.notFoundCode}>404</span>
            <br /> Página não encontrada
          </>
        }
        description="O endereço pode ter mudado ou não pertence a este sistema."
        action={
          <Link className={styles.textLink} to="/">
            Voltar ao início
          </Link>
        }
      />
    </div>
  );
}
