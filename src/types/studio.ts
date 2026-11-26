import { TTS_VOICE_DESIGN_PRESETS } from './models.js'
import { BREEZE_TTS_MODEL, DEEPSEEK_TTS_MODEL } from './providers.js'
import type { TtsProvider } from './providers.js'
import { battleThroughHeavensRoles } from '../studio-presets/battle-through-heavens.js'

export const STUDIO_MAX_LINES_PER_SCRIPT = 300
export const STUDIO_MAX_LINE_CHARACTERS = 500
export const STUDIO_MAX_PAUSE_MS = 5000
export const STUDIO_DEFAULT_PAUSE_MS = 400
export const STUDIO_MAX_ROLES = 100
export const STUDIO_MAX_SCRIPTS = 100
export const STUDIO_MAX_TASKS = 100
export const STUDIO_MAX_STORAGE_BYTES = 1024 * 1024 * 1024

/** Series palette aligned with Split Bar segment accents. */
export const STUDIO_ROLE_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#06b6d4',
  '#6366f1',
  '#f97316',
] as const

export type StudioRoleProvider = TtsProvider | 'moss' | `external:${string}`

export interface StudioRole {
  id: string
  name: string
  color: string
  provider: StudioRoleProvider
  model: string
  voice: string
  voiceDesignPrompt?: string
  speechInstruction?: string
  voiceRate: number
  builtin?: boolean
  createdAt: number
  updatedAt: number
}

export interface StudioRoleInput {
  id?: string
  name: string
  color?: string
  provider: StudioRoleProvider
  model?: string
  voice?: string
  voiceDesignPrompt?: string
  speechInstruction?: string
  voiceRate?: number
}

export interface StudioLine {
  id: string
  roleId: string
  text: string
  speechInstruction?: string
  pauseAfterMs: number
}

export interface StudioLineInput {
  id?: string
  roleId: string
  text: string
  speechInstruction?: string
  pauseAfterMs?: number
}

export interface StudioScript {
  id: string
  title: string
  description?: string
  lines: StudioLine[]
  createdAt: number
  updatedAt: number
}

export interface StudioScriptInput {
  id?: string
  title: string
  description?: string
  lines: StudioLineInput[]
}

export type StudioTaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled'
export type StudioTaskLineStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface StudioTaskLine {
  lineId: string
  roleId: string
  roleName: string
  roleColor: string
  provider: StudioRoleProvider
  model: string
  voice: string
  voiceDesignPrompt?: string
  speechInstruction?: string
  voiceRate: number
  text: string
  pauseAfterMs: number
  status: StudioTaskLineStatus
  durationMs?: number
  startMs?: number
  endMs?: number
  errorCode?: string
}

export interface StudioTask {
  id: string
  scriptId?: string
  title: string
  status: StudioTaskStatus
  createdAt: number
  updatedAt: number
  completedAt?: number
  totalLines: number
  completedLines: number
  failedLines: number
  durationMs?: number
  audioSize?: number
  errorCode?: string
  lines: StudioTaskLine[]
}

export interface StudioSnapshot {
  instanceId?: string
  revision: number
  roles: StudioRole[]
  scripts: StudioScript[]
  tasks: StudioTask[]
  storageBytes: number
  maxStorageBytes: number
  storageRoot?: string
}

export function pickStudioRoleColor(index: number): string {
  return STUDIO_ROLE_COLORS[((index % STUDIO_ROLE_COLORS.length) + STUDIO_ROLE_COLORS.length) % STUDIO_ROLE_COLORS.length]!
}

export function normalizeStudioPauseMs(value: unknown, fallback = STUDIO_DEFAULT_PAUSE_MS): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(STUDIO_MAX_PAUSE_MS, Math.max(0, Math.round(value)))
}

function xiaomiStudioVoiceDesign(id: typeof TTS_VOICE_DESIGN_PRESETS[number]['id']) {
  return {
    provider: 'xiaomi',
    model: 'mimo-v2.5-tts-voicedesign',
    voice: '',
    voiceDesignPrompt: TTS_VOICE_DESIGN_PRESETS.find(preset => preset.id === id)!.prompt,
  } as const
}

/** Built-in Studio cast covering all four cloud providers. */
export function createBuiltinStudioRoles(now = Date.now()): StudioRole[] {
  return [
    {
      id: 'builtin-narrator',
      name: '陆远山 · 纪录片旁白',
      color: '#3b82f6',
      ...xiaomiStudioVoiceDesign('documentary-narrator'),
      speechInstruction: '沉稳克制，语速舒缓，叙事纵深感强',
      voiceRate: 0.95,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-bingtang',
      name: '冰糖 · 元气少女',
      color: '#ec4899',
      provider: 'xiaomi',
      model: 'mimo-v2.5-tts',
      voice: '冰糖',
      speechInstruction: '清甜活泼，俏皮灵动',
      voiceRate: 1.05,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-whale',
      name: '鲸鱼娘 · 傲娇女仆',
      color: '#06b6d4',
      ...xiaomiStudioVoiceDesign('energetic-girl'),
      speechInstruction: '轻快灵动，略带小傲娇与自然口语感',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-suda',
      name: '苏打 · 阳光少年',
      color: '#f59e0b',
      provider: 'xiaomi',
      model: 'mimo-v2.5-tts',
      voice: '苏打',
      speechInstruction: '明亮朝气，热情干脆',
      voiceRate: 1.05,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-moli',
      name: '茉莉 · 知性解说',
      color: '#8b5cf6',
      provider: 'xiaomi',
      model: 'mimo-v2.5-tts',
      voice: '茉莉',
      speechInstruction: '温婉知性，吐字清晰从容',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-suspense',
      name: '裴沉舟 · 悬疑解说',
      color: '#6366f1',
      ...xiaomiStudioVoiceDesign('suspense-narrator'),
      speechInstruction: '低沉神秘，带压迫与悬念感',
      voiceRate: 0.95,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-empress',
      name: '高冷御姐',
      color: '#a855f7',
      provider: 'doubao',
      model: 'seed-tts-2.0',
      voice: 'zh_female_gaolengyujie_uranus_bigtts',
      speechInstruction: '冷静从容，略带疏离与气场',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-vivi',
      name: 'Vivi · 亲和女主',
      color: '#f97316',
      provider: 'doubao',
      model: 'seed-tts-2.0',
      voice: 'zh_female_vv_uranus_bigtts',
      speechInstruction: '自然亲切，情感细腻真实',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-thinker',
      name: '深思先生 · 沉着智囊',
      color: '#10b981',
      provider: 'breeze',
      model: BREEZE_TTS_MODEL,
      voice: 'voc_reys5un5t4ed',
      speechInstruction: '温和理性，条理清晰',
      voiceRate: 0.95,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-stella',
      name: 'Stella · 清澈双语',
      color: '#14b8a6',
      provider: 'deepseek',
      model: DEEPSEEK_TTS_MODEL,
      voice: 'stella',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-night-host',
      name: '沈听澜 · 深夜电台主播',
      color: '#7c3aed',
      ...xiaomiStudioVoiceDesign('asmr-whisper'),
      speechInstruction: '像在对一个听众说话，音量平稳，短句轻轻落下',
      voiceRate: 0.92,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-podcast-host',
      name: '许闻川 · 播客主持',
      color: '#b45309',
      ...xiaomiStudioVoiceDesign('liang-wenfeng'),
      speechInstruction: '男声口语，自然随和，追问简短，提到反差时有轻微笑意',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-chloe',
      name: 'Chloe · 英文女声',
      color: '#db2777',
      provider: 'xiaomi',
      model: 'mimo-v2.5-tts',
      voice: 'Chloe',
      speechInstruction: 'Speak clear, natural English with precise diction and conversational intonation.',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'builtin-dean',
      name: 'Dean · 英文男声',
      color: '#2563eb',
      provider: 'xiaomi',
      model: 'mimo-v2.5-tts',
      voice: 'Dean',
      speechInstruction: 'Speak clear, natural English at an even pace, with distinct pronunciation of numbers and times.',
      voiceRate: 1,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    ...battleThroughHeavensRoles.map(role => ({
      ...role,
      provider: 'doubao' as const,
      model: 'seed-tts-2.0',
      builtin: true,
      createdAt: now,
      updatedAt: now,
    })),
  ]
}
