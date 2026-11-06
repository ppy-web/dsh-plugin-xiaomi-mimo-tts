import type { Agent } from '@deepseek-ai/dsh-agent'
import type { TtsProvider } from './types/providers.js'

export { TtsProviderError } from './host/provider-error.js'

export type SpeechProviderId = TtsProvider | `external:${string}`

export interface ExternalSpeechSelection {
  model: string
  voice: string
  speechInstruction?: string
}

export interface ExternalSpeechModel {
  id: string
  name: string
  voices: { id: string; name: string }[]
  streaming?: boolean
  speechInstruction?: boolean
  /** If present, instructions are restricted to these values (for example emotions). */
  instructions?: { id: string; name: string }[]
  audioTags?: { value: string; name: string }[]
}

export interface ExternalSpeechProviderSnapshot {
  name: string
  ready: boolean
  unavailableReason?: string
  formats: ('wav' | 'mp3')[]
  maxTextLength: number
  modelName?: string
  voiceName?: string
  models?: ExternalSpeechModel[]
  selection?: ExternalSpeechSelection
  configurable?: boolean
  managementPath?: string
  /** Package whose settings are opened through the DSH plugin manager. */
  managementBundle?: string
  configurationId?: string
}

/** Host-only adapter. Registration owns the external takeover until disposed. */
export interface ExternalSpeechProvider {
  apiVersion: 1
  id: `external:${string}`
  getSnapshot(): ExternalSpeechProviderSnapshot
  subscribe(listener: () => void): () => void
  synthesize(request: { text: string; format: 'wav' | 'mp3'; signal: AbortSignal } & Partial<ExternalSpeechSelection>): Promise<{ data: Uint8Array; format: 'wav' | 'mp3' }>
  /** Raw 24 kHz mono signed little-endian PCM16, without a WAV header. */
  streamPcm?(request: { text: string; signal: AbortSignal } & Partial<ExternalSpeechSelection>): AsyncIterable<Uint8Array>
  /** Persist the selection in the adapter, then notify subscribers. */
  configure?(selection: ExternalSpeechSelection, options: { signal: AbortSignal }): Promise<void>
}

export interface SpeechEngineState {
  provider: SpeechProviderId
  revision: number
  name: string
  ready: boolean
  unavailableReason?: string
  formats: ('wav' | 'mp3')[]
  maxTextLength: number
  streaming: boolean
  modelName?: string
  voiceName?: string
  models?: ExternalSpeechModel[]
  selection?: ExternalSpeechSelection
  configurable?: boolean
  managementPath?: string
  managementBundle?: string
  configurationId?: string
}

export type SpeechFormat = 'mp3' | 'wav' | 'silk'

export interface SpeechModelCapabilities {
  id: string
  voices: { id: string; name: string }[]
  customVoice: boolean
  voiceDesign: boolean
  speechInstruction: boolean
  audioTags: boolean
  voiceRate: boolean
  streaming: boolean
  duplex: boolean
}

export interface SpeechProviderCapabilities {
  id: SpeechProviderId
  configured: boolean
  /** Local validation only; does not probe upstream credentials or quota. */
  ready: boolean
  unavailableReason?: string
  selectedModel: string
  selectedVoice: string
  maxTextLength: number
  models: SpeechModelCapabilities[]
}

export interface SpeechCapabilities {
  engine?: SpeechEngineState
  provider: SpeechProviderId
  formats: SpeechFormat[]
  providers: SpeechProviderCapabilities[]
}

/** A Web-entry download URL. Resolve relative to the export response URL. */
export interface SpeechDownload {
  audioId: string
  url: string
  expiresAt: string
  size: number
  format: SpeechFormat
  contentType: string
  durationMs?: number
}

/** A complete audio request. Credentials are always resolved by the Host. */
export interface SpeechRequest {
  text: string
  provider?: SpeechProviderId
  /** Browser requests pin the effective engine to avoid dispatching stale work. */
  engineRevision?: number
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
  provider: SpeechProviderId
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
  registerProvider(provider: ExternalSpeechProvider): () => void
  engineState(): SpeechEngineState
  subscribeEngine(listener: () => void): () => void
  configureProvider(request: { provider: SpeechProviderId; engineRevision: number; selection: ExternalSpeechSelection; signal?: AbortSignal }): Promise<SpeechEngineState>
  resolveProvider(request: Pick<SpeechRequest, 'provider' | 'engineRevision'>): SpeechProviderId
  /** External PCM providers only; the Web entry wraps bytes in its existing SSE protocol. */
  streamPcm(request: SpeechRequest, consume: (bytes: Uint8Array) => void | Promise<void>): Promise<void>
  /** Inspect saved provider configuration and supported features without synthesizing. */
  capabilities(): SpeechCapabilities
  /** Effective provider, with external takeover taking precedence over saved built-in settings. */
  currentProvider?(): SpeechProviderId
  /** Whether the saved provider and model accept inline audio tags. */
  supportsAudioTags?(): boolean
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
    /** A speech attempt failed; the code and owner identify the affected conversation without exposing upstream secrets. */
    'speech/failed'(payload: { agent: Agent; adapter: string; code: string; automatic: boolean }): void
  }
}
