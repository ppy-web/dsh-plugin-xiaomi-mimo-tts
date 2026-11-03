import type { TtsProvider } from '../../types/providers.js'
import type { LocaleKey } from '../localization.js'

/** Display name of a speech provider, shared by every surface that names one. */
export function providerLabelKey(provider: TtsProvider): LocaleKey {
  if (provider === 'doubao') return 'settings.providerDoubao'
  if (provider === 'breeze') return 'settings.providerBreeze'
  return 'settings.providerXiaomi'
}
