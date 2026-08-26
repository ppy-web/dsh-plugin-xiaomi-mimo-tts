/** Settings namespace used by the Host and Web client. */
export declare const TTS_SETTINGS_NAMESPACE = "xiaomi-mimo-tts";
/** Same-origin route used by the Web client to request synthesized audio. */
export declare const TTS_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize";
/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
export declare const TTS_STREAM_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize-stream";
/** Same-origin prefix used by the Web client to load voice-design preset icons. */
export declare const TTS_VOICE_DESIGN_ASSET_ROUTE = "/plugins/xiaomi-mimo-tts/voice-presets";
/** Supported built-in Xiaomi MiMo voices. */
export declare const TTS_VOICES: readonly ["冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"];
/** TTS models supported by this plugin. */
export declare const TTS_MODELS: readonly ["mimo-v2.5-tts", "mimo-v2.5-tts-voicedesign"];
export type TtsModel = typeof TTS_MODELS[number];
/** Voice-design descriptions adapted from the reference voice-definition page. */
export declare const TTS_VOICE_DESIGN_PRESETS: readonly [{
    readonly id: "energetic-girl";
    readonly label: "林小满";
    readonly summary: "女 · 16岁 · 元气少女，明亮高饱和声线";
    readonly prompt: "年轻女性15-20岁，普通话，明亮高饱和声线，笑意自然外放，咬字灵巧跳跃，语速偏快，语调上扬有活力，情绪积极爽朗，活力播报风格";
}, {
    readonly id: "asmr-whisper";
    readonly label: "沈听澜";
    readonly summary: "女 · 19岁 · ASMR低语，轻柔耳语带微弱气息";
    readonly prompt: "女性18-20岁，轻柔耳语带微弱气息，普通话，声线细腻清晰，私密温柔感，安静平和带轻柔低语，语速缓慢音量很轻，私密低语场景。";
}, {
    readonly id: "gentle-girlfriend";
    readonly label: "张子莯";
    readonly summary: "女 · 22岁 · 温柔女友，声线柔软细腻";
    readonly prompt: "年轻女性16-22岁，声线柔软细腻，低饱和带微微暖意，标准普通话，温柔亲密的邻家风格，语速偏慢，语调轻柔连贯，气息自然流畅，安静私密陪伴场景。";
}, {
    readonly id: "girl-next-door";
    readonly label: "陈念安";
    readonly summary: "女 · 25岁 · 邻家女孩，柔润清甜带撒娇感";
    readonly prompt: "年轻女性20-25岁，柔润清甜带撒娇感，普通话，清澈明亮的少女音，轻松温柔的亲近感，轻松平缓带温柔，中等偏快语速中等音量，生活分享场景。";
}, {
    readonly id: "news-anchor";
    readonly label: "顾知微";
    readonly summary: "女 · 35岁 · 新闻播报，声线中低音区饱满清晰";
    readonly prompt: "专业新闻播音女主持，成年女性30-40岁，普通话标准无口音，声线中低音区饱满清晰，端庄知性沉稳，语气克制权威，语速从容均匀，音量适中稳定，新闻播报与专题解说场景。";
}, {
    readonly id: "young-man";
    readonly label: "江予辰";
    readonly summary: "男 · 19岁 · 青年男声，清亮干净的中高音带少年感";
    readonly prompt: "男性青年16-22岁，清亮干净的中高音带少年感，普通话标准无口音，轻快明亮的活力声线，气息轻盈吐字利索，语速偏快语调自然上扬，情绪积极阳光带朝气，广告旁白或轻松解说场景。";
}, {
    readonly id: "tech-explainer";
    readonly label: "周砚川";
    readonly summary: "男 · 30岁 · 科技解说，清晰利落中音、干净偏冷";
    readonly prompt: "成年男性25-35岁，清晰利落中音、干净偏冷，标准普通话，精准干练的都市精英感，语速中等偏快、语调平稳，理性简洁、逻辑感强，现代资讯播报或商业讲解场景。";
}, {
    readonly id: "suspense-narrator";
    readonly label: "裴沉舟";
    readonly summary: "男 · 35岁 · 悬疑旁白，低沉沉稳带神秘磁性";
    readonly prompt: "男性中年30-40岁，低沉沉稳带神秘磁性，普通话，压抑克制的叙事风格，语速缓慢均匀，语调低沉平稳，情绪冷静悬疑，旁白解说场景。";
}, {
    readonly id: "documentary-narrator";
    readonly label: "陆远山";
    readonly summary: "男 · 45岁 · 纪录片，低沉醇厚有胸腔共鸣";
    readonly prompt: "男性40-50岁，低沉醇厚有胸腔共鸣，普通话，稳重可靠的叙事者风格，语速中等偏慢，语调沉稳克制带叙事纵深感，气息舒展停顿有留白，纪录片旁白或深度访谈场景。";
}];
/** Supported audio formats. */
export declare const TTS_FORMATS: readonly ["mp3", "wav"];
export type TtsFormat = typeof TTS_FORMATS[number];
/** Minimum spoken characters to accumulate before starting one PCM stream request. */
export declare const MIN_TTS_STREAM_CHARACTERS = 20;
/**
 * Prepare assistant text for speech synthesis without changing the chat transcript.
 *
 * @param value Raw assistant text or Markdown-derived text.
 * @returns Text with non-speech content removed and punctuation normalized.
 */
export declare function prepareTtsText(value: string): string;
/** Split an accumulated model delta at completed sentence-ending punctuation. */
export declare function splitCompletedTtsSentences(value: string): {
    sentences: string[];
    remainder: string;
};
/** Count text-bearing characters only, excluding punctuation and whitespace. */
export declare function countTtsSpeechCharacters(value: string): number;
/** Accumulate short sentences so a PCM stream has enough text to sound natural. */
export declare function batchTtsStreamText(pending: string, next: string, flush: boolean): {
    pending: string;
    request: string | null;
};
/** Parse complete SSE records while retaining the final partial record for the next network chunk. */
export declare function parseSseRecords(value: string): {
    events: string[];
    remainder: string;
};
export interface LiveSpeechCursor {
    sessionId: string;
    turn: number;
    step: number;
}
export type LiveSpeechTransition = 'same-step' | 'same-turn' | 'new-turn';
/** Decide whether a live assistant update extends one message, advances within a turn, or starts a new turn. */
export declare function classifyLiveSpeechTransition(current: LiveSpeechCursor | null, next: LiveSpeechCursor): LiveSpeechTransition;
/** Serializes sentence requests and makes cancellation independent from the playback backend. */
export interface AbortableSentenceQueueOptions {
    onBusyChange?: (busy: boolean) => void;
    onError?: (error: unknown) => void;
}
export declare class AbortableSentenceQueue {
    private readonly start;
    private readonly options;
    private readonly pending;
    private current;
    private revision;
    private busy;
    constructor(start: (sentence: string, signal: AbortSignal) => Promise<void>, options?: AbortableSentenceQueueOptions);
    enqueue(sentence: string): void;
    cancel(): void;
    private pump;
    private setBusy;
}
export interface TtsSettings {
    enabled?: boolean;
    apiKey?: string;
    baseURL?: string;
    model?: TtsModel;
    voice?: string;
    voiceDesignPrompt?: string;
    voiceDesignCustomPrompt?: string;
    presetStylePrompt?: string;
    format?: TtsFormat;
    autoPlay?: boolean;
    instruction?: string;
    maxTextLength?: number;
    requestTimeoutMs?: number;
}
export interface ResolvedTtsSettings {
    enabled: boolean;
    apiKey: string;
    baseURL: string;
    model: TtsModel;
    voice: string;
    voiceDesignPrompt: string;
    voiceDesignCustomPrompt: string;
    presetStylePrompt: string;
    format: TtsFormat;
    autoPlay: boolean;
    instruction: string;
    maxTextLength: number;
    requestTimeoutMs: number;
}
/** Defaults shared by the Schemastery config and the Web settings form. */
export declare const DEFAULT_TTS_SETTINGS: ResolvedTtsSettings;
/** Resolve an optional settings snapshot into the values used by the form. */
export declare function resolveTtsSettings(value: TtsSettings | undefined): ResolvedTtsSettings;
//# sourceMappingURL=shared.d.ts.map