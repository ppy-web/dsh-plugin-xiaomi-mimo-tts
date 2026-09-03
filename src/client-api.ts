import type {} from '@deepseek-ai/cordis'

/** Optional browser-side PCM playback capability exposed to other DSH plugins. */
export interface XiaomiMimoTtsService {
  /** Best-effort PCM playback. Returns immediately and never throws to the caller. */
  play(text: string): void

  /** Idempotently stop PCM playback started through this service. */
  stop(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    xiaomiMimoTts: XiaomiMimoTtsService
  }
}
