/** Settings namespace used by the Host and Web client. */
export const TTS_SETTINGS_NAMESPACE = 'xiaomi-mimo-tts'

/** Keep the UI version visible without making the browser bundle load package.json. */
export const TTS_VERSION = '4.3.0-alpha.2'

/** Same-origin route used by the Web client to request synthesized audio. */
export const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
export const TTS_STREAM_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize-stream'

export const TTS_DUPLEX_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize-duplex'
export const DOUBAO_TTS_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection'
export const DOUBAO_AGENT_PLAN_TTS_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/plan/tts/bidirection'

/** Same-origin route that reports API key configuration status without exposing the key. */
export const TTS_API_KEY_STATUS_ROUTE = '/plugins/xiaomi-mimo-tts/api-key-status'

/** Same-origin route used by the Web client to load the MiMo brand logo. */
export const TTS_MIMO_LOGO_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/mimo.svg'

/** Same-origin prefix used by the Web client to load voice-design preset icons. */
export const TTS_VOICE_DESIGN_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/voice-presets'

/** Same-origin prefix used by the Web client to load official built-in voice avatars. */
export const TTS_VOICE_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/voice-avatars'

/** Same-origin route used by the Web client to load the four-state character toggle sheet. */
export const TTS_TOGGLE_CHARACTER_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/toggle-characters.webp'

/** Same-origin route used by the Web client to load the two-state sound-effects character sheet. */
export const TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/sound-effects-toggle-characters.webp'

/** Same-origin character assets for the two faces of the provider switch. */
export const TTS_PROVIDER_CHARACTER_ASSET_ROUTES = {
  xiaomi: '/plugins/xiaomi-mimo-tts/provider-mimo.webp',
  doubao: '/plugins/xiaomi-mimo-tts/provider-doubao.webp',
} as const

/** Provider brand marks used by the Voice reading selector. */
export const TTS_PROVIDER_LOGO_ASSET_ROUTES = {
  xiaomi: '/plugins/xiaomi-mimo-tts/provider-mimo-logo.png',
  doubao: '/plugins/xiaomi-mimo-tts/provider-doubao-logo.png',
} as const

/** Same-origin route used by the Web client to load the API-key whale mascot sheet. */
export const TTS_API_KEY_WHALE_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/api-key-whale.webp'

/** Same-origin illustration for an empty audio history. */
export const TTS_HISTORY_EMPTY_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/history-empty-whale.webp'

/** Same-origin QR code for the plugin's QQ discussion group. */
export const TTS_QQ_GROUP_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/qq-group.webp'

/** Public QQ discussion group the plugin links to. */
export const TTS_QQ_GROUP_NUMBER = '1104616387'

/** Same-origin prefix used by the Web client to load switch feedback sounds. */
export const TTS_TOGGLE_AUDIO_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/audio'

/** Bundled switch feedback sounds grouped by the state they announce. */
export const TTS_TOGGLE_SOUND_FILES = {
  on: ['on01.mp3', 'on02.mp3', 'on03.mp3'],
  off: ['off01.mp3', 'off02.mp3', 'off03.mp3'],
  'auto-on': ['auto-on01.mp3', 'auto-on02.mp3', 'auto-on03.mp3'],
  'auto-off': ['auto-off01.mp3', 'auto-off02.mp3', 'auto-off03.mp3'],
} as const

export type TtsToggleSoundKind = keyof typeof TTS_TOGGLE_SOUND_FILES

/** Bundled sounds used to preview the currently selected voice or UI volume. */
export const TTS_VOLUME_PREVIEW_FILES = ['volume-01.mp3', 'volume-02.mp3', 'on02.mp3'] as const

/** Default Xiaomi endpoint for Token Plan API keys. */
export const TOKEN_PLAN_TTS_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'

/** Maximum decoded complete MP3 payload accepted from Xiaomi MiMo. */
export const DEFAULT_MAX_MP3_AUDIO_BYTES = 32 * 1024 * 1024

/** Maximum decoded complete WAV payload accepted from Xiaomi MiMo. */
export const DEFAULT_MAX_WAV_AUDIO_BYTES = 128 * 1024 * 1024
export const DEFAULT_MAX_PAUSED_PCM_BYTES = 32 * 1024 * 1024

/** Extra JSON envelope allowance around a Base64 audio payload. */
export const TTS_AUDIO_RESPONSE_JSON_OVERHEAD_BYTES = 1024 * 1024

export const DEFAULT_TTS_SEGMENT_CHARACTERS = 160
export const MAX_TTS_SEGMENT_CHARACTERS = 240
export const MIN_TTS_SEGMENT_CHARACTERS = 50

/** Minimum spoken characters to accumulate for low-latency browser speech during generation. */
export const MIN_TTS_STREAM_CHARACTERS = 20
