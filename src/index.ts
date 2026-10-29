import type { Context, Volatile } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import {
  TTS_SETTINGS_NAMESPACE,
  TTS_API_KEY_STATUS_ROUTE,
  TTS_MIMO_LOGO_ASSET_ROUTE,
  TTS_VOICE_DESIGN_ASSET_ROUTE,
  TTS_VOICE_ASSET_ROUTE,
  TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
  TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE,
  TTS_PROVIDER_CHARACTER_ASSET_ROUTES,
  TTS_PROVIDER_LOGO_ASSET_ROUTES,
  TTS_API_KEY_WHALE_ASSET_ROUTE,
  TTS_HISTORY_EMPTY_ASSET_ROUTE,
  TTS_QQ_GROUP_ASSET_ROUTE,
  TTS_TOGGLE_AUDIO_ASSET_ROUTE,
  TTS_TOGGLE_SOUND_FILES,
  TTS_VOLUME_PREVIEW_FILES,
} from './constants.js'
import {
  TTS_MODELS,
  TTS_LOCAL_SPEECH_MODES,
  TTS_FORMATS,
  TTS_VOICE_DESIGN_PLAYBACK_MODES,
  TTS_READ_SCOPES,
  TTS_VOICE_PRESETS,
  TTS_VOICE_DESIGN_PRESETS,
  SOUND_PACKS,
  DEFAULT_TTS_SETTINGS,
  ANNOUNCEMENT_SOURCES,
  isSupportedTtsApiKey,
} from './types/index.js'
import { registerStaticAsset, registerStaticAssetMap, json } from './host/index.js'
import { registerSynthesisRoutes } from './host/synthesis-routes.js'
import SpeechHost from './host/speech-service.js'
import { TTS_PROVIDERS, DOUBAO_TTS_MODELS, ttsApiKey } from './shared.js'

/** Cordis plugin identifier. */
export const name = 'xiaomi-mimo-tts'

/** Host services required by this plugin. */
export const inject = ['webServer']

/** Settings namespace registered with the DSH Host. */
export const XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE = TTS_SETTINGS_NAMESPACE

/** Validated Host settings schema. */
export const Config = z.object({
  qqbotEnabled: z.boolean().default(DEFAULT_TTS_SETTINGS.qqbotEnabled).volatile(),
  announcementSources: z.array(z.union(ANNOUNCEMENT_SOURCES)).default(DEFAULT_TTS_SETTINGS.announcementSources).volatile(),
  provider: z.union(TTS_PROVIDERS).default(DEFAULT_TTS_SETTINGS.provider).volatile(),
  doubaoApiKey: z.string().role('secret').default('').volatile(),
  doubaoModel: z.union(DOUBAO_TTS_MODELS).default(DEFAULT_TTS_SETTINGS.doubaoModel).volatile(),
  doubaoVoice: z.string().default(DEFAULT_TTS_SETTINGS.doubaoVoice).volatile(),
  doubaoClonedVoice: z.string().default('').volatile(),
  doubaoInstruction: z.string().default(DEFAULT_TTS_SETTINGS.doubaoInstruction).volatile(),
  enabled: z.boolean().default(DEFAULT_TTS_SETTINGS.enabled).volatile(),
  apiKey: z.string().role('secret').default(DEFAULT_TTS_SETTINGS.apiKey).volatile(),
  baseURL: z.string().pattern(/^https?:\/\/\S+$/iu).default(DEFAULT_TTS_SETTINGS.baseURL).volatile(),
  model: z.union(TTS_MODELS).default(DEFAULT_TTS_SETTINGS.model).volatile(),
  localSpeechMode: z.union(TTS_LOCAL_SPEECH_MODES).default(DEFAULT_TTS_SETTINGS.localSpeechMode).volatile(),
  localVoiceURI: z.string().default(DEFAULT_TTS_SETTINGS.localVoiceURI).volatile(),
  voice: z.string().default(DEFAULT_TTS_SETTINGS.voice).volatile(),
  voiceDesignPrompt: z.string().min(1).default(DEFAULT_TTS_SETTINGS.voiceDesignPrompt).volatile(),
  voiceDesignCustomPrompt: z.string().default(DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt).volatile(),
  presetStylePrompt: z.string().default(DEFAULT_TTS_SETTINGS.presetStylePrompt).volatile(),
  format: z.union(TTS_FORMATS).default(DEFAULT_TTS_SETTINGS.format).volatile(),
  voiceDesignPlaybackMode: z.union(TTS_VOICE_DESIGN_PLAYBACK_MODES).default(DEFAULT_TTS_SETTINGS.voiceDesignPlaybackMode).volatile(),
  readScope: z.union(TTS_READ_SCOPES).default(DEFAULT_TTS_SETTINGS.readScope).volatile(),
  autoPlay: z.boolean().default(DEFAULT_TTS_SETTINGS.autoPlay).volatile(),
  instruction: z.string().default(DEFAULT_TTS_SETTINGS.instruction).volatile(),
  maxTextLength: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxTextLength).volatile(),
  requestTimeoutMs: z.number().step(1).min(1000).default(DEFAULT_TTS_SETTINGS.requestTimeoutMs).volatile(),
  maxMp3AudioBytes: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxMp3AudioBytes).volatile(),
  maxWavAudioBytes: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxWavAudioBytes).volatile(),
  maxPausedPcmBytes: z.number().step(1).min(1).default(DEFAULT_TTS_SETTINGS.maxPausedPcmBytes).volatile(),
  voiceVolume: z.number().min(0).max(1).default(DEFAULT_TTS_SETTINGS.voiceVolume).volatile(),
  voiceRate: z.number().step(0.1).min(0.5).max(2).default(DEFAULT_TTS_SETTINGS.voiceRate).volatile(),
  soundEnabled: z.boolean().default(DEFAULT_TTS_SETTINGS.soundEnabled).volatile(),
  soundVolume: z.number().min(0).max(1).default(DEFAULT_TTS_SETTINGS.soundVolume).volatile(),
  soundPack: z.union(SOUND_PACKS).default(DEFAULT_TTS_SETTINGS.soundPack).volatile(),
  taskSounds: z.boolean().default(DEFAULT_TTS_SETTINGS.taskSounds).volatile(),
  clickSounds: z.boolean().default(DEFAULT_TTS_SETTINGS.clickSounds).volatile(),
})

export type Config = ReturnType<typeof Config>
type ConfigValues = { [Key in keyof Config]: Config[Key] extends Volatile<infer Value> ? Value : Config[Key] }

function readConfig(config: Config): ConfigValues {
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, (value as Volatile<unknown>).get()])) as ConfigValues
}

/** Register the TTS settings and same-origin synthesis route. */
export function apply(ctx: Context, config: Config): void {
  const current = () => readConfig(config)
  ctx.inject(['webServer'], host => { host.plugin(SpeechHost, { current, updates: (listener: () => void) => ctx.on('loader/volatile-update', listener) }) })

  // Load all assets
  const voicePresetAssets = new Map(TTS_VOICE_DESIGN_PRESETS.map((preset) => {
    const path = `${TTS_VOICE_DESIGN_ASSET_ROUTE}/${preset.id}.webp`
    const data = readFileSync(new URL(`../assets/voice-presets/${preset.id}.webp`, import.meta.url))
    return [path, data] as const
  }))
  const voiceAssets = new Map(TTS_VOICE_PRESETS.map((preset) => {
    const path = `${TTS_VOICE_ASSET_ROUTE}/${preset.id}.webp`
    const data = readFileSync(new URL(`../assets/voice-avatars/${preset.id}.webp`, import.meta.url))
    return [path, data] as const
  }))
  const toggleSoundAssets = new Map([...new Set([...Object.values(TTS_TOGGLE_SOUND_FILES).flat(), ...TTS_VOLUME_PREVIEW_FILES])].map((file) => {
    const path = `${TTS_TOGGLE_AUDIO_ASSET_ROUTE}/${file}`
    const data = readFileSync(new URL(`../assets/audio/${file}`, import.meta.url))
    return [path, data] as const
  }))

  const mimoLogoAsset = readFileSync(new URL('../assets/mimo.svg', import.meta.url))
  const toggleCharacterAsset = readFileSync(new URL('../assets/ui/toggle-characters.webp', import.meta.url))
  const soundEffectsCharacterAsset = readFileSync(new URL('../assets/ui/sound-effects-toggle-characters.webp', import.meta.url))
  const apiKeyWhaleAsset = readFileSync(new URL('../assets/ui/api-key-whale.webp', import.meta.url))
  const historyEmptyAsset = readFileSync(new URL('../assets/plugin-icons/avatar.webp', import.meta.url))
  const qqGroupAsset = readFileSync(new URL('../assets/ui/qq-group.webp', import.meta.url))

  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber), 'xiaomi-mimo-tts: custom settings page')
  })

  // Register all static assets using helper functions
  for (const [provider, path] of Object.entries(TTS_PROVIDER_LOGO_ASSET_ROUTES)) {
    registerStaticAsset(ctx, {
      path,
      data: readFileSync(new URL(`../assets/ui/provider-${provider === 'xiaomi' ? 'mimo' : 'doubao'}-logo.png`, import.meta.url)),
      contentType: 'image/png',
      description: `${provider} provider logo`,
    })
  }

  for (const [provider, path] of Object.entries(TTS_PROVIDER_CHARACTER_ASSET_ROUTES)) {
    registerStaticAsset(ctx, {
      path,
      data: readFileSync(new URL(`../assets/ui/provider-${provider === 'xiaomi' ? 'mimo' : 'doubao'}.webp`, import.meta.url)),
      contentType: 'image/webp',
      description: `${provider} provider character asset`,
    })
  }

  registerStaticAsset(ctx, {
    path: TTS_HISTORY_EMPTY_ASSET_ROUTE,
    data: historyEmptyAsset,
    contentType: 'image/webp',
    description: 'history empty illustration',
  })

  registerStaticAsset(ctx, {
    path: TTS_QQ_GROUP_ASSET_ROUTE,
    data: qqGroupAsset,
    contentType: 'image/webp',
    description: 'QQ discussion group QR code',
  })

  registerStaticAsset(ctx, {
    path: TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE,
    data: soundEffectsCharacterAsset,
    contentType: 'image/webp',
    description: 'sound effects character asset',
  })

  registerStaticAsset(ctx, {
    path: TTS_MIMO_LOGO_ASSET_ROUTE,
    data: mimoLogoAsset,
    contentType: 'image/svg+xml',
    description: 'MiMo logo asset',
  })

  registerStaticAsset(ctx, {
    path: TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
    data: toggleCharacterAsset,
    contentType: 'image/png',
    description: 'character toggle asset',
  })

  registerStaticAsset(ctx, {
    path: TTS_API_KEY_WHALE_ASSET_ROUTE,
    data: apiKeyWhaleAsset,
    contentType: 'image/png',
    description: 'API key whale asset',
  })

  registerStaticAssetMap(ctx, {
    pathPrefix: TTS_TOGGLE_AUDIO_ASSET_ROUTE,
    assets: toggleSoundAssets,
    contentType: 'audio/mpeg',
    description: 'toggle sound assets',
  })

  registerStaticAssetMap(ctx, {
    pathPrefix: TTS_VOICE_DESIGN_ASSET_ROUTE,
    assets: voicePresetAssets,
    contentType: 'image/webp',
    description: 'voice preset assets',
  })

  registerStaticAssetMap(ctx, {
    pathPrefix: TTS_VOICE_ASSET_ROUTE,
    assets: voiceAssets,
    contentType: 'image/webp',
    description: 'built-in voice assets',
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TTS_API_KEY_STATUS_ROUTE,
    handler(req, res) {
      if (req.method !== 'GET') {
        res.setHeader('allow', 'GET')
        json(res, 405, { error: 'method-not-allowed' })
        return
      }

      const settings = current()
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams.get('provider')
      if (query !== null && query !== 'xiaomi' && query !== 'doubao') { json(res, 400, { error: 'invalid-provider' }); return }
      const provider = query ?? settings.provider
      const apiKey = ttsApiKey({ ...settings, provider })
      json(res, 200, {
        provider,
        configured: apiKey.length > 0,
        supported: apiKey.length > 0 && isSupportedTtsApiKey(apiKey, provider),
      })
    },
  }), 'xiaomi-mimo-tts: API key status route')

  registerSynthesisRoutes(ctx, current)
}
