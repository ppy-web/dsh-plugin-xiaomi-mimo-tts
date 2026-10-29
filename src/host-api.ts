import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TtsProvider } from './types/providers.js'

export type SpeechFormat = 'mp3' | 'wav' | 'silk'

/** A complete audio request. Credentials are always resolved by the Host. */
export interface SpeechRequest {
  text: string
  provider?: TtsProvider
  model?: string
  voice?: string
  voiceDesignPrompt?: string
  speechInstruction?: string
  voiceRate?: number
  format?: SpeechFormat
  /** Optional integration policy, checked before exporting or delivering audio. */
  maxDurationMs?: number
  /** Deliver all text in sequential requests when it exceeds the synthesis request limit. */
  splitLongText?: boolean
  signal?: AbortSignal
}

export interface SpeechAudio {
  data: Buffer
  text: string
  provider: TtsProvider
  format: SpeechFormat
  contentType: string
  durationMs?: number
}

export interface SpeechArtifact {
  path: string
  size: number
  format: SpeechFormat
  contentType: string
  durationMs?: number
  /** Delete only this artifact. Idempotent. */
  remove(): Promise<void>
}

export interface SpeechDeliveryContext {
  agent: Agent
  signal: AbortSignal
  automatic?: boolean
}

export interface SpeechDeliveryResult {
  adapter: string
  path?: string
  messageId?: string
  target?: string
}

/** Transport plugins own routing, permissions and temporary-file cleanup. */
export interface SpeechDeliveryAdapter {
  id: string
  format: SpeechFormat
  /** Check transport prerequisites before spending a synthesis request. */
  check?(context: SpeechDeliveryContext): void | Promise<void>
  send(audio: SpeechAudio, context: SpeechDeliveryContext): Promise<SpeechDeliveryResult>
}

export interface SpeechSynthesisService {
  synthesize(request: SpeechRequest): Promise<SpeechAudio>
  /** Export to the managed audio directory; files expire after 24 hours. */
  exportAudio(request: SpeechRequest): Promise<SpeechArtifact>
  registerDelivery(adapter: SpeechDeliveryAdapter): () => void
  hasDelivery(id: string): boolean
  /** Disabling cancels pending jobs for this adapter without changing session modes. */
  setDeliveryEnabled(id: string, enabled: boolean): void
  isAutomaticDeliveryEnabled(id: string): boolean
  /** Disabling automatic delivery cancels automatic jobs and preserves explicit requests. */
  setAutomaticDeliveryEnabled(id: string, enabled: boolean): void
  deliver(request: SpeechRequest, adapter: string, context: SpeechDeliveryContext): Promise<SpeechDeliveryResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    speechSynthesis: SpeechSynthesisService
  }
  interface Events {
    /** Audio was delivered or exported; file consumers may surface the returned path. */
    'speech/delivered'(payload: { agent: Agent; result: SpeechDeliveryResult; automatic: boolean }): void
  }
}
