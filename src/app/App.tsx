import type { BackendClient } from '../types';
import { GoogleSheetsProvider } from '../integrations/google/GoogleSheetsProvider';
import { AppShell } from './AppShell';
import { BootstrapProvider } from './BootstrapContext';
import { RouteFocus } from './RouteFocus';
import { AppRoutes } from './routes';

export interface AppProps {
  client?: BackendClient;
}

export function App({ client }: AppProps) {
  return (
    <GoogleSheetsProvider>
      <BootstrapProvider {...(client ? { client } : {})}>
        <RouteFocus />
        <AppShell>
          <AppRoutes />
        </AppShell>
      </BootstrapProvider>
    </GoogleSheetsProvider>
  );
}
