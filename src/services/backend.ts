import type { BackendClient } from '../types';
import { AppsScriptBackend, UnconfiguredBackend } from './appsScriptBackend';

export interface BackendClientOptions {
  appsScriptUrl?: string;
}

export function createBackendClient(options: BackendClientOptions = {}): BackendClient {
  const endpoint = options.appsScriptUrl ?? import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  return endpoint?.trim() ? new AppsScriptBackend(endpoint) : new UnconfiguredBackend();
}

export const backendClient = createBackendClient();
