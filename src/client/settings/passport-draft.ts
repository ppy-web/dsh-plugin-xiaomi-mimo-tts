import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_PASSPORT_SETTINGS, PASSPORT_NUMBER_FIELDS, isPassportAccessToken } from '../../types/passport.js'
import type { PassportSettings, PassportNumberField, PassportPreset } from '../../types/passport.js'

/** Reject the incomplete range so every four-digit code is equally likely. */
export function generatePassportPairingCode(): string {
  const sample = new Uint16Array(1)
  do { crypto.getRandomValues(sample) } while (sample[0]! >= 60_000)
  return String(sample[0]! % 10_000).padStart(4, '0')
}

export function validatePassportDraft(value: PassportSettings, tokenConfigured = false): keyof PassportSettings | null {
  if (!['host', 'xiaomi', 'doubao'].includes(value.asrProvider)) return 'asrProvider'
  if (!value.host.trim() || /[\s/]/u.test(value.host)) return 'host'
  if (!(tokenConfigured && value.accessToken === '') && !isPassportAccessToken(value.accessToken)) return 'accessToken'
  if (value.deviceId && !/^[a-zA-Z0-9_.:-]{1,128}$/u.test(value.deviceId)) return 'deviceId'
  if (typeof value.sessionRevision !== 'string' || value.sessionRevision.length > 128) return 'sessionRevision'
  for (const field of Object.keys(PASSPORT_NUMBER_FIELDS) as PassportNumberField[]) {
    const { min, max } = PASSPORT_NUMBER_FIELDS[field]
    if (!Number.isFinite(value[field]) || value[field] < min || value[field] > max) return field
  }
  return Number.isInteger(value.port) ? null : 'port'
}

/** Write only this component's edited fields, fenced by the revision read by the editor. */
export async function savePassportDraft(scope: ConfigForm<PassportSettings>, base: PassportSettings, value: PassportSettings, revision: number, tokenConfigured = false): Promise<void> {
  if (validatePassportDraft(value, tokenConfigured)) throw new Error('passport-draft-invalid')
  const snapshot = scope.getSnapshot()
  if (snapshot.status !== 'ready' || !snapshot.writable || snapshot.revision !== revision) throw new Error('passport-settings-conflict')
  const ops: Parameters<typeof scope.mutate>[0][number][] = []
  for (const field of Object.keys(DEFAULT_PASSPORT_SETTINGS) as Array<keyof PassportSettings>) {
    if (field === 'accessToken' && value.accessToken === '' && tokenConfigured) continue
    if (value[field] !== base[field]) ops.push({ op: 'set', path: [field], value: value[field] })
  }
  if (ops.length && !await scope.mutate(ops, revision)) throw new Error('passport-settings-save-failed')
}

/** An explicit, revision-fenced request; unrelated settings saves never rotate a session. */
export async function refreshPassportSession(scope: ConfigForm<PassportSettings>, base: PassportSettings, value: PassportSettings,
  revision: number, presets: readonly PassportPreset[], tokenConfigured = false): Promise<void> {
  if (value.agentPreset && !presets.some(item => item.id === value.agentPreset && !item.unavailable)) throw new Error('passport-preset-unavailable')
  // getRandomValues also works on LAN HTTP pages where randomUUID is unavailable.
  const sessionRevision = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  await savePassportDraft(scope, base, { ...value, sessionRevision }, revision, tokenConfigured)
}
