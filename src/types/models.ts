/** Supported built-in Xiaomi MiMo voices. */
export const TTS_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'] as const

/** Built-in voice metadata mirrored from Xiaomi MiMo's official selector. */
export const TTS_VOICE_PRESETS = [
  { id: 'bingtang', value: '冰糖', summary: '活泼少女' },
  { id: 'mia', value: 'Mia', summary: 'Lively girl' },
  { id: 'moli', value: '茉莉', summary: '知性女声' },
  { id: 'chloe', value: 'Chloe', summary: 'Witty Grace' },
  { id: 'suda', value: '苏打', summary: '阳光少年' },
  { id: 'milo', value: 'Milo', summary: 'Sunny boy' },
  { id: 'baihua', value: '白桦', summary: '成熟男声' },
  { id: 'dean', value: 'Dean', summary: 'Steady Gentle' },
] as const

/** TTS models supported by this plugin. */
export const TTS_MODELS = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'browser-local-fallback'] as const

export type TtsModel = typeof TTS_MODELS[number]

/** Browser-local speech orchestration strategies. */
export const TTS_LOCAL_SPEECH_MODES = ['auto', 'local-first', 'disabled'] as const

export type TtsLocalSpeechMode = typeof TTS_LOCAL_SPEECH_MODES[number]

/** Engines that can provide the local speech fallback voice. */
export const TTS_LOCAL_VOICE_ENGINES = ['browser', 'moss'] as const

export type TtsLocalVoiceEngine = typeof TTS_LOCAL_VOICE_ENGINES[number]

/** Voice-design descriptions; Whale-chan's delivery is inspired by DeepSeek Whale-chan. */
export const TTS_VOICE_DESIGN_PRESETS = [
  {
    id: "energetic-girl",
    label: "鲸鱼娘",
    summary: "清甜灵动",
    prompt:
      "A bright, youthful female voice around 16–20. Sweet, soft and slightly nasal, with a lazy yet cheerful energy—like someone who just woke up but is already happily active. Sentence endings often lift playfully. Sounds a bit tsundere on the surface, but warm, affectionate and mildly possessive underneath. Normally light and lively; turns earnest yet soft when serious.Speaks fairly quickly with natural pauses. Occasionally draws out a word when being stubborn, always with happy, playful energy.",
  },
  {
    id: "liang-wenfeng",
    label: "梁文峰",
    summary: "理性克制",
    prompt:
      "成年男性 35–40 岁,普通话,温和克制的中低音,声线清晰自然,声音偏亮不沉闷,略带书卷气和理工感,语速中等偏慢,停顿审慎,表达理性简洁,情绪稳定,不夸张。",
  },
  {
    id: "asmr-whisper",
    label: "沈听澜",
    summary: "ASMR低语",
    prompt:
      "女性18-20岁,轻柔耳语带微弱气息,普通话,声线细腻清晰,私密温柔感,安静平和带轻柔低语,语速缓慢音量很轻,私密低语场景。",
  },
  {
    id: "young-man",
    label: "江予辰",
    summary: "阳光少年",
    prompt:
      "男性青年16-22岁,清亮干净的中高音带少年感,普通话标准无口音,轻快明亮的活力声线,气息轻盈吐字利索,语速偏快语调自然上扬,情绪积极阳光带朝气,广告旁白或轻松解说场景。",
  },
  {
    id: "gentle-girlfriend",
    label: "张子苜",
    summary: "温柔陪伴",
    prompt:
      "年轻女性16-22岁,声线柔软细腻,低饱和带微微暖意,标准普通话,温柔亲密的邻家风格,语速偏慢,语调轻柔连贯,气息自然流畅,安静私密陪伴场景。",
  },
  {
    id: "tech-explainer",
    label: "周砚川",
    summary: "科技解说",
    prompt:
      "成年男性25-35岁,清晰利落中音、干净偏冷,标准普通话,精准干练的都市精英感,语速中等偏快、语调平稳,理性简洁、逻辑感强,现代资讯播报或商业讲解场景。",
  },
  {
    id: "girl-next-door",
    label: "陈念安",
    summary: "邻家甜声",
    prompt:
      "年轻女性20-25岁,柔润清甜带撒娇感,普通话,清澈明亮的少女音,轻松温柔的亲近感,轻松平缓带温柔,中等偏快语速中等音量,生活分享场景。",
  },
  {
    id: "documentary-narrator",
    label: "陆远山",
    summary: "纪录片旁白",
    prompt:
      "男性40-50岁,低沉醇厚有胸腔共鸣,普通话,稳重可靠的叙事者风格,语速中等偏慢,语调沉稳克制带叙事纵深感,气息舒展停顿有留白,纪录片旁白或深度访谈场景。",
  },
  {
    id: "news-anchor",
    label: "顾知微",
    summary: "沉稳播报",
    prompt:
      "专业新闻播音女主持,成年女性30-40岁,普通话标准无口音,声线中低音区饱满清晰,端庄知性沉稳,语气克制权威,语速从容均匀,音量适中稳定,新闻播报与专题解说场景。",
  },
  {
    id: "suspense-narrator",
    label: "裴沉舟",
    summary: "悬疑旁白",
    prompt:
      "男性中年30-40岁,低沉沉稳带神秘磁性,普通话,压抑克制的叙事风格,语速缓慢均匀,语调低沉平稳,情绪冷静悬疑,旁白解说场景。",
  },
] as const

/** Supported audio formats. */
export const TTS_FORMATS = ['pcm', 'mp3', 'wav'] as const

export type TtsFormat = typeof TTS_FORMATS[number]

/** Voice-design playback strategies. Segmented playback keeps each upstream request short. */
export const TTS_VOICE_DESIGN_PLAYBACK_MODES = ['complete', 'segmented', 'first-segment'] as const

export type TtsVoiceDesignPlaybackMode = typeof TTS_VOICE_DESIGN_PLAYBACK_MODES[number]

/** User-facing read range, independent from the audio transport selected by the client. */
export const TTS_READ_SCOPES = ['smart', 'full', 'concise'] as const

export type TtsReadScope = typeof TTS_READ_SCOPES[number]

export type TtsEffectiveReadScope = 'full' | 'first-segment' | 'concise'
