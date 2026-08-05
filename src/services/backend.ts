import type { BackendClient } from '../types';
import { AppsScriptBackend, UnconfiguredBackend } from './appsScriptBackend';

export interface BackendClientOptions {
  appsScriptUrl?: string;
}

export function createBackendClient(options: BackendClientOptions = {}): BackendClient {
  const endpoint = options.appsScriptUrl ?? import.meta.env.VITE_GOOGLE_APPS_SCRIPT_URL;
  if (endpoint?.trim()) {
    return new AppsScriptBackend(endpoint);
  }

  if (typeof window !== 'undefined' && window.location.hash.includes('gerenciar')) {
    return new UnconfiguredBackend();
  }

  return new UnconfiguredBackend();
}

export const backendClient = createBackendClient();
