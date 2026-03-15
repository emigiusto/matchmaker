import { describe, it, expect, vi } from 'vitest';
import { AppError } from '../../../shared/errors/AppError';

// Mock LaietaAdapter to avoid Puppeteer import in test environment
vi.mock('./laieta.adapter', () => ({
  LaietaAdapter: class MockLaietaAdapter {
    type = 'laieta';
  },
}));

import { getAdapter, registerAdapter } from './adapter.registry';

describe('adapter.registry', () => {
  describe('getAdapter', () => {
    it('returns a LaietaAdapter instance for "miclubonline"', () => {
      const adapter = getAdapter('miclubonline');

      expect(adapter).toBeDefined();
      expect(adapter).toHaveProperty('type', 'laieta');
    });

    it('throws AppError for unknown adapter type', () => {
      expect(() => getAdapter('unknown-club')).toThrow(AppError);
      expect(() => getAdapter('unknown-club')).toThrow(/Unsupported booking adapter/);
    });

    it('throws AppError with UNSUPPORTED_ADAPTER code', () => {
      try {
        getAdapter('fakeAdapter');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).errorCode).toBe('UNSUPPORTED_ADAPTER');
      }
    });

    it('throws for empty string adapter type', () => {
      expect(() => getAdapter('')).toThrow(AppError);
    });
  });

  describe('registerAdapter', () => {
    it('allows registering and retrieving a custom adapter', () => {
      const fakeAdapter = { testConnection: vi.fn(), checkAvailability: vi.fn(), book: vi.fn(), cancel: vi.fn() };
      registerAdapter('custom-club', () => fakeAdapter as any);

      const adapter = getAdapter('custom-club');

      expect(adapter).toBe(fakeAdapter);
    });

    it('overwrites an existing adapter registration', () => {
      const adapterV1 = { testConnection: vi.fn(), checkAvailability: vi.fn(), book: vi.fn(), cancel: vi.fn() };
      const adapterV2 = { testConnection: vi.fn(), checkAvailability: vi.fn(), book: vi.fn(), cancel: vi.fn() };
      registerAdapter('overwrite-test', () => adapterV1 as any);
      registerAdapter('overwrite-test', () => adapterV2 as any);

      const adapter = getAdapter('overwrite-test');

      expect(adapter).toBe(adapterV2);
    });
  });
});
