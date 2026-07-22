import { describe, expect, it } from 'vitest';

import { createBackendClient } from './backend';
import { MockBackend } from './mockBackend';

describe('createBackendClient', () => {
  it('seleciona o MockBackend durante a Fase 1', () => {
    expect(createBackendClient()).toBeInstanceOf(MockBackend);
  });
});
