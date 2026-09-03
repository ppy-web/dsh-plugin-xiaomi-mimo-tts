import { Service } from '@deepseek-ai/cordis'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { XiaomiMimoTtsService } from '../client-api.js'
import { prepareTtsText, resolveTtsSettings } from '../shared.js'
import type { TtsSettings } from '../shared.js'
import { streamPcmAudio } from '../pcm-stream.js'
import { PcmAudioQueue } from './pcm-audio-queue.js'

export class XiaomiMimoTtsPcmService extends Service implements XiaomiMimoTtsService {
  private readonly logPrefix = '[MiMoTTS Service]'
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
    console.info(this.logPrefix, '[初始化] xiaomiMimoTts 服务已注册')
  }

  play(text: string): void {
    try {
      console.info(this.logPrefix, '[入口] play() 被调用', { disposed: this.disposed, textType: typeof text, text })
      if (this.disposed || typeof text !== 'string') {
        console.warn(this.logPrefix, '[判定] 已跳过：服务已销毁或 text 不是字符串')
        return
      }
      const snapshot = this.settings.getSnapshot()
      console.info(this.logPrefix, '[判定] TTS 设置快照', { status: snapshot.status, enabled: snapshot.value?.enabled === true })
      if (snapshot.status !== 'ready') {
        console.warn(this.logPrefix, '[判定] 已跳过：设置尚未 ready', { status: snapshot.status })
        return
      }
      if (snapshot.value?.enabled !== true) {
        console.warn(this.logPrefix, '[判定] 已跳过：MiMo TTS 主开关关闭')
        return
      }
      const normalized = prepareTtsText(text).trim()
      console.info(this.logPrefix, '[文本] 文本清洗完成', { inputLength: text.length, outputLength: normalized.length, normalized })
      if (normalized.length === 0) {
        console.warn(this.logPrefix, '[文本] 已跳过：清洗后文本为空')
        return
      }

      const settings = resolveTtsSettings(snapshot.value)
      console.info(this.logPrefix, '[准备] 即将停止旧播放并启动新流', { maxPausedPcmBytes: settings.maxPausedPcmBytes })
      this.stop()
      this.interruptConversationPlayback()
      console.info(this.logPrefix, '[准备] 已请求中断会话朗读')
      this.audio.setMaxPausedPcmBytes(settings.maxPausedPcmBytes)

      const generation = this.generation
      const controller = new AbortController()
      this.request = controller
      let chunkCount = 0
      void streamPcmAudio(normalized, controller.signal, async (pcm) => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) {
          console.warn(this.logPrefix, '[流] 已忽略过期 PCM 块', { disposed: this.disposed, aborted: controller.signal.aborted, generation, currentGeneration: this.generation })
          return
        }
        chunkCount += 1
        console.info(this.logPrefix, `[流] 向音频队列提交 PCM 块 #${chunkCount}`, { base64Chars: pcm.length })
        await this.audio.enqueue(pcm)
      }).catch((error: unknown) => {
        if (this.disposed || controller.signal.aborted || generation !== this.generation) return
        console.error(this.logPrefix, '[失败] 可选流式播放失败', error)
        this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback failed: ${error instanceof Error ? error.message : String(error)}`)
        this.audio.stop()
      }).finally(() => {
        console.info(this.logPrefix, '[完成] play() 异步链结束', { aborted: controller.signal.aborted, chunkCount, generation, currentGeneration: this.generation })
        if (this.request === controller) this.request = null
      })
    } catch (error) {
      console.error(this.logPrefix, '[失败] play() 无法启动', error)
      this.ctx.logger.warn(`xiaomi-mimo-tts: optional PCM playback could not start: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  stop(): void {
    try {
      console.info(this.logPrefix, '[停止] stop() 被调用', { hadRequest: this.request !== null, generation: this.generation })
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
    console.info(this.logPrefix, '[销毁] 服务开始清理')
    this.disposed = true
    this.stop()
    await this.audio.dispose()
    console.info(this.logPrefix, '[销毁] 服务清理完成')
  }
}
