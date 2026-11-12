import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SpeechEngineState } from '../../src/host-api.js'
import { resolveTtsSettings } from '../../src/shared.js'
import type { TtsSettings } from '../../src/shared.js'
import { engineStateStore } from '../../src/client/engine-state.js'

function externalFixture(mode: string): SpeechEngineState {
  const adapter = mode === 'adapter'
  return {
    provider: 'external:demo-tone', revision: 1,
    name: adapter ? 'SenseAudio · 预览演示' : '外部测试音（非语音）', ready: mode !== 'unready',
    formats: ['wav'], maxTextLength: 1000, streaming: mode === 'pcm',
    ...(adapter ? { configurable: true, configurationId: 'senseaudio', configurationSwitchable: true,
      configurations: [{ id: 'senseaudio', name: 'SenseAudio · 预览演示' }, { id: 'backup', name: '备用供应商 · 预览演示' }],
      selection: { model: 'sensenova-tts-2.0', voice: 'female_0033_b', speechInstruction: '' },
      models: ['sensenova-tts-2.0', 'senseaudio-tts-1.5-260319'].map(id => ({ id, name: id, streaming: false, speechInstruction: false,
        voices: [{ id: 'female_0033_b', name: '女声 · 预览演示' }, { id: 'male_0004_a', name: '男声 · 预览演示' }], audioTags: [{ value: '<break time=500>', name: 'Pause' }] })) } : {}),
  }
}

/** Simulate a registered adapter without changing real DSH configuration. */
export class PreviewExternalTakeover {
  private readonly listeners = new Set<() => void>()
  private readonly offSettings: () => void
  private enabled: boolean
  private external: SpeechEngineState

  constructor(private readonly scope: ConfigForm<TtsSettings>, mode: string | null) {
    this.enabled = Boolean(mode)
    this.external = externalFixture(mode || 'adapter')
    const settings = resolveTtsSettings(scope.getSnapshot().value)
    engineStateStore.accept(this.enabled && settings.acceptExternalProviders ? this.external : this.builtin(1))
    this.offSettings = scope.subscribe(this.sync)
  }

  getSnapshot = (): boolean => this.enabled
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  set = (enabled: boolean): void => {
    if (this.enabled === enabled) return
    this.enabled = enabled
    this.sync()
    for (const listener of this.listeners) listener()
  }
  dispose(): void { this.offSettings(); this.listeners.clear() }

  private builtin(revision: number): SpeechEngineState {
    const settings = resolveTtsSettings(this.scope.getSnapshot().value)
    return { provider: settings.provider, name: settings.provider, revision,
      ready: true, formats: ['mp3', 'wav'], maxTextLength: settings.maxTextLength, streaming: true }
  }

  private sync = (): void => {
    const current = engineStateStore.getSnapshot().engine
    if (!current) return
    const isExternal = current.provider.startsWith('external:')
    if (isExternal) this.external = current
    const accepted = resolveTtsSettings(this.scope.getSnapshot().value).acceptExternalProviders
    if (this.enabled && accepted && !isExternal) engineStateStore.accept({ ...this.external, revision: current.revision + 1 })
    else if ((!this.enabled || !accepted) && isExternal) engineStateStore.accept(this.builtin(current.revision + 1))
  }
}
