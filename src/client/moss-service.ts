import { TTS_MOSS_PROBE_ROUTE, TTS_MOSS_SYNTH_ROUTE } from '../constants.js'
import type { MossVoice } from '../moss.js'
import { hostRoute } from './host-route.js'

export interface MossWarmupView {
  ready: boolean
  failed: boolean
  state: string
  progress: number
  message: string
}

export interface MossProbeSuccess {
  ok: true
  baseURL: string
  health: {
    status?: string
    device?: string
    cpuRuntimeLoaded?: boolean
    textNormalizationStatus?: string
  }
  warmup: MossWarmupView | null
  voices: MossVoice[]
}

export interface MossProbeFailure {
  ok: false
  error: string
  message: string
}

export type MossProbeView = MossProbeSuccess | MossProbeFailure

/** Thrown when the Host route rejects a MOSS request. */
export class MossRequestError extends Error {
  constructor(readonly code: string, message: string = code) {
    super(message)
  }
}

/** Ask the Host to probe a MOSS server; the Host owns network access and timeouts. */
export async function probeMossService(baseURL: string, signal?: AbortSignal): Promise<MossProbeView> {
  let response: Response
  try {
    response = await fetch(hostRoute(TTS_MOSS_PROBE_ROUTE), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseURL }),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new MossRequestError('moss-unreachable', 'Cannot reach the local MOSS service.')
  }
  const payload = await response.json().catch(() => undefined) as { error?: unknown; message?: unknown } | undefined
  if (!response.ok) {
    return {
      ok: false,
      error: typeof payload?.error === 'string' ? payload.error : 'moss-request-failed',
      message: typeof payload?.message === 'string' ? payload.message : '',
    }
  }
  return payload as MossProbeSuccess
}

export interface MossSpeechConfig {
  baseURL: string
  voice: string
}

/** Request one complete WAV utterance from the Host's MOSS route. */
export async function fetchMossAudio(text: string, config: MossSpeechConfig, signal: AbortSignal): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(hostRoute(TTS_MOSS_SYNTH_ROUTE), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, baseURL: config.baseURL, voice: config.voice, format: 'wav' }),
      signal,
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new MossRequestError('moss-unreachable', 'Cannot reach the local MOSS service.')
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { error?: unknown; message?: unknown } | undefined
    throw new MossRequestError(
      typeof payload?.error === 'string' ? payload.error : 'moss-request-failed',
      typeof payload?.message === 'string' ? payload.message : 'MOSS synthesis failed.',
    )
  }
  return response.blob()
}
