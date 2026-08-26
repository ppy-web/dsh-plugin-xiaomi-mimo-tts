//#region src/shared.ts
/** Settings namespace used by the Host and Web client. */
const TTS_SETTINGS_NAMESPACE = "xiaomi-mimo-tts";
/** Same-origin route used by the Web client to request synthesized audio. */
const TTS_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize";
/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
const TTS_STREAM_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize-stream";
/** Same-origin prefix used by the Web client to load voice-design preset icons. */
const TTS_VOICE_DESIGN_ASSET_ROUTE = "/plugins/xiaomi-mimo-tts/voice-presets";
/** Supported built-in Xiaomi MiMo voices. */
const TTS_VOICES = [
	"冰糖",
	"茉莉",
	"苏打",
	"白桦",
	"Mia",
	"Chloe",
	"Milo",
	"Dean"
];
/** TTS models supported by this plugin. */
const TTS_MODELS = ["mimo-v2.5-tts", "mimo-v2.5-tts-voicedesign"];
/** Voice-design descriptions adapted from the reference voice-definition page. */
const TTS_VOICE_DESIGN_PRESETS = [
	{
		id: "energetic-girl",
		label: "林小满",
		summary: "女 · 16岁 · 元气少女，明亮高饱和声线",
		prompt: "年轻女性15-20岁，普通话，明亮高饱和声线，笑意自然外放，咬字灵巧跳跃，语速偏快，语调上扬有活力，情绪积极爽朗，活力播报风格"
	},
	{
		id: "asmr-whisper",
		label: "沈听澜",
		summary: "女 · 19岁 · ASMR低语，轻柔耳语带微弱气息",
		prompt: "女性18-20岁，轻柔耳语带微弱气息，普通话，声线细腻清晰，私密温柔感，安静平和带轻柔低语，语速缓慢音量很轻，私密低语场景。"
	},
	{
		id: "gentle-girlfriend",
		label: "张子莯",
		summary: "女 · 22岁 · 温柔女友，声线柔软细腻",
		prompt: "年轻女性16-22岁，声线柔软细腻，低饱和带微微暖意，标准普通话，温柔亲密的邻家风格，语速偏慢，语调轻柔连贯，气息自然流畅，安静私密陪伴场景。"
	},
	{
		id: "girl-next-door",
		label: "陈念安",
		summary: "女 · 25岁 · 邻家女孩，柔润清甜带撒娇感",
		prompt: "年轻女性20-25岁，柔润清甜带撒娇感，普通话，清澈明亮的少女音，轻松温柔的亲近感，轻松平缓带温柔，中等偏快语速中等音量，生活分享场景。"
	},
	{
		id: "news-anchor",
		label: "顾知微",
		summary: "女 · 35岁 · 新闻播报，声线中低音区饱满清晰",
		prompt: "专业新闻播音女主持，成年女性30-40岁，普通话标准无口音，声线中低音区饱满清晰，端庄知性沉稳，语气克制权威，语速从容均匀，音量适中稳定，新闻播报与专题解说场景。"
	},
	{
		id: "young-man",
		label: "江予辰",
		summary: "男 · 19岁 · 青年男声，清亮干净的中高音带少年感",
		prompt: "男性青年16-22岁，清亮干净的中高音带少年感，普通话标准无口音，轻快明亮的活力声线，气息轻盈吐字利索，语速偏快语调自然上扬，情绪积极阳光带朝气，广告旁白或轻松解说场景。"
	},
	{
		id: "tech-explainer",
		label: "周砚川",
		summary: "男 · 30岁 · 科技解说，清晰利落中音、干净偏冷",
		prompt: "成年男性25-35岁，清晰利落中音、干净偏冷，标准普通话，精准干练的都市精英感，语速中等偏快、语调平稳，理性简洁、逻辑感强，现代资讯播报或商业讲解场景。"
	},
	{
		id: "suspense-narrator",
		label: "裴沉舟",
		summary: "男 · 35岁 · 悬疑旁白，低沉沉稳带神秘磁性",
		prompt: "男性中年30-40岁，低沉沉稳带神秘磁性，普通话，压抑克制的叙事风格，语速缓慢均匀，语调低沉平稳，情绪冷静悬疑，旁白解说场景。"
	},
	{
		id: "documentary-narrator",
		label: "陆远山",
		summary: "男 · 45岁 · 纪录片，低沉醇厚有胸腔共鸣",
		prompt: "男性40-50岁，低沉醇厚有胸腔共鸣，普通话，稳重可靠的叙事者风格，语速中等偏慢，语调沉稳克制带叙事纵深感，气息舒展停顿有留白，纪录片旁白或深度访谈场景。"
	}
];
/** Supported audio formats. */
const TTS_FORMATS = ["mp3", "wav"];
/** Minimum spoken characters to accumulate before starting one PCM stream request. */
const MIN_TTS_STREAM_CHARACTERS = 20;
const TTS_PUNCTUATION = {
	"，": ",",
	"。": ".",
	"！": "!",
	"？": "?",
	"；": ";",
	"、": ",",
	"（": ",",
	"）": ",",
	"　": " "
};
/** Decorative punctuation can make TTS emit non-speech artifacts, so omit it entirely. */
const TTS_NON_SPEECH_PUNCTUATION = /[()\[\]【】［］〔〕〖〗{}｛｝「」『』《》〈〉“”‘’"'`<>：…—–－～]/gu;
const TTS_URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|cn|net|org|io|ai|dev|me|co|edu|gov|xyz|tech|info|app|site|link)(?:[/:?#][^\s<>()]*)?/giu;
const TTS_WINDOWS_PATH_PATTERN = /(?:\b[A-Za-z]:[\\/]|\\\\)(?:[A-Za-z0-9._ -]+[\\/])*(?:[A-Za-z0-9._ -]+)/gu;
const TTS_UNIX_PATH_PATTERN = /\/(?:[A-Za-z0-9._-]+\/)*(?:[A-Za-z0-9._-]+)/gu;
const TTS_RELATIVE_PATH_PATTERN = /(?:\.\.?[\\/])(?:[A-Za-z0-9._-]+[\\/])*(?:[A-Za-z0-9._-]+(?:\.[A-Za-z0-9_-]+)?)/gu;
const TTS_PROJECT_PATH_PATTERN = /\b(?:[A-Za-z0-9_-]+[\\/])+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu;
function removeTtsPaths(value) {
	return value.replace(TTS_WINDOWS_PATH_PATTERN, " ").replace(TTS_RELATIVE_PATH_PATTERN, " ").replace(TTS_PROJECT_PATH_PATTERN, " ").replace(TTS_UNIX_PATH_PATTERN, " ");
}
function removeTtsMarkup(value) {
	let text = value.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ").replace(/(^|\n)(?: {4}|\t)[^\n]*(?=\n|$)/g, "$1").replace(/!\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g, " ").replace(/\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g, "$1").replace(/<[^>\r\n]*>/g, " ").replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1").replace(/(^|\n)\s*(?:[-*+]|\d+[.)])\s+/g, "$1").replace(/(^|\n)\s*>\s?/g, "$1").replace(/`+/g, "").replace(/[*_~]{1,3}/g, "").replace(/[|]/g, " ");
	text = text.replace(TTS_URL_PATTERN, " ");
	return removeTtsPaths(text);
}
function removeTtsSymbols(value) {
	return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g, " ").replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{So}|\uFE0E|\uFE0F|\u200D|\u20E3)/gu, " ");
}
function normalizeTtsPunctuation(value) {
	return value.replace(TTS_NON_SPEECH_PUNCTUATION, "").replace(/[，。！？；、（）　]/gu, (character) => TTS_PUNCTUATION[character] ?? character).replace(/(^|\s)[,;:!?]+(?=\s|$)/g, "$1").replace(/([,;:])\s*([.!?])/g, "$2").replace(/\s+([,.;:!?])/g, "$1");
}
/**
* Prepare assistant text for speech synthesis without changing the chat transcript.
*
* @param value Raw assistant text or Markdown-derived text.
* @returns Text with non-speech content removed and punctuation normalized.
*/
function prepareTtsText(value) {
	if (value.length === 0) return "";
	return normalizeTtsPunctuation(removeTtsSymbols(removeTtsMarkup(value).replace(/\\[rn]|\/n/gi, " ").replace(/\r\n?|\n/g, "."))).replace(/\s+/g, " ").trim();
}
/** Split an accumulated model delta at completed sentence-ending punctuation. */
function splitCompletedTtsSentences(value) {
	const sentences = [];
	const boundary = /[。！？!?；;\n]+(?:[”’）】》〕\]}'"]*\s*)/gu;
	let start = 0;
	for (const match of value.matchAll(boundary)) {
		const end = match.index + match[0].length;
		sentences.push(value.slice(start, end));
		start = end;
	}
	return {
		sentences,
		remainder: value.slice(start)
	};
}
/** Count text-bearing characters only, excluding punctuation and whitespace. */
function countTtsSpeechCharacters(value) {
	return Array.from(value).filter((character) => /[\p{L}\p{N}]/u.test(character)).length;
}
/** Accumulate short sentences so a PCM stream has enough text to sound natural. */
function batchTtsStreamText(pending, next, flush) {
	const combined = `${pending}${next}`;
	if (countTtsSpeechCharacters(combined) >= MIN_TTS_STREAM_CHARACTERS || flush && combined.trim().length > 0) return {
		pending: "",
		request: combined
	};
	return {
		pending: combined,
		request: null
	};
}
/** Parse complete SSE records while retaining the final partial record for the next network chunk. */
function parseSseRecords(value) {
	const records = value.split(/\r?\n\r?\n/u);
	const remainder = records.pop() ?? "";
	return {
		events: records.map((record) => record.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")).filter((record) => record.length > 0),
		remainder
	};
}
/** Decide whether a live assistant update extends one message, advances within a turn, or starts a new turn. */
function classifyLiveSpeechTransition(current, next) {
	if (current === null || current.sessionId !== next.sessionId || current.turn !== next.turn) return "new-turn";
	return current.step === next.step ? "same-step" : "same-turn";
}
var AbortableSentenceQueue = class {
	pending = [];
	current = null;
	revision = 0;
	busy = false;
	constructor(start, options = {}) {
		this.start = start;
		this.options = options;
	}
	enqueue(sentence) {
		this.pending.push(sentence);
		this.setBusy(true);
		this.pump();
	}
	cancel() {
		this.revision += 1;
		this.pending.length = 0;
		this.current?.abort();
		this.current = null;
		this.setBusy(false);
	}
	async pump() {
		if (this.current !== null) return;
		const sentence = this.pending.shift();
		if (sentence === void 0) {
			this.setBusy(false);
			return;
		}
		const revision = this.revision;
		const controller = new AbortController();
		this.current = controller;
		try {
			await this.start(sentence, controller.signal);
		} catch (error) {
			if (!controller.signal.aborted && revision === this.revision) {
				this.pending.length = 0;
				this.revision += 1;
				this.options.onError?.(error);
			}
		} finally {
			if (this.current === controller) this.current = null;
			if (revision === this.revision) if (this.pending.length > 0) this.pump();
			else this.setBusy(false);
			else this.setBusy(false);
		}
	}
	setBusy(busy) {
		if (this.busy === busy) return;
		this.busy = busy;
		this.options.onBusyChange?.(busy);
	}
};
/** Defaults shared by the Schemastery config and the Web settings form. */
const DEFAULT_TTS_SETTINGS = {
	enabled: true,
	apiKey: "",
	baseURL: "https://api.xiaomimimo.com/v1",
	model: "mimo-v2.5-tts",
	voice: "冰糖",
	voiceDesignPrompt: "青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。",
	voiceDesignCustomPrompt: "青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。",
	presetStylePrompt: "使用清晰、自然、准确的声音朗读，语速适中，停顿自然，语气平和克制，避免夸张表达。",
	format: "mp3",
	autoPlay: true,
	instruction: "请忠实朗读原文，根据文本语气自然表达，不添加或改写内容。",
	maxTextLength: 12e3,
	requestTimeoutMs: 12e4
};
/** Resolve an optional settings snapshot into the values used by the form. */
function resolveTtsSettings(value) {
	const resolved = {
		...DEFAULT_TTS_SETTINGS,
		...value
	};
	const voiceDesignCustomPrompt = typeof value?.voiceDesignCustomPrompt === "string" ? value.voiceDesignCustomPrompt : TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === resolved.voiceDesignPrompt) ? DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt : resolved.voiceDesignPrompt;
	return {
		...resolved,
		voiceDesignCustomPrompt,
		autoPlay: resolved.enabled ? resolved.autoPlay : false
	};
}

//#endregion
export { resolveTtsSettings as _, TTS_MODELS as a, TTS_STREAM_ROUTE as c, TTS_VOICE_DESIGN_PRESETS as d, batchTtsStreamText as f, prepareTtsText as g, parseSseRecords as h, TTS_FORMATS as i, TTS_VOICES as l, countTtsSpeechCharacters as m, DEFAULT_TTS_SETTINGS as n, TTS_ROUTE as o, classifyLiveSpeechTransition as p, MIN_TTS_STREAM_CHARACTERS as r, TTS_SETTINGS_NAMESPACE as s, AbortableSentenceQueue as t, TTS_VOICE_DESIGN_ASSET_ROUTE as u, splitCompletedTtsSentences as v };