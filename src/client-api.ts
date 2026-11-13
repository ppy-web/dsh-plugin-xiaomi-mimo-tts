import type {} from '@deepseek-ai/cordis'

/** Optional browser-side speech playback capability exposed to other DSH plugins. */
export interface XiaomiMimoTtsService {
  /** Best-effort playback using the selected provider and model. Returns immediately and never throws to the caller. */
  play(text: string): void

  /** Idempotently stop playback started through this service. */
  stop(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    xiaomiMimoTts: XiaomiMimoTtsService
  }
}
