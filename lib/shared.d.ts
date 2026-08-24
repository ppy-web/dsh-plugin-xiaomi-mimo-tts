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
    readonly prompt: "元气少女音色，明亮、轻快、笑意明显，语速偏快，句尾灵动，适合轻松内容和年轻化短视频。";
}, {
    readonly label: "邻家女孩";
    readonly prompt: "年轻女性，声音甜美、软萌、亲近，语速轻快，带一点黏人感和撒娇气质，但保持清晰可懂，适合轻松日常、聊天向内容。";
}, {
    readonly label: "新闻播报";
    readonly prompt: "专业新闻播报音色，中性偏成熟，吐字标准，节奏平稳，情绪克制，适合公告、新闻和正式说明。";
}, {
    readonly label: "温柔客服";
    readonly prompt: "温柔客服女声，亲切、耐心、清晰，语速适中，句尾轻微上扬，听起来可靠且不机械。";
}, {
    readonly label: "温柔女友";
    readonly prompt: "年轻女性，声音温柔、柔软、低饱和，语速偏慢，带轻微耳语感和亲密感，适合情感、治愈和晚间陪伴内容。";
}, {
    readonly label: "ASMR低语";
    readonly prompt: "年轻女性，声音极度轻柔，像在耳边说话，呼吸感明显，语速慢，适合哄睡、放松和沉浸式内容。";
}, {
    readonly label: "少年感男声";
    readonly prompt: "年轻男性，声音干净明亮，有少年感，语速略快，语气轻松自然，适合短视频口播和产品介绍。";
}, {
    readonly label: "纪录片男声";
    readonly prompt: "成熟男性，低沉稳重，气息稳定，语速中等偏慢，像纪录片旁白，带一点故事感但不过分夸张。";
}, {
    readonly label: "古风说书男声";
    readonly prompt: "古风说书人音色，成熟、有韵味，语速从容，语调起伏带叙事感，适合历史、武侠和传统故事。";
}, {
    readonly label: "科技解说男声";
    readonly prompt: "清晰、理性、现代，语速中等偏快，语气专业但不生硬，适合产品演示和技术说明。";
}, {
    readonly label: "电台夜谈男声";
    readonly prompt: "电台夜谈男声，温暖、低缓、松弛，带轻微气声，语速偏慢，适合情感电台、睡前故事和长篇陪伴内容。";
}, {
    readonly label: "悬疑旁白男声";
    readonly prompt: "悬疑故事旁白，声线偏低，语速克制，停顿明显，带一点紧张感和神秘感，适合悬疑、案件和氛围叙述。";
}];
/** Supported audio formats. */
export declare const TTS_FORMATS: readonly ["mp3", "wav"];
export type TtsFormat = typeof TTS_FORMATS[number];
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
/** Parse complete SSE records while retaining the final partial record for the next network chunk. */
export declare function parseSseRecords(value: string): {
    events: string[];
    remainder: string;
};
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