import type { BackendClient } from '../types';
import { AppShell } from './AppShell';
import { BootstrapProvider } from './BootstrapContext';
import { RouteFocus } from './RouteFocus';
import { AppRoutes } from './routes';

export interface AppProps {
  client?: BackendClient;
}

export function App({ client }: AppProps) {
  return (
    <BootstrapProvider {...(client ? { client } : {})}>
      <RouteFocus />
      <AppShell>
        <AppRoutes />
      </AppShell>
    </BootstrapProvider>
  );
}
