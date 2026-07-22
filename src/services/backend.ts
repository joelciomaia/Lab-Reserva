import type { BackendClient } from '../types';
import { MockBackend } from './mockBackend';

export function createBackendClient(): BackendClient {
  return new MockBackend();
}

export const backendClient = createBackendClient();
