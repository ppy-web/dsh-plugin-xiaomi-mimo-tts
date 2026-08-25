/** Settings namespace used by the Host and Web client. */
export declare const TTS_SETTINGS_NAMESPACE = "xiaomi-mimo-tts";
/** Same-origin route used by the Web client to request synthesized audio. */
export declare const TTS_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize";
/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
export declare const TTS_STREAM_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize-stream";
/** Supported built-in Xiaomi MiMo voices. */
export declare const TTS_VOICES: readonly ["冰糖", "茉莉", "苏打", "白桦", "Mia", "Chloe", "Milo", "Dean"];
/** TTS models supported by this plugin. */
export declare const TTS_MODELS: readonly ["mimo-v2.5-tts", "mimo-v2.5-tts-voicedesign"];
export type TtsModel = typeof TTS_MODELS[number];
/** Voice-design descriptions adapted from the reference voice-definition page. */
export declare const TTS_VOICE_DESIGN_PRESETS: readonly [{
    readonly label: "元气少女";
    readonly prompt: "年轻女性，明亮高饱和声线，笑意自然外放，咬字灵巧，语速偏快，语调跳跃有活力，情绪积极爽朗。";
}, {
    readonly label: "邻家女孩";
    readonly prompt: "年轻女性，声线柔润清甜，亲近自然不过分撒娇，吐字清晰，语速中等偏快，语调轻松平缓，带一点温柔的生活感。";
}, {
    readonly label: "新闻播报";
    readonly prompt: "专业播音女主持音色，成年女性，端庄知性，中低音区稳定饱满，普通话标准，咬字利落，节奏从容，情绪克制而有权威感。";
}, {
    readonly label: "温柔客服";
    readonly prompt: "成年女性，音色温暖明净，亲切耐心，吐字柔和清楚，语速适中，句尾轻微上扬，始终保持可靠、专注的服务感。";
}, {
    readonly label: "温柔女友";
    readonly prompt: "年轻女性，声线柔软细腻，低饱和且带微微暖意，气息自然，语速偏慢，语调轻柔连贯，亲密但不黏腻。";
}, {
    readonly label: "ASMR低语";
    readonly prompt: "年轻女性，贴耳低语感，音量轻而集中，气息细微可感，辅音柔化，语速缓慢，停顿松弛，营造安静私密感。";
}, {
    readonly label: "少年感男声";
    readonly prompt: "年轻男性，清亮干净的中高音，气息轻盈，吐字利索，语速偏快，语调自然上扬，带一点未经世故的朝气。";
}, {
    readonly label: "纪录片男声";
    readonly prompt: "成熟男性，低沉醇厚，胸腔共鸣稳定，气息舒展，语速中等偏慢，停顿有留白，语调沉稳克制，带叙事纵深感。";
}, {
    readonly label: "古风说书男声";
    readonly prompt: "成熟男性，浑厚略带沙感，咬字圆润，行腔从容，语速偏慢，抑扬有致但不戏曲化，带阅历感与从容幽默。";
}, {
    readonly label: "科技解说男声";
    readonly prompt: "成年男性，清晰利落的中音，音色干净偏冷，吐字精准，语速中等偏快，逻辑感强，情绪理性、简洁而有现代感。";
}, {
    readonly label: "电台夜谈男声";
    readonly prompt: "成熟男性，温暖低缓，带轻微磁性和松弛气声，语速偏慢，语调贴近耳边但不过度低语，情绪包容安定。";
}, {
    readonly label: "悬疑旁白男声";
    readonly prompt: "成熟男性，偏低沉的冷感声线，气息收敛，语速缓慢，停顿明确，语调压低并保留细微起伏，带克制的紧张感。";
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
export declare class AbortableSentenceQueue {
    private readonly start;
    private readonly pending;
    private current;
    private revision;
    constructor(start: (sentence: string, signal: AbortSignal) => Promise<void>);
    enqueue(sentence: string): void;
    cancel(): void;
    private pump;
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