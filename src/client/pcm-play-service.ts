import { Service } from '@deepseek-ai/cordis'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { XiaomiMimoTtsService } from '../client-api.js'
import { prepareTtsText, resolveTtsSettings } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import { streamPcmAudio } from '../pcm-stream.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'

export class XiaomiMimoTtsPcmService extends Service implements XiaomiMimoTtsService {
  private readonly audio = new PcmAudioQueue({
    onBusyChange: () => {},
    onPlaybackStart: () => {},
  })
  private request: AbortController | null = null
  private generation = 0
  private disposed = false

  constructor(
    ctx: ClientContext,
    private readonly settings: SettingsScope<TtsSettings>,
    private readonly interruptConversationPlayback: () => void,
  ) {
    super(ctx, 'xiaomiMimoTts')
  }

  play(text: string): void {
    try {
      if (this.disposed || typeof text !== 'string') return
      const snapshot = this.settings.getSnapshot()
      if (snapshot.status !== 'ready' || snapshot.value?.enabled !== true) return
      const normalized = prepareTtsText(text).trim()
      if (normalized.length === 0) return

      const settings = resolveTtsSettings(snapshot.value)
      this.stop()
      this.interruptConversationPlayback()
      this.audio.setMaxPausedPcmBytes(settings.maxPausedPcmBytes)

      const generation = this.generation
      const controller = new AbortController()
      this.request = controller
      void streamPcmAudio(normalized, controller.signal, async (pcm) => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) return
        await this.audio.enqueue(pcm)
      }).catch((error: unknown) => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) return
        this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback failed: ${error instanceof Error ? error.message : String(error)}`)
        this.audio.stop()
      }).finally(() => {
        if (this.request === controller) this.request = null
      })
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not start: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  stop(): void {
    try {
      this.generation += 1
      this.request?.abort()
      this.request = null
      this.audio.stop()
    } catch (error) {
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not stop cleanly: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    await this.audio.dispose()
  }
}
