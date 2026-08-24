//#region src/shared.ts
/** Settings namespace used by the Host and Web client. */
const TTS_SETTINGS_NAMESPACE = "xiaomi-mimo-tts";
/** Same-origin route used by the Web client to request synthesized audio. */
const TTS_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize";
/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
const TTS_STREAM_ROUTE = "/plugins/xiaomi-mimo-tts/synthesize-stream";
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
		label: "元气少女",
		prompt: "年轻女性，明亮高饱和声线，笑意自然外放，咬字灵巧，语速偏快，语调跳跃有活力，情绪积极爽朗。"
	},
	{
		label: "邻家女孩",
		prompt: "年轻女性，声线柔润清甜，亲近自然不过分撒娇，吐字清晰，语速中等偏快，语调轻松平缓，带一点温柔的生活感。"
	},
	{
		label: "新闻播报",
		prompt: "专业播音女主持音色，成年女性，端庄知性，中低音区稳定饱满，普通话标准，咬字利落，节奏从容，情绪克制而有权威感。"
	},
	{
		label: "温柔客服",
		prompt: "成年女性，音色温暖明净，亲切耐心，吐字柔和清楚，语速适中，句尾轻微上扬，始终保持可靠、专注的服务感。"
	},
	{
		label: "温柔女友",
		prompt: "年轻女性，声线柔软细腻，低饱和且带微微暖意，气息自然，语速偏慢，语调轻柔连贯，亲密但不黏腻。"
	},
	{
		label: "ASMR低语",
		prompt: "年轻女性，贴耳低语感，音量轻而集中，气息细微可感，辅音柔化，语速缓慢，停顿松弛，营造安静私密感。"
	},
	{
		label: "少年感男声",
		prompt: "年轻男性，清亮干净的中高音，气息轻盈，吐字利索，语速偏快，语调自然上扬，带一点未经世故的朝气。"
	},
	{
		label: "纪录片男声",
		prompt: "成熟男性，低沉醇厚，胸腔共鸣稳定，气息舒展，语速中等偏慢，停顿有留白，语调沉稳克制，带叙事纵深感。"
	},
	{
		label: "古风说书男声",
		prompt: "成熟男性，浑厚略带沙感，咬字圆润，行腔从容，语速偏慢，抑扬有致但不戏曲化，带阅历感与从容幽默。"
	},
	{
		label: "科技解说男声",
		prompt: "成年男性，清晰利落的中音，音色干净偏冷，吐字精准，语速中等偏快，逻辑感强，情绪理性、简洁而有现代感。"
	},
	{
		label: "电台夜谈男声",
		prompt: "成熟男性，温暖低缓，带轻微磁性和松弛气声，语速偏慢，语调贴近耳边但不过度低语，情绪包容安定。"
	},
	{
		label: "悬疑旁白男声",
		prompt: "成熟男性，偏低沉的冷感声线，气息收敛，语速缓慢，停顿明确，语调压低并保留细微起伏，带克制的紧张感。"
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
	"　": " "
};
/** Decorative punctuation can make TTS emit non-speech artifacts, so omit it entirely. */
const TTS_NON_SPEECH_PUNCTUATION = /[()（）\[\]【】［］〔〕〖〗{}｛｝「」『』《》〈〉“”‘’"'`<>：:…—–－～]/gu;
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
	return value.replace(TTS_NON_SPEECH_PUNCTUATION, "").replace(/[，。！？；、　]/gu, (character) => TTS_PUNCTUATION[character] ?? character).replace(/(^|\s)[,;:!?]+(?=\s|$)/g, "$1").replace(/([,;:])\s*([.!?])/g, "$2").replace(/\s+([,.;:!?])/g, "$1");
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
/** Serializes sentence requests and makes cancellation independent from the playback backend. */
var AbortableSentenceQueue = class {
	pending = [];
	current = null;
	revision = 0;
	constructor(start) {
		this.start = start;
	}
	enqueue(sentence) {
		this.pending.push(sentence);
		this.pump();
	}
	cancel() {
		this.revision += 1;
		this.pending.length = 0;
		this.current?.abort();
		this.current = null;
	}
	async pump() {
		if (this.current !== null) return;
		const sentence = this.pending.shift();
		if (sentence === void 0) return;
		const revision = this.revision;
		const controller = new AbortController();
		this.current = controller;
		try {
			await this.start(sentence, controller.signal);
		} catch (error) {
			if (!controller.signal.aborted) throw error;
		} finally {
			if (this.current === controller) this.current = null;
			if (revision === this.revision) this.pump();
		}
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
	presetStylePrompt: "使用清晰自然的普通话朗读，可带轻微湖南语感，但不影响清晰度。整体声线清冷、克制，略带距离感；发声收敛，气息自然，语速中等偏快，句间停顿干脆。仅在情绪关键词处轻微延长尾音，避免夸张、戏剧化或过度气声。",
	format: "mp3",
	autoPlay: true,
	instruction: "咬字清楚，普通话里能听出一点湖南口音，轻音和翘舌会稍微有点自己的味道。说话时喉咙有点紧，气息不算特别足，所以听起来会有一点“冷”和“端着”的感觉，中等偏快，句子断得干脆，偶尔会拖长音。情绪底色偏理性、克制，像隔着一层玻璃说话。",
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
export { TTS_MODELS as a, TTS_STREAM_ROUTE as c, batchTtsStreamText as d, countTtsSpeechCharacters as f, splitCompletedTtsSentences as g, resolveTtsSettings as h, TTS_FORMATS as i, TTS_VOICES as l, prepareTtsText as m, DEFAULT_TTS_SETTINGS as n, TTS_ROUTE as o, parseSseRecords as p, MIN_TTS_STREAM_CHARACTERS as r, TTS_SETTINGS_NAMESPACE as s, AbortableSentenceQueue as t, TTS_VOICE_DESIGN_PRESETS as u };