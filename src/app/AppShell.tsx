import type { PropsWithChildren } from 'react';
import styles from './AppShell.module.css';

export function AppShell({ children }: PropsWithChildren) {
  function skipToContent() {
    document.getElementById('main-content')?.focus();
  }

  return (
    <div className={styles.shell}>
      <button className="skipLink" type="button" onClick={skipToContent}>
        Pular para o conteúdo
      </button>
      <main id="main-content" className={styles.main} tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
