// adapter.registry.ts
// Registry of all supported booking adapters.
// To add a new system: implement BookingAdapter and register it here.

import type { BookingAdapter } from './base.adapter'
import { LaietaAdapter } from './laieta.adapter'
import { AppError } from '../../../shared/errors/AppError'

// Adapters are registered lazily — import when needed to avoid loading Puppeteer unless used
const ADAPTER_FACTORIES: Record<string, () => BookingAdapter> = {
  'miclubonline': () => new LaietaAdapter(),
}

export const SUPPORTED_ADAPTERS = [
  { adapterType: 'miclubonline', label: 'MiClubOnline (Laieta)', clubs: ['laieta'] },
] as const

export function getAdapter(adapterType: string): BookingAdapter {
  const factory = ADAPTER_FACTORIES[adapterType]
  if (!factory) {
    throw new AppError(`Unsupported booking adapter: ${adapterType}`, 400, 'UNSUPPORTED_ADAPTER')
  }
  return factory()
}

export function registerAdapter(adapterType: string, factory: () => BookingAdapter): void {
  ADAPTER_FACTORIES[adapterType] = factory
}
