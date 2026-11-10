import { TTS_DESKTOP_WRITE_HEADER } from '../../constants.js'
import { PASSPORT_ASR_TEST_ROUTE } from '../../types/passport.js'
import type { PassportSettings } from '../../types/passport.js'
import type { LocaleKey, Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'

const ERROR_LABELS: Record<string, LocaleKey> = {
  'passport-asr-key-required': 'passport.asrErrorKey',
  'passport-asr-unavailable': 'passport.asrErrorUnavailable',
  'passport-asr-auth-failed': 'passport.asrErrorAuth',
  'passport-asr-permission-denied': 'passport.asrErrorPermission',
  'passport-asr-quota-exceeded': 'passport.asrErrorQuota',
  'passport-asr-rate-limited': 'passport.asrErrorRate',
  'passport-asr-timeout': 'passport.asrErrorTimeout',
  'passport-asr-network-failed': 'passport.asrErrorNetwork',
  'passport-asr-invalid-response': 'passport.asrErrorResponse',
  'passport-asr-input-overflow': 'passport.asrErrorInput',
  'passport-recognition-failed': 'passport.asrErrorRecognition',
  'passport-asr-test-invalid': 'passport.asrErrorRequest',
  'cross-origin-denied': 'passport.asrErrorOrigin',
}

export interface PassportAsrTestFailure { code: string; upstreamStatus?: number; upstreamCode?: number }

/** Only known public codes or HTTP status leave this boundary; provider prose is not displayed. */
export async function requestPassportAsrTest(source: PassportSettings['asrProvider'], signal: AbortSignal): Promise<PassportAsrTestFailure | null> {
  let response: Response
  try {
    response = await fetch(hostRoute(PASSPORT_ASR_TEST_ROUTE), { method: 'POST', credentials: 'same-origin', signal,
      headers: { 'content-type': 'application/json', [TTS_DESKTOP_WRITE_HEADER]: '1' }, body: JSON.stringify({ source }) })
  } catch (error) {
    if (signal.aborted) throw error
    return { code: 'passport-asr-network-failed' }
  }
  try {
    const body: unknown = await response.json()
    if (response.ok) return body && typeof body === 'object' && 'ok' in body && body.ok === true ? null : { code: 'passport-asr-invalid-response' }
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && Object.hasOwn(ERROR_LABELS, body.error)) {
      const details = body as { upstreamStatus?: unknown; upstreamCode?: unknown }
      return { code: body.error,
        ...(typeof details.upstreamStatus === 'number' && Number.isInteger(details.upstreamStatus) && details.upstreamStatus >= 100 && details.upstreamStatus <= 599 ? { upstreamStatus: details.upstreamStatus } : {}),
        ...(typeof details.upstreamCode === 'number' && Number.isSafeInteger(details.upstreamCode) && details.upstreamCode >= 0 && details.upstreamCode <= 0xffffffff ? { upstreamCode: details.upstreamCode } : {}) }
    }
  } catch { /* An unavailable or older Host may not return JSON. */ }
  if (response.ok) return { code: 'passport-asr-invalid-response' }
  return { code: `http-${response.status}` }
}

export function passportAsrTestError(error: PassportAsrTestFailure, t: Translate): string {
  const label = Object.hasOwn(ERROR_LABELS, error.code) ? ERROR_LABELS[error.code]! : 'passport.asrTestFailed'
  const details = [error.code, ...(error.upstreamStatus ? [`HTTP ${error.upstreamStatus}`] : []), ...(error.upstreamCode !== undefined ? [`${t('passport.asrUpstreamCode')} ${error.upstreamCode}`] : [])]
  return `${t(label)} (${details.join(' · ')})`
}
