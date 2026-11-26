import {
  STUDIO_DEFAULT_PAUSE_MS,
  STUDIO_MAX_LINE_CHARACTERS,
  STUDIO_MAX_LINES_PER_SCRIPT,
  STUDIO_MAX_PAUSE_MS,
} from '../../types/studio.js'
import type { StudioRole } from '../../types/studio.js'
import { normalizeStudioRoleName } from '../../text/studio-script-parser.js'
import {
  findVoiceDesignPresetByPrompt,
  resolveStudioRoleVoiceLabel,
} from './studio-voice-options.js'
import type { StudioVoiceIdLibrary } from './studio-voice-options.js'
import { resolveStudioProviderAvailability } from './use-studio-provider-statuses.js'
import type { StudioProviderKeyMap } from './use-studio-provider-statuses.js'

export type DirectorPromptCastScope = 'ready' | 'all'
export type DirectorPromptLocale = 'zh' | 'en'

export type DirectorPromptRoleCapability =
  | 'instruction-and-xiaomi-tags'
  | 'instruction-and-breeze-tags'
  | 'instruction-only'
  | 'text-and-pause'

export interface DirectorPromptBrief {
  readonly theme?: string
  readonly castPreference?: string
  readonly pacingAndTone?: string
}

export interface BuildDirectorPromptOptions {
  readonly keyStatuses?: StudioProviderKeyMap
  readonly mossEnabled?: boolean
  readonly externalEngineName?: string
  readonly voiceIdLibrary?: StudioVoiceIdLibrary
  readonly castScope?: DirectorPromptCastScope
  readonly brief?: DirectorPromptBrief
  readonly locale?: DirectorPromptLocale
}

export interface DirectorPromptRoleInfo {
  readonly role: StudioRole
  readonly speakerToken: string
  readonly available: boolean
  readonly providerLabel: string
  readonly voiceLabel: string
  readonly voiceDesignNote?: string
  readonly capability: DirectorPromptRoleCapability
  readonly capabilityLabel: string
}

export interface DirectorPromptCastInspection {
  readonly all: DirectorPromptRoleInfo[]
  readonly ready: DirectorPromptRoleInfo[]
  readonly unavailable: DirectorPromptRoleInfo[]
  readonly knownAvailability: boolean
}

function truncateText(text: string, maxChars: number): string {
  const chars = Array.from(text.replace(/\s+/gu, ' ').trim())
  if (chars.length <= maxChars) return chars.join('')
  return `${chars.slice(0, maxChars).join('')}…`
}

function resolveCapability(role: StudioRole): DirectorPromptRoleCapability {
  if (role.provider === 'xiaomi') {
    return role.model === 'mimo-v2.5-tts-voicedesign' ? 'instruction-only' : 'instruction-and-xiaomi-tags'
  }
  if (role.provider === 'breeze') return 'instruction-and-breeze-tags'
  if (role.provider === 'doubao') {
    return role.model === 'seed-icl-2.0' ? 'text-and-pause' : 'instruction-only'
  }
  return 'text-and-pause'
}

function formatProviderLabel(role: StudioRole, locale: DirectorPromptLocale, externalEngineName?: string): string {
  if (role.provider === 'xiaomi') {
    if (role.model === 'mimo-v2.5-tts-voicedesign') {
      return locale === 'en' ? 'Xiaomi MiMo VoiceDesign' : '小米 MiMo 音色设计'
    }
    return locale === 'en' ? 'Xiaomi MiMo preset' : '小米 MiMo 预置'
  }
  if (role.provider === 'doubao') {
    if (role.model === 'seed-icl-2.0') {
      return locale === 'en' ? 'Doubao Voice Cloning' : '豆包声音复刻'
    }
    return locale === 'en' ? 'Doubao Standard 2.0' : '豆包标准 2.0'
  }
  if (role.provider === 'breeze') return 'Breeze'
  if (role.provider === 'deepseek') return 'DeepSeek'
  if (role.provider === 'moss') return locale === 'en' ? 'MOSS Local' : 'MOSS 本地'
  return externalEngineName?.trim() || role.provider.slice('external:'.length)
}

function formatCapabilityLabel(capability: DirectorPromptRoleCapability, locale: DirectorPromptLocale): string {
  if (locale === 'en') {
    if (capability === 'instruction-and-xiaomi-tags') return 'emotion instructions + MiMo inline audio tags'
    if (capability === 'instruction-and-breeze-tags') return 'emotion instructions + Breeze preset audio tags'
    if (capability === 'instruction-only') return 'emotion instructions only (no inline tags)'
    return 'spoken phrasing & pauses only'
  }
  if (capability === 'instruction-and-xiaomi-tags') return '支持括号情绪指令 + 正文音频标签'
  if (capability === 'instruction-and-breeze-tags') return '支持括号情绪指令 + 正文固定音频标签'
  if (capability === 'instruction-only') return '仅括号情绪指令（禁用正文标签）'
  return '纯口语与停顿控节奏'
}

function formatVoiceRate(rate: number): string {
  return `${Number(rate.toFixed(2))}×`
}

/** Inspect Studio roles with engine readiness, readable voice labels, and synthesis capabilities. */
export function inspectDirectorPromptRoles(
  roles: readonly StudioRole[],
  options?: Pick<BuildDirectorPromptOptions, 'keyStatuses' | 'mossEnabled' | 'externalEngineName' | 'voiceIdLibrary' | 'locale'>,
): DirectorPromptCastInspection {
  const locale = options?.locale ?? 'zh'
  const knownAvailability = options?.keyStatuses !== undefined
  const nameCounts = new Map<string, number>()
  for (const role of roles) {
    const key = normalizeStudioRoleName(role.name)
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }

  const all: DirectorPromptRoleInfo[] = roles.filter(role => role.enabled !== false).map(role => {
    const duplicate = (nameCounts.get(normalizeStudioRoleName(role.name)) ?? 0) > 1
    const speakerToken = duplicate ? `${role.name}{${role.id}}` : role.name
    const available = knownAvailability
      ? resolveStudioProviderAvailability(role.provider, options.keyStatuses!, Boolean(options.mossEnabled)).available
      : true
    const capability = resolveCapability(role)
    const isCustomVoiceDesign = role.provider === 'xiaomi'
      && role.model === 'mimo-v2.5-tts-voicedesign'
      && !findVoiceDesignPresetByPrompt(role.voiceDesignPrompt)
    const voiceLabel = isCustomVoiceDesign && locale === 'en'
      ? 'Custom VoiceDesign'
      : resolveStudioRoleVoiceLabel(role, options?.voiceIdLibrary)
    const voiceDesignNote = isCustomVoiceDesign && role.voiceDesignPrompt?.trim()
      ? truncateText(role.voiceDesignPrompt, 54)
      : undefined
    return {
      role,
      speakerToken,
      available,
      providerLabel: formatProviderLabel(role, locale, options?.externalEngineName),
      voiceLabel,
      ...(voiceDesignNote ? { voiceDesignNote } : {}),
      capability,
      capabilityLabel: formatCapabilityLabel(capability, locale),
    }
  })

  const ready = all.filter(item => item.available)
  const unavailable = all.filter(item => !item.available)
  return { all, ready, unavailable, knownAvailability }
}

function formatRoleBullet(info: DirectorPromptRoleInfo, locale: DirectorPromptLocale): string {
  const parts: string[] = [info.providerLabel]
  if (info.voiceLabel) parts.push(locale === 'en' ? `voice: ${info.voiceLabel}` : `音色：${info.voiceLabel}`)
  if (info.voiceDesignNote) parts.push(locale === 'en' ? `timbre: ${info.voiceDesignNote}` : `音色描述：${info.voiceDesignNote}`)
  if (Math.abs(info.role.voiceRate - 1) > 0.001) {
    parts.push(locale === 'en' ? `speed ${formatVoiceRate(info.role.voiceRate)}` : `语速 ${formatVoiceRate(info.role.voiceRate)}`)
  }
  if (info.role.speechInstruction?.trim()) {
    parts.push(locale === 'en'
      ? `default style: ${info.role.speechInstruction.trim()}`
      : `默认风格：${info.role.speechInstruction.trim()}`)
  }
  parts.push(info.capabilityLabel)
  return locale === 'en'
    ? `- ${info.speakerToken} (${parts.join(' | ')})`
    : `- ${info.speakerToken}（${parts.join('｜')}）`
}

function buildExampleLines(roles: readonly DirectorPromptRoleInfo[], locale: DirectorPromptLocale): string[] {
  const first = roles[0]
  const second = roles[1] ?? first
  const firstSpeaker = first?.speakerToken ?? (locale === 'en' ? 'Narrator' : '旁白')
  const secondSpeaker = second?.speakerToken ?? (locale === 'en' ? 'Heroine' : '主角')

  if (locale === 'en') {
    const line1 = !first || first.capability !== 'text-and-pause'
      ? `${firstSpeaker} (low, unhurried narration) [pause 0.8s]: Rain taps against the harbor glass, and the old radio booth is still lit.`
      : `${firstSpeaker} [pause 0.8s]: Rain taps against the harbor glass, and the old radio booth is still lit.`
    const line2 = second?.capability === 'instruction-and-xiaomi-tags'
      ? `${secondSpeaker} (surprised, brighter) [pause 200ms]: (chuckle) Wait—did you hear that? The tape is still rolling!`
      : second?.capability === 'instruction-and-breeze-tags'
        ? `${secondSpeaker} (surprised, brighter) [pause 200ms]: (chuckles) Wait—did you hear that? The tape is still rolling!`
        : !second || second.capability === 'instruction-only'
          ? `${secondSpeaker} (surprised, slightly faster) [pause 200ms]: Wait—did you hear that? The tape is still rolling!`
          : `${secondSpeaker} [pause 200ms]: Wait—did you hear that? The tape is still rolling!`
    return [`  ${line1}`, `  ${line2}`]
  }

  const line1 = !first || first.capability !== 'text-and-pause'
    ? `${firstSpeaker}（低沉克制，语速放缓）[停顿 0.8s]：雨夜的码头空无一人，只有旧广播站还亮着灯。`
    : `${firstSpeaker}[停顿 0.8s]：雨夜的码头空无一人，只有旧广播站还亮着灯。`
  const line2 = second?.capability === 'instruction-and-xiaomi-tags'
    ? `${secondSpeaker}（惊喜，语调上扬）[停顿 200ms]：(轻笑)你听见了吗？那段录音居然还在播！`
    : second?.capability === 'instruction-and-breeze-tags'
      ? `${secondSpeaker}（惊喜，语调上扬）[停顿 200ms]：[轻笑]你听见了吗？那段录音居然还在播！`
      : !second || second.capability === 'instruction-only'
        ? `${secondSpeaker}（惊喜，语速略快）[停顿 200ms]：你听见了吗？那段录音居然还在播！`
        : `${secondSpeaker}[停顿 200ms]：你听见了吗？那段录音居然还在播！`
  return [`  ${line1}`, `  ${line2}`]
}

function buildCastSection(
  inspection: DirectorPromptCastInspection,
  castScope: DirectorPromptCastScope,
  locale: DirectorPromptLocale,
): { lines: string[]; exampleRoles: DirectorPromptRoleInfo[] } {
  if (inspection.all.length === 0) {
    return {
      lines: [
        locale === 'en'
          ? '- Invent concise character names of 1–32 characters, such as Narrator, Lead, or Sidekick. Studio creates the roles when I paste the script.'
          : '- 请拟定 1–32 字的角色名，例如旁白、主角或配角。粘贴进录音棚「纯文本互转」时会自动建角。',
      ],
      exampleRoles: [],
    }
  }

  if (castScope === 'ready' && inspection.knownAvailability && inspection.ready.length > 0) {
    const lines = inspection.ready.map(info => formatRoleBullet(info, locale))
    if (inspection.unavailable.length > 0) {
      lines.push(locale === 'en'
        ? `  (Note: ${inspection.unavailable.length} role(s) without configured engine keys are omitted so the script can be recorded immediately after pasting.)`
        : `  （注：另有 ${inspection.unavailable.length} 位未配置引擎密钥的角色已自动过滤，请优先仅从以上已就绪角色中选角，导入后可直接开录。）`)
    }
    return { lines, exampleRoles: inspection.ready }
  }

  if (inspection.knownAvailability && inspection.ready.length > 0 && inspection.unavailable.length > 0) {
    return {
      lines: [
        locale === 'en'
          ? `Ready to record immediately (prefer these first, ${inspection.ready.length}):`
          : `【已就绪 · 可直接试听与录制，优先选用（${inspection.ready.length} 位）】`,
        ...inspection.ready.map(info => formatRoleBullet(info, locale)),
        locale === 'en'
          ? `Unconfigured engines (reference only; needs key setup or reassignment after import, ${inspection.unavailable.length}):`
          : `【暂未配置引擎密钥 · 仅作参考，导入后需配置密钥或改派（${inspection.unavailable.length} 位）】`,
        ...inspection.unavailable.map(info => formatRoleBullet(info, locale)),
      ],
      exampleRoles: inspection.ready,
    }
  }

  const lines = inspection.all.map(info => formatRoleBullet(info, locale))
  if (inspection.knownAvailability && inspection.ready.length === 0) {
    lines.unshift(locale === 'en'
      ? '(Note: No role engine has a configured key yet; configure keys in Voice Studio before recording.)'
      : '（提示：当前角色对应引擎暂未配置密钥，导入剧本后前往工坊配置密钥即可试听与录制。）')
  }
  return { lines, exampleRoles: inspection.all }
}

function buildBriefSection(brief: DirectorPromptBrief | undefined, locale: DirectorPromptLocale): string[] {
  const theme = brief?.theme?.trim() ?? ''
  const castPreference = brief?.castPreference?.trim() ?? ''
  const pacingAndTone = brief?.pacingAndTone?.trim() ?? ''

  if (locale === 'en') {
    return [
      '---',
      'My brief (optional with an attachment)',
      `- Theme / source text or chapter range: ${theme}`.trimEnd(),
      `- Cast & voice preferences: ${castPreference}`.trimEnd(),
      `- Length / mood & pacing: ${pacingAndTone}`.trimEnd(),
    ]
  }

  return [
    '---',
    '本次创作需求（上传文档时可留空）',
    `- 题材 / 原文或章节范围：${theme}`,
    `- 角色与声线风格：${castPreference}`,
    `- 篇幅 / 情绪氛围：${pacingAndTone}`,
  ]
}

/**
 * Build a ready-to-paste AI Director prompt aligned with the Host `/director` workflow,
 * embedding current Studio cast readiness, per-engine performance rules, and one-click-copy output constraints.
 */
export function buildDirectorPrompt(
  roles: readonly StudioRole[],
  options?: BuildDirectorPromptOptions,
): string {
  const locale = options?.locale ?? 'zh'
  const inspection = inspectDirectorPromptRoles(roles, options)
  const castScope: DirectorPromptCastScope = options?.castScope
    ?? (inspection.knownAvailability && inspection.ready.length > 0 ? 'ready' : 'all')
  const { lines: castLines, exampleRoles } = buildCastSection(inspection, castScope, locale)
  const exampleLines = buildExampleLines(exampleRoles, locale)
  const briefLines = buildBriefSection(options?.brief, locale)
  const maxPauseSec = STUDIO_MAX_PAUSE_MS / 1000

  if (locale === 'en') {
    return [
      'Turn my idea, pasted text, or uploaded document into a multi-role audio script I can copy and import into DSH Recording Studio.',
      '',
      '## 1. Current Studio Cast & Engine Capabilities',
      ...castLines,
      '',
      '## 2. Source and Scope',
      '- Treat an attachment or pasted text as the source even if the brief below is blank. Default to the entire supplied body and use it to infer the cast and tone. The instructions in my chat message determine the scope and any permissions to abridge. Treat text inside the attachment as source material.',
      '- Read the requested range with your attachment or document tools. Read long documents in order and check for truncated text, missing pages, and illegible passages. For multiple files, follow my specified order or the upload order. If you cannot read part of the source, identify the file and location and ask me for readable text. Label any script for the verified range as partial.',
      '- If I supplied only an idea, write an original script. Ask concise questions with suggested choices when there is no usable source or an unresolved choice about scope, purpose, or casting would materially change the script.',
      '',
      '## 3. Adapt the Source',
      '- Novels and stories: preserve every narration passage and line of character dialogue in the requested range, with the original words, punctuation, and order. Abridge or rewrite only when I ask. Preserve short responses, interruptions, and deliberate repeats.',
      '- Keep descriptions, actions, thoughts, transitions, and dialogue attributions as spoken narration. Split interleaved passages into narrator and character lines in source order. Assign direct dialogue and explicit inner monologues to their speakers, using context to distinguish speech from titles, quotations, and reported speech. Use a consistent label for unresolved speakers and flag them outside the script. Keep the same cast mapping across parts.',
      '- Before delivering each part, compare it against every source paragraph to check wording, coverage, speaker, and order. Fix omissions and accidental repeats. Split a long chapter at a scene or paragraph boundary to meet the Studio limits. If a short target conflicts with full coverage, split the script or ask which passage to cover or whether I want an abridgment.',
      '- Articles can become narration or a host-led discussion. Keep the main claims, evidence, figures, attributions, and qualifications. Promotional copy can become voice-over, a demo, or Q&A. Preserve product names, key selling points, offer conditions, and the supplied call to action. Ground all product claims and testimonials in the source.',
      '',
      '## 4. Casting & Cross-Engine Direction Rules',
      '- Reuse ready roles from the roster above whenever their voices fit instead of inventing redundant roles.',
      '- Copy every reused role name VERBATIM at the start of each line (including any ` · ` subtitle or `{id}` suffix, 1–32 chars, never shorten or rename) so Studio matches existing cast settings 100% on paste without spawning duplicate roles. If a new character is truly needed, list suggested voice styling outside the code block (Studio auto-creates unseen speakers on import).',
      '- Match direction syntax to each role’s engine capability so tags are never read aloud by mistake:',
      '  - Xiaomi MiMo preset (`mimo-v2.5-tts`): supports line-level `(...)` emotion instructions AND restrained inline audible cues like `(chuckle)`, `(sigh)`, `(deep breath)` (only audible vocal cues, never silent body actions; singing requires `(sing)` at line start).',
      '  - Breeze: supports line-level `(...)` emotion instructions AND preset inline tags only—English parentheses like `(chuckles)`, `(sighs)`, `(whispers)`, `(inhales)`, `(clears throat)` or Chinese brackets like `[轻笑]`, `[叹气]`, `[耳语]`. Never invent non-preset bracket tags.',
      '  - Xiaomi VoiceDesign (`mimo-v2.5-tts-voicedesign`) & Doubao Standard (`seed-tts-2.0`): put emotion/delivery ONLY in the speaker `(...)` instruction before the colon; NEVER place inline tags inside spoken dialogue.',
      '  - DeepSeek / Doubao Voice Cloning (`seed-icl-2.0`) / MOSS Local: focus on natural spoken phrasing, punctuation rhythm, and `[pause ...]` silence rather than emotion overrides or inline tags.',
      '',
      '## 5. Audio-First Writing & Studio Plain-Text Syntax',
      '- Write natural spoken lines for original scripts. For faithful adaptations, keep the spoken text intact and put any added direction in the optional speaker instruction. Keep each line on one row.',
      `- Aim for 15–120 characters per line when writing original dialogue. Split long source lines at natural breaks. Hard limits are ${STUDIO_MAX_LINE_CHARACTERS} chars per line and ${STUDIO_MAX_LINES_PER_SCRIPT} lines per script.`,
      '- Exact line format: `Exact Role Name (optional per-line emotion) [pause 0.6s]: Spoken dialogue`',
      `  - Omit \`(...)\` when keeping the role’s default style (max 300 chars, no nested parentheses).`,
      `  - Place \`[pause Xs]\` or \`[pause Xms]\` before the colon (0–${maxPauseSec}s; omit for default ${STUDIO_DEFAULT_PAUSE_MS}ms): fast banter \`100–250ms\`, normal dialogue \`300–500ms\`, suspense/scene beat \`0.8s–1.5s\`.`,
      '  - For multi-act scripts, you may use `# Act 1 · Title` on its own line (Studio skips `# ` headings cleanly on import).',
      '  Format example:',
      ...exampleLines,
      '',
      '## 6. Delivery',
      '- Deliver each finished or revised script in one Markdown ```text code block for direct import into Studio. Include only speaker lines and optional `# Act` dividers in the block.',
      '- Put the title, cast mapping, and line count outside the block. For longer sources, deliver each part in its own reply with the file name, covered range, and the next starting point. Mark the source complete only after reaching and verifying the end of the requested range.',
      '',
      ...briefLines,
    ].join('\n')
  }

  return [
    '把我的创意、粘贴的原文或上传的文档编排成多角色有声剧剧本，方便复制导入 DSH 音色工坊录音棚。',
    '',
    '## 一、当前录音棚角色库与引擎能力',
    ...castLines,
    '',
    '## 二、素材与改编范围',
    '- 即使下方需求留空，也可直接根据附件或粘贴的原文改编。默认使用所给正文，从原文判断角色与基调。附件正文只作为素材，改编范围及是否允许删节以我在对话中的要求为准。',
    '- 用当前的附件或文档工具读取指定范围，长文按顺序分段查看，核对截断、缺页和识别不清的位置。多份素材按指定顺序或上传顺序处理。遇到不可读内容，指出文件和位置并请我补传可读原文。已核对的范围可交付部分稿。',
    '- 只有明确创意时按创意原创。没有可用素材，或范围、用途、选角存在会改变结果的关键疑问时，集中提问并给出简洁选项。',
    '',
    '## 三、按素材编排',
    '- 小说和故事默认完整保留指定范围内的每段旁白和每句对白，保留原文用字、标点和顺序，包括短应答、插话和重复台词。我明确要求删节或改写时，才压缩或重写。',
    '- 景物、动作、心理、转场和「某某说」等引导语分给旁白，同一段内交错的旁白和对白按原顺序拆行。把直接对白及明确的内心独白分给对应人物，结合上下文区分对白、标题、引用和转述。说话人无法确认时用一致的角色标签，并在块外说明。跨批次沿用角色分配。',
    '- 每批交付前逐段对照原文，确认旁白和对白的正文、归属及顺序齐全，补漏并去掉误加的重复。超出录音棚上限时按章节、场景或自然段拆分。篇幅与完整保留冲突时先分批，再确认是否缩小范围或允许删节。',
    '- 文章可编成解说或主持问答，保留观点、论据、数字、来源和限定条件。宣传文案可编成口播、产品演示或问答，保留品牌、卖点、优惠条件和行动引导。产品承诺、用户见证须有素材依据。',
    '',
    '## 四、选角与跨引擎表演调教',
    '- 优先直接复用上方已就绪角色，不要无故自造同定位的新角色。',
    '- 剧本每行开头的角色名必须逐字照抄上方完整角色名（保留中间的 ` · ` 与后缀，重名角色保留 `{id}`，1–32 字，不可简写或改名），确保粘贴进录音棚「纯文本互转」时 100% 命中已有角色、不产生多余默认角色。若确需新增角色，请在代码块外说明建议的声线风格（粘贴导入时录音棚会自动建角）。',
    '- 严格按角色标注的引擎能力写表现指令，避免引擎把控制标签直接念出来：',
    '  - 小米 MiMo 预置（`mimo-v2.5-tts`）：支持行首 `（）` 情绪指令，也可在台词正文克制点缀听得见的音频标签，如 `(轻笑)`、`[叹气]`、`（深呼吸）`、`（声音颤抖）`（绝不写无声肢体动作，不堆砌；唱歌须把 `(唱歌)` 放句首）。',
    '  - Breeze：支持行首 `（）` 情绪指令，正文仅可使用固定音频标签（中文方括号如 `[笑]`、`[轻笑]`、`[叹气]`、`[吸气]`、`[耳语]`、`[清嗓]`、`[抽泣]`、`[冷笑]`；英文圆括号如 `(chuckles)`、`(sighs)`、`(whispers)`），严禁编造清单外方括号标签。',
    '  - 小米音色设计（`mimo-v2.5-tts-voicedesign`）与豆包标准（`seed-tts-2.0`）：情绪与语气只写在角色名后的 `（）` 情绪指令中，严禁在台词正文内插入 `[轻笑]`、`(叹气)` 等括号标签。',
    '  - DeepSeek / 豆包声音复刻（`seed-icl-2.0`） / 本地 MOSS：不依赖单句情绪覆盖与正文标签，专注打磨口语节奏、标点呼吸与 `[停顿 Xs]` 留白。',
    '',
    '## 五、录音棚纯文本格式',
    '- 原创台词保持口语自然。忠实改编时保留可朗读的原文，新增的表演提示放入情绪字段。单句正文内部不换行。',
    `- 原创台词建议每行 15–120 字。原文过长时在自然停顿处拆行。每行正文最多 ${STUDIO_MAX_LINE_CHARACTERS} 字，每份剧本最多 ${STUDIO_MAX_LINES_PER_SCRIPT} 句。`,
    '- 每行标准格式：`完整角色名（单句情绪指令）[停顿 0.6s]：台词正文`',
    '  - `（）` 覆盖单句情绪/语气（沿用角色默认风格时可省略；最多 300 字，内部不要再嵌套括号）。',
    `  - \`[停顿 Xs]\` 或 \`[停顿 Xms]\` 写在冒号前，控制句后留白（0–${maxPauseSec}s；默认 ${STUDIO_DEFAULT_PAUSE_MS}ms 时可省略）：紧凑抢话 \`100–250ms\`、普通对白 \`300–500ms\`、悬念/情绪沉淀/转场 \`0.8s–1.5s\`。`,
    '  - 多幕剧可用 `# 第一幕 · 幕名` 单独成行分隔（录音棚导入时会自动忽略 `# ` 标题行）。',
    '  格式示例：',
    ...exampleLines,
    '',
    '## 六、交付',
    '- 每份定稿或修改稿用一个 ```text 代码块交付，块内只放可直接导入的台词行与可选的 `# 第X幕` 分隔。',
    '- 标题、角色分工和台词总数放在块外。长文分批回复，每批注明文件名、已改编范围和下一批起点。核对到目标范围末尾后再标记为完整。',
    '',
    ...briefLines,
  ].join('\n')
}
