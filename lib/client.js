window.__ModuleLoader__.load({ id: "dsh-xiaomi-tts", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
let react = require("react");
react = __toESM(react);
let __deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
__deepseek_ai_dsh_client_ui_primitives = __toESM(__deepseek_ai_dsh_client_ui_primitives);
let react_jsx_runtime = require("react/jsx-runtime");
react_jsx_runtime = __toESM(react_jsx_runtime);

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
/** Decide whether a live assistant update extends one message, advances within a turn, or starts a new turn. */
function classifyLiveSpeechTransition(current, next) {
	if (current === null || current.sessionId !== next.sessionId || current.turn !== next.turn) return "new-turn";
	return current.step === next.step ? "same-step" : "same-turn";
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
//#region src/client/index.tsx
/** Client services required by this plugin. */
const inject = [
	"slots",
	"locale",
	"connection",
	"remote",
	"settingsScope"
];
const NS = "xiaomi-mimo-tts";
const zh = {
	"action.play": "朗读回复",
	"action.pause": "暂停朗读",
	"action.resume": "继续朗读",
	"action.loading": "正在生成语音",
	"action.retry": "重新生成语音",
	"error.noText": "这条回复没有可朗读的正文。",
	"error.request": "语音生成失败。",
	"error.play": "浏览器阻止了自动播放，请点击朗读按钮。",
	"settings.title": "语音朗读 (Xiaomi MiMo)",
	"settings.description": "在助手回复操作栏中使用 Xiaomi MiMo TTS 生成并播放语音。",
	"settings.enabled": "显示朗读按钮",
	"settings.enabledHint": "关闭后不会在助手回复操作栏显示朗读按钮，也不会自动播报。",
	"settings.apiKey": "API Key",
	"settings.apiKeyHint": "密钥保存在 DSH 设置文件中，传到浏览器前会被脱敏。",
	"settings.apiKeyStatus": "只有输入新值并保存时才会替换现有密钥。",
	"settings.apiKeyConfigured": "已配置",
	"settings.getApiKey": "获取 API Key",
	"settings.autoPlay": "开启自动播报",
	"settings.autoPlayHint": "开启时会同步显示朗读按钮；浏览器也可能拒绝自动播放。",
	"settings.model": "TTS 模型",
	"settings.presetModel": "预置音色模型 (mimo-v2.5-tts)",
	"settings.voiceDesignModel": "自定义音色模型 (mimo-v2.5-tts-voicedesign)",
	"settings.modelAutoPlayHintPreset": "预置音色模型支持实时流式播放。",
	"settings.modelAutoPlayHintVoiceDesign": "自定义音色仅支持在回复完成后自动播放。",
	"settings.voice": "内置音色",
	"settings.voiceDesignPrompt": "自定义音色描述",
	"settings.customVoiceOption": "自定义",
	"settings.customVoiceSummary": "手动编写音色描述",
	"settings.voiceDesignPromptHint": "按“年龄段 + 性别、声音质感、语速节奏、情绪底色”描述声音本身；不写场景或动作。",
	"settings.format": "音频格式",
	"settings.save": "保存",
	"settings.saving": "保存中…",
	"settings.saved": "已保存",
	"settings.unsaved": "未保存",
	"settings.overridden": "已覆盖",
	"settings.reset": "恢复默认",
	"settings.discard": "放弃修改",
	"settings.failed": "保存失败，请重试。",
	"settings.readOnly": "当前 DSH 设置为只读。",
	"settings.secretPlaceholder": "输入新的 Xiaomi MiMo API Key",
	"settings.expand": "展开设置",
	"settings.collapse": "收起设置"
};
const en = {
	"action.play": "Read aloud",
	"action.pause": "Pause speech",
	"action.resume": "Resume speech",
	"action.loading": "Generating speech",
	"action.retry": "Generate speech again",
	"error.noText": "This response has no readable body text.",
	"error.request": "Speech generation failed.",
	"error.play": "The browser blocked autoplay. Click Read aloud to play it.",
	"settings.title": "Text To Speech (Xiaomi MiMo)",
	"settings.description": "Generate and play Xiaomi MiMo TTS audio from assistant message actions.",
	"settings.enabled": "Show read-aloud button",
	"settings.enabledHint": "When disabled, the read-aloud button and automatic speech are both turned off.",
	"settings.apiKey": "API Key",
	"settings.apiKeyHint": "Stored in DSH settings and redacted before settings are sent to the browser.",
	"settings.apiKeyStatus": "An existing key changes only when you save a new value.",
	"settings.apiKeyConfigured": "Configured",
	"settings.getApiKey": "Get API Key",
	"settings.autoPlay": "Enable automatic read-aloud",
	"settings.autoPlayHint": "Enabling it also shows the read-aloud button; the browser may reject autoplay.",
	"settings.model": "TTS model",
	"settings.presetModel": "Preset voices (mimo-v2.5-tts)",
	"settings.voiceDesignModel": "Custom voice design (mimo-v2.5-tts-voicedesign)",
	"settings.modelAutoPlayHintPreset": "Preset voices support realtime streaming playback.",
	"settings.modelAutoPlayHintVoiceDesign": "Custom voice design supports automatic playback only after the reply is complete.",
	"settings.voice": "Built-in voice",
	"settings.voiceDesignPrompt": "Custom voice description",
	"settings.customVoiceOption": "Custom",
	"settings.customVoiceSummary": "Write a custom voice description",
	"settings.voiceDesignPromptHint": "Describe the voice itself with age/gender, texture, pace, and emotional baseline; avoid scenes or actions.",
	"settings.format": "Audio format",
	"settings.save": "Save",
	"settings.saving": "Saving…",
	"settings.saved": "Saved",
	"settings.unsaved": "Unsaved",
	"settings.overridden": "Overridden",
	"settings.reset": "Restore default",
	"settings.discard": "Discard changes",
	"settings.failed": "Save failed. Try again.",
	"settings.readOnly": "DSH settings are read-only.",
	"settings.secretPlaceholder": "Enter a new Xiaomi MiMo API key",
	"settings.expand": "Expand settings",
	"settings.collapse": "Collapse settings"
};
function isRecord(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
function decodeSettings(value) {
	if (!isRecord(value)) return void 0;
	const decoded = {};
	if (typeof value.enabled === "boolean") decoded.enabled = value.enabled;
	if (typeof value.apiKey === "string") decoded.apiKey = value.apiKey;
	if (typeof value.baseURL === "string") decoded.baseURL = value.baseURL;
	if (TTS_MODELS.includes(value.model)) decoded.model = value.model;
	if (typeof value.voice === "string") decoded.voice = value.voice;
	if (typeof value.voiceDesignPrompt === "string") decoded.voiceDesignPrompt = value.voiceDesignPrompt;
	if (typeof value.voiceDesignCustomPrompt === "string") decoded.voiceDesignCustomPrompt = value.voiceDesignCustomPrompt;
	if (value.format === "mp3" || value.format === "wav") decoded.format = value.format;
	if (typeof value.autoPlay === "boolean") decoded.autoPlay = value.autoPlay;
	if (typeof value.maxTextLength === "number") decoded.maxTextLength = value.maxTextLength;
	if (typeof value.requestTimeoutMs === "number") decoded.requestTimeoutMs = value.requestTimeoutMs;
	return decoded;
}
function useSettingsSnapshot(scope) {
	return (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot(), () => scope.getSnapshot());
}
function formatStartupError(error) {
	return error instanceof Error ? error.message : String(error);
}
function registerSlotContribution(ctx, name, register) {
	ctx.effect(() => {
		try {
			ctx.slots.inject(name, () => {
				try {
					return register();
				} catch (error) {
					ctx.logger.error(`dsh-xiaomi-tts: ${name} contribution disabled: ${formatStartupError(error)}`);
					return () => {};
				}
			});
		} catch (error) {
			ctx.logger.error(`dsh-xiaomi-tts: ${name} injection disabled: ${formatStartupError(error)}`);
		}
		return () => {};
	}, `xiaomi-mimo-tts: ${name}`);
}
function messageText(snapshot, messageId) {
	for (const node of snapshot.nodes) {
		if (node.kind !== "assistant" || node.messageId !== messageId) continue;
		return (0, __deepseek_ai_dsh_client_ui_primitives.extractMarkdownPlainText)(prepareTtsText(node.blocks.filter((block) => block.kind === "text").map((block) => block.text).join("\n\n"))).trim();
	}
	return "";
}
function messageTime(snapshot, messageId) {
	for (const node of snapshot.nodes) if (node.kind === "assistant" && node.messageId === messageId) return node.time;
	return null;
}
function latestAssistantMessageId(snapshot) {
	for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
		const node = snapshot.nodes[index];
		if (node?.kind === "assistant" && node.messageId !== void 0) return node.messageId;
	}
	return null;
}
function assistantText(blocks) {
	return blocks.filter((block) => block.kind === "text" && typeof block.text === "string").map((block) => block.text).join("\n\n");
}
function finalLiveMessage(snapshot, turn, step) {
	for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
		const node = snapshot.nodes[index];
		if (node?.kind === "assistant" && node.messageId !== void 0 && node.turn === turn && node.step === step) return {
			messageId: node.messageId,
			turn: node.turn,
			step: node.step,
			text: assistantText(node.blocks),
			interrupted: node.interrupted === true
		};
	}
	return null;
}
function messageLiveIdentity(snapshot, messageId) {
	for (const node of snapshot.nodes) if (node.kind === "assistant" && node.messageId === messageId) return {
		turn: node.turn,
		step: node.step
	};
	return null;
}
function pcmDeltaFromSse(data) {
	if (data === "[DONE]") return null;
	try {
		const pcm = JSON.parse(data).choices?.[0]?.delta?.audio?.data;
		return typeof pcm === "string" && pcm.length > 0 ? pcm : null;
	} catch {
		return null;
	}
}
var PcmAudioQueue = class {
	context = null;
	scheduledAt = 0;
	sources = /* @__PURE__ */ new Set();
	revision = 0;
	chain = Promise.resolve();
	constructor(onStateChange) {
		this.onStateChange = onStateChange;
	}
	enqueue(base64) {
		const revision = this.revision;
		this.chain = this.chain.then(() => this.schedule(base64, revision)).catch(() => {});
		return this.chain;
	}
	stop() {
		this.revision += 1;
		this.scheduledAt = 0;
		for (const source of this.sources) source.stop();
		this.sources.clear();
		this.onStateChange("idle");
	}
	pause() {
		if (this.context?.state === "running") {
			this.context.suspend();
			this.onStateChange("paused");
		}
	}
	resume() {
		if (this.context !== null && this.context.state !== "running") {
			this.context.resume();
			this.onStateChange("playing");
		}
	}
	async dispose() {
		this.stop();
		const context = this.context;
		this.context = null;
		if (context !== null && context.state !== "closed") await context.close();
	}
	async schedule(base64, revision) {
		if (revision !== this.revision) return;
		const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
		if (bytes.byteLength < 2) return;
		const context = this.getContext();
		if (context.state !== "running") await context.resume();
		if (revision !== this.revision) return;
		const sampleCount = Math.floor(bytes.byteLength / 2);
		const buffer = context.createBuffer(1, sampleCount, 24e3);
		const channel = buffer.getChannelData(0);
		const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		for (let index = 0; index < sampleCount; index += 1) channel[index] = pcm.getInt16(index * 2, true) / 32768;
		const source = context.createBufferSource();
		source.buffer = buffer;
		source.connect(context.destination);
		const startAt = Math.max(context.currentTime + .03, this.scheduledAt);
		this.scheduledAt = startAt + buffer.duration;
		this.sources.add(source);
		source.addEventListener("ended", () => {
			if (revision !== this.revision) return;
			this.sources.delete(source);
			if (this.sources.size === 0) this.onStateChange("idle");
		}, { once: true });
		source.start(startAt);
		this.onStateChange("playing");
	}
	getContext() {
		if (this.context === null) this.context = new AudioContext();
		return this.context;
	}
};
var LiveSpeechController = class {
	audio = new PcmAudioQueue((status) => this.setStatus(status));
	streamGeneration = 0;
	queue = this.createQueue();
	active = null;
	observed = "";
	consumed = 0;
	pendingText = "";
	handled = /* @__PURE__ */ new Set();
	messageId = null;
	status = "idle";
	sessionId = null;
	onStateChange = null;
	setStateChangeListener(listener) {
		this.onStateChange = listener;
	}
	activateSession(sessionId) {
		if (this.sessionId === sessionId) return;
		this.cancel();
		this.sessionId = sessionId;
	}
	deactivateSession(sessionId) {
		if (this.sessionId !== sessionId) return;
		this.cancel();
		this.sessionId = null;
	}
	observe(sessionId, turn, step, text) {
		if (this.sessionId !== sessionId) return;
		const next = {
			sessionId,
			turn,
			step
		};
		const transition = classifyLiveSpeechTransition(this.active, next);
		if (transition === "new-turn" || transition === "same-step" && !text.startsWith(this.observed)) this.reset(next);
		else if (transition === "same-turn") this.advanceSegment(next);
		this.observed = text;
		this.drain(false);
	}
	finish(sessionId, final) {
		const key = `${sessionId}:${final.turn}:${final.step}`;
		if (this.sessionId !== sessionId || this.active === null || this.cursorKey(this.active) !== key) return;
		if (final.interrupted) {
			this.cancelSession(sessionId);
			return;
		}
		if (final.text.startsWith(this.observed)) this.observed = final.text;
		this.messageId = final.messageId;
		this.reportStatus();
		this.drain(true);
		this.handled.add(key);
	}
	toggle(sessionId, messageId) {
		if (this.sessionId !== sessionId) return false;
		if (this.messageId !== messageId || this.status !== "playing" && this.status !== "paused") return false;
		if (this.status === "playing") this.audio.pause();
		else this.audio.resume();
		return true;
	}
	hasHandled(sessionId, identity) {
		return identity !== null && this.handled.has(`${sessionId}:${identity.turn}:${identity.step}`);
	}
	cancelSession(sessionId) {
		if (this.active?.sessionId === sessionId) this.cancel();
	}
	cancel() {
		this.replaceQueue();
		this.audio.stop();
		this.active = null;
		this.observed = "";
		this.consumed = 0;
		this.pendingText = "";
		this.messageId = null;
		this.status = "idle";
	}
	async dispose() {
		this.cancel();
		this.handled.clear();
		await this.audio.dispose();
	}
	reset(next) {
		this.replaceQueue();
		this.audio.stop();
		this.beginSegment(next);
		this.status = "idle";
	}
	advanceSegment(next) {
		this.drain(true);
		this.beginSegment(next);
	}
	beginSegment(next) {
		this.active = next;
		this.observed = "";
		this.consumed = 0;
		this.pendingText = "";
		this.messageId = null;
	}
	cursorKey(cursor) {
		return `${cursor.sessionId}:${cursor.turn}:${cursor.step}`;
	}
	drain(flush) {
		const { sentences, remainder } = splitCompletedTtsSentences(this.observed.slice(this.consumed));
		const ready = flush && remainder.trim().length > 0 ? [...sentences, remainder] : sentences;
		this.consumed += sentences.join("").length;
		if (flush) this.consumed = this.observed.length;
		for (const sentence of ready) this.stageSentence(sentence, false);
		if (flush) this.stageSentence("", true);
	}
	stageSentence(sentence, flush) {
		const text = (0, __deepseek_ai_dsh_client_ui_primitives.extractMarkdownPlainText)(prepareTtsText(sentence)).trim();
		const batch = batchTtsStreamText(this.pendingText, text, flush);
		this.pendingText = batch.pending;
		if (batch.request !== null) this.queue.enqueue(batch.request);
	}
	createQueue() {
		const generation = this.streamGeneration;
		return new AbortableSentenceQueue((sentence, signal) => this.stream(sentence, signal, generation));
	}
	replaceQueue() {
		this.streamGeneration += 1;
		this.queue.cancel();
		this.queue = this.createQueue();
	}
	isCurrentStream(generation, signal) {
		return generation === this.streamGeneration && !signal.aborted;
	}
	async stream(sentence, signal, generation) {
		if (!this.isCurrentStream(generation, signal)) return;
		this.setStatus("loading");
		try {
			const response = await fetch(TTS_STREAM_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text: sentence }),
				signal
			});
			if (!this.isCurrentStream(generation, signal)) return;
			if (!response.ok) throw new Error(`stream-request-${response.status}`);
			if (response.body === null) throw new Error("stream-response-empty");
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let pending = "";
			try {
				while (this.isCurrentStream(generation, signal)) {
					const result = await reader.read();
					if (result.done || !this.isCurrentStream(generation, signal)) break;
					pending += decoder.decode(result.value, { stream: true });
					const parsed = parseSseRecords(pending);
					pending = parsed.remainder;
					for (const event of parsed.events) {
						if (!this.isCurrentStream(generation, signal)) return;
						const pcm = pcmDeltaFromSse(event);
						if (pcm !== null) {
							await this.audio.enqueue(pcm);
							if (!this.isCurrentStream(generation, signal)) return;
						}
					}
				}
			} finally {
				reader.releaseLock();
			}
		} catch (error) {
			if (!this.isCurrentStream(generation, signal)) return;
			this.setStatus("error");
			throw error;
		}
	}
	setStatus(status) {
		this.status = status;
		this.reportStatus();
	}
	reportStatus() {
		if (this.sessionId !== null && this.messageId !== null) this.onStateChange?.(this.sessionId, this.messageId, this.status);
	}
};
var PlaybackController = class {
	autoPlayArmedAt = Date.now();
	view = {
		sessionId: null,
		messageId: null,
		status: "idle",
		error: null
	};
	listeners = /* @__PURE__ */ new Set();
	automaticallyPlayed = /* @__PURE__ */ new Set();
	liveSessions = /* @__PURE__ */ new Set();
	completedSessions = /* @__PURE__ */ new Set();
	completedMessages = /* @__PURE__ */ new Map();
	current = null;
	request = null;
	generation = 0;
	activeSessionId = null;
	getSnapshot = () => this.view;
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	activateSession(sessionId) {
		if (this.activeSessionId === sessionId) return;
		this.generation += 1;
		this.stopCurrent();
		this.liveSessions.clear();
		this.completedSessions.clear();
		this.completedMessages.clear();
		this.activeSessionId = sessionId;
		this.publish({
			sessionId: null,
			messageId: null,
			status: "idle",
			error: null
		});
	}
	cancelPlayback(sessionId) {
		if (this.activeSessionId !== sessionId) return;
		this.generation += 1;
		this.stopCurrent();
		this.publish({
			sessionId: null,
			messageId: null,
			status: "idle",
			error: null
		});
	}
	deactivateSession(sessionId) {
		if (this.activeSessionId !== sessionId) return;
		this.generation += 1;
		this.stopCurrent();
		this.liveSessions.clear();
		this.completedSessions.clear();
		this.completedMessages.clear();
		this.activeSessionId = null;
		this.publish({
			sessionId: null,
			messageId: null,
			status: "idle",
			error: null
		});
	}
	observeSession(sessionId, running, latestMessageId) {
		if (this.activeSessionId !== sessionId) return;
		if (running) {
			this.liveSessions.add(sessionId);
			this.completedSessions.delete(sessionId);
			this.completedMessages.delete(sessionId);
			return;
		}
		if (this.liveSessions.delete(sessionId)) this.completedSessions.add(sessionId);
		if (this.completedSessions.has(sessionId) && latestMessageId !== null) this.completedMessages.set(sessionId, latestMessageId);
	}
	claimAutomaticPlayback(sessionId, messageId) {
		if (this.activeSessionId !== sessionId) return false;
		const key = `${sessionId}:${messageId}`;
		if (this.completedMessages.get(sessionId) !== messageId) return false;
		if (this.automaticallyPlayed.has(key)) return false;
		this.automaticallyPlayed.add(key);
		this.completedSessions.delete(sessionId);
		this.completedMessages.delete(sessionId);
		return true;
	}
	updateLivePlayback(sessionId, messageId, status) {
		if (this.activeSessionId !== sessionId) return;
		if (this.view.messageId === messageId || status !== "idle") this.publish({
			sessionId,
			messageId,
			status,
			error: status === "error" ? "play-failed" : null
		});
	}
	async toggle(sessionId, messageId, text, automatic) {
		if (this.activeSessionId !== sessionId) return;
		if (this.view.sessionId === sessionId && this.view.messageId === messageId && this.current !== null) {
			const audio = this.current.audio;
			const generation$1 = this.generation;
			if (audio.paused) try {
				await audio.play();
				if (generation$1 !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return;
				this.publish({
					sessionId,
					messageId,
					status: "playing",
					error: null
				});
			} catch {
				if (generation$1 !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return;
				this.publish({
					sessionId,
					messageId,
					status: "paused",
					error: automatic ? "autoplay-blocked" : "play-failed"
				});
			}
			else {
				audio.pause();
				this.publish({
					sessionId,
					messageId,
					status: "paused",
					error: null
				});
			}
			return;
		}
		if (text.length === 0) {
			this.publish({
				sessionId,
				messageId,
				status: "error",
				error: "no-text"
			});
			return;
		}
		this.stopCurrent();
		const generation = ++this.generation;
		const controller = new AbortController();
		this.request = controller;
		this.publish({
			sessionId,
			messageId,
			status: "loading",
			error: null
		});
		try {
			const response = await fetch(TTS_ROUTE, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ text }),
				signal: controller.signal
			});
			if (!response.ok) {
				let message = `${response.status}`;
				try {
					const body = await response.json();
					if (typeof body.message === "string") message = body.message;
					else if (typeof body.error === "string") message = body.error;
				} catch {}
				throw new Error(message);
			}
			const blob = await response.blob();
			if (generation !== this.generation || this.activeSessionId !== sessionId) return;
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			this.current = {
				url,
				audio
			};
			this.request = null;
			audio.addEventListener("ended", () => {
				if (this.activeSessionId === sessionId && this.current?.audio === audio) this.publish({
					sessionId,
					messageId,
					status: "idle",
					error: null
				});
			});
			audio.addEventListener("error", () => {
				if (this.activeSessionId === sessionId && this.current?.audio === audio) this.publish({
					sessionId,
					messageId,
					status: "error",
					error: "play-failed"
				});
			});
			try {
				await audio.play();
				if (generation !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return;
				this.publish({
					sessionId,
					messageId,
					status: "playing",
					error: null
				});
			} catch {
				if (generation !== this.generation || this.activeSessionId !== sessionId || this.current?.audio !== audio) return;
				this.publish({
					sessionId,
					messageId,
					status: "paused",
					error: automatic ? "autoplay-blocked" : "play-failed"
				});
			}
		} catch (error) {
			if (controller.signal.aborted || generation !== this.generation || this.activeSessionId !== sessionId) return;
			this.request = null;
			this.publish({
				sessionId,
				messageId,
				status: "error",
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	dispose() {
		this.generation += 1;
		this.stopCurrent();
		this.liveSessions.clear();
		this.completedSessions.clear();
		this.completedMessages.clear();
		this.activeSessionId = null;
		this.listeners.clear();
	}
	stopCurrent() {
		this.request?.abort();
		this.request = null;
		if (this.current !== null) {
			this.current.audio.pause();
			this.current.audio.removeAttribute("src");
			URL.revokeObjectURL(this.current.url);
			this.current = null;
		}
	}
	publish(view) {
		this.view = view;
		for (const listener of this.listeners) listener();
	}
};
/** Own the active-session boundary and feed its partial assistant output into realtime speech. */
function SessionPlaybackObserver({ sessionId, session, playback, live, settings }) {
	const resolvedSettings = resolveTtsSettings(useSettingsSnapshot(settings).value);
	const active = (0, react.useRef)(null);
	const wasRunning = (0, react.useRef)(session.running);
	const runArmed = (0, react.useRef)(!session.running);
	const latestMessageId = latestAssistantMessageId(session);
	const partial = session.partial;
	const partialText = partial === null ? "" : assistantText(partial.blocks);
	(0, react.useEffect)(() => {
		active.current = null;
		wasRunning.current = session.running;
		runArmed.current = !session.running;
		playback.activateSession(sessionId);
		live.activateSession(sessionId);
		return () => {
			active.current = null;
			live.deactivateSession(sessionId);
			playback.deactivateSession(sessionId);
		};
	}, [
		live,
		playback,
		sessionId
	]);
	(0, react.useEffect)(() => {
		const beganRun = session.running && !wasRunning.current;
		wasRunning.current = session.running;
		if (!session.running) runArmed.current = true;
		else if (beganRun) {
			runArmed.current = true;
			live.cancelSession(sessionId);
			playback.cancelPlayback(sessionId);
			active.current = null;
		}
		playback.observeSession(sessionId, session.running && runArmed.current, latestMessageId);
		if (!resolvedSettings.enabled || !resolvedSettings.autoPlay || resolvedSettings.model !== "mimo-v2.5-tts") {
			live.cancelSession(sessionId);
			active.current = null;
			if (session.running) runArmed.current = false;
			return;
		}
		if (!runArmed.current) return;
		if (partial !== null) {
			if (active.current !== null && (active.current.turn !== partial.turn || active.current.step !== partial.step)) {
				const previous = finalLiveMessage(session, active.current.turn, active.current.step);
				if (previous !== null) live.finish(sessionId, previous);
			}
			active.current = {
				turn: partial.turn,
				step: partial.step
			};
			live.observe(sessionId, partial.turn, partial.step, partialText);
			return;
		}
		if (active.current !== null) {
			const final = finalLiveMessage(session, active.current.turn, active.current.step);
			if (final !== null) live.finish(sessionId, final);
			else if (!session.running) live.cancelSession(sessionId);
			active.current = null;
		}
	}, [
		latestMessageId,
		live,
		partial,
		partialText,
		playback,
		resolvedSettings.autoPlay,
		resolvedSettings.enabled,
		resolvedSettings.model,
		session,
		sessionId,
		session.running
	]);
	return null;
}
function ReadAloudAction({ sessionId, messageId, useSession, playback, live, settings, t }) {
	const message = useSession((snapshot) => ({
		text: messageText(snapshot, messageId),
		time: messageTime(snapshot, messageId),
		latestMessageId: latestAssistantMessageId(snapshot),
		identity: messageLiveIdentity(snapshot, messageId),
		running: snapshot.running
	}));
	const text = message.text;
	const settingsSnapshot = useSettingsSnapshot(settings);
	const view = (0, react.useSyncExternalStore)(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
	(0, react.useEffect)(() => {
		if (text.length === 0 || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || live.hasHandled(sessionId, message.identity) || message.running || message.latestMessageId !== messageId || message.time === null || message.time < playback.autoPlayArmedAt) return;
		const cancel = window.setTimeout(() => {
			if (!live.hasHandled(sessionId, message.identity) && playback.claimAutomaticPlayback(sessionId, messageId)) playback.toggle(sessionId, messageId, text, true);
		}, 0);
		return () => window.clearTimeout(cancel);
	}, [
		live,
		message.identity,
		message.latestMessageId,
		message.running,
		message.time,
		messageId,
		playback,
		sessionId,
		settingsSnapshot.value?.autoPlay,
		settingsSnapshot.value?.enabled,
		text
	]);
	if (settingsSnapshot.value?.enabled !== true || text.length === 0) return null;
	const mine = view.sessionId === sessionId && view.messageId === messageId;
	const status = mine ? view.status : "idle";
	const label = status === "loading" ? t("action.loading") : status === "playing" ? t("action.pause") : status === "paused" ? t("action.resume") : status === "error" ? t("action.retry") : t("action.play");
	const error = mine ? view.error : null;
	const errorText = error === null ? null : error === "no-text" ? t("error.noText") : error === "autoplay-blocked" || error === "play-failed" ? t("error.play") : t("error.request");
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.Tooltip, {
		label,
		side: "bottom",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			className: "xmimo-tts-action",
			"aria-label": label,
			"aria-pressed": status === "playing",
			disabled: status === "loading",
			onClick: () => {
				if (!live.toggle(sessionId, messageId)) {
					live.cancel();
					playback.toggle(sessionId, messageId, text, false);
				}
			},
			children: status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconLoadingOutline16, { className: "xmimo-tts-spin" }) : status === "playing" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconPauseOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconPlayOutline16, {})
		})
	}), errorText === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "xmimo-tts-inline-error",
		role: "status",
		children: errorText
	})] });
}
const EDITABLE_SETTING_FIELDS = [
	"enabled",
	"autoPlay",
	"model",
	"voice",
	"voiceDesignPrompt",
	"voiceDesignCustomPrompt",
	"format"
];
const CUSTOM_VOICE_DESIGN_OPTION = "__custom__";
function isPresetVoiceDesignPrompt(value) {
	return TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === value);
}
function VoicePresetAvatar({ preset }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
		className: "xmimo-tts-voice-avatar",
		src: `${TTS_VOICE_DESIGN_ASSET_ROUTE}/${preset.id}.webp`,
		alt: "",
		width: 40,
		height: 40,
		loading: "lazy",
		"aria-hidden": "true"
	});
}
function CustomVoiceAvatar() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "xmimo-tts-voice-avatar xmimo-tts-custom-voice-avatar",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			viewBox: "0 0 40 40",
			focusable: "false",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "20",
					cy: "14",
					r: "6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9.5 31.5c1.7-6.2 5.2-9.3 10.5-9.3s8.8 3.1 10.5 9.3" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M31 8v8M27 12h8" })
			]
		})
	});
}
function VoiceDesignPresetPicker({ value, disabled, label, customLabel, customSummary, onChange }) {
	const [open, setOpen] = (0, react.useState)(false);
	const rootRef = (0, react.useRef)(null);
	const triggerRef = (0, react.useRef)(null);
	const optionRefs = (0, react.useRef)([]);
	const listboxId = (0, react.useId)();
	const selectedPresetIndex = TTS_VOICE_DESIGN_PRESETS.findIndex((item) => item.prompt === value);
	const selectedPreset = selectedPresetIndex < 0 ? void 0 : TTS_VOICE_DESIGN_PRESETS[selectedPresetIndex];
	const selectedOptionIndex = selectedPresetIndex + 1;
	const optionCount = TTS_VOICE_DESIGN_PRESETS.length + 1;
	(0, react.useEffect)(() => {
		if (!open) return;
		const closeOnOutsidePointer = (event) => {
			if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutsidePointer);
		return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
	}, [open]);
	(0, react.useEffect)(() => {
		if (disabled) setOpen(false);
	}, [disabled]);
	const focusOption = (index) => {
		const normalized = (index + optionCount) % optionCount;
		requestAnimationFrame(() => optionRefs.current[normalized]?.focus());
	};
	const openAndFocus = (index) => {
		setOpen(true);
		focusOption(index);
	};
	const choose = (next) => {
		onChange(next);
		setOpen(false);
		requestAnimationFrame(() => triggerRef.current?.focus());
	};
	const handleTriggerKeyDown = (event) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			openAndFocus(selectedOptionIndex);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			openAndFocus(selectedOptionIndex === 0 ? optionCount - 1 : selectedOptionIndex);
		} else if (event.key === "Home") {
			event.preventDefault();
			openAndFocus(0);
		} else if (event.key === "End") {
			event.preventDefault();
			openAndFocus(optionCount - 1);
		}
	};
	const handleOptionKeyDown = (event, index) => {
		if (event.key === "ArrowDown") {
			event.preventDefault();
			focusOption(index + 1);
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			focusOption(index - 1);
		} else if (event.key === "Home") {
			event.preventDefault();
			focusOption(0);
		} else if (event.key === "End") {
			event.preventDefault();
			focusOption(optionCount - 1);
		} else if (event.key === "Escape") {
			event.preventDefault();
			setOpen(false);
			triggerRef.current?.focus();
		} else if (event.key === "Tab") setOpen(false);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "xmimo-tts-voice-picker",
		ref: rootRef,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			ref: triggerRef,
			type: "button",
			className: "xmimo-tts-voice-picker-trigger",
			disabled,
			"aria-label": label,
			"aria-haspopup": "listbox",
			"aria-expanded": open,
			"aria-controls": open ? listboxId : void 0,
			onClick: () => {
				setOpen((current) => !current);
			},
			onKeyDown: handleTriggerKeyDown,
			children: [
				selectedPreset === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CustomVoiceAvatar, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VoicePresetAvatar, { preset: selectedPreset }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "xmimo-tts-voice-option-copy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: selectedPreset?.label ?? customLabel }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: selectedPreset?.summary ?? customSummary })]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? "xmimo-tts-voice-picker-chevron xmimo-tts-voice-picker-chevron-open" : "xmimo-tts-voice-picker-chevron" })
			]
		}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			id: listboxId,
			className: "xmimo-tts-voice-picker-menu",
			role: "listbox",
			"aria-label": label,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: (node) => {
					optionRefs.current[0] = node;
				},
				type: "button",
				role: "option",
				"aria-selected": selectedPreset === void 0,
				className: selectedPreset === void 0 ? "xmimo-tts-voice-option xmimo-tts-voice-option-selected" : "xmimo-tts-voice-option",
				onClick: () => {
					choose(CUSTOM_VOICE_DESIGN_OPTION);
				},
				onKeyDown: (event) => {
					handleOptionKeyDown(event, 0);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CustomVoiceAvatar, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "xmimo-tts-voice-option-copy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: customLabel }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: customSummary })]
				})]
			}), TTS_VOICE_DESIGN_PRESETS.map((preset, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				ref: (node) => {
					optionRefs.current[index + 1] = node;
				},
				type: "button",
				role: "option",
				"aria-selected": selectedPreset?.id === preset.id,
				className: selectedPreset?.id === preset.id ? "xmimo-tts-voice-option xmimo-tts-voice-option-selected" : "xmimo-tts-voice-option",
				onClick: () => {
					choose(preset.prompt);
				},
				onKeyDown: (event) => {
					handleOptionKeyDown(event, index + 1);
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(VoicePresetAvatar, { preset }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "xmimo-tts-voice-option-copy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: preset.label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: preset.summary })]
				})]
			}, preset.id))]
		}) : null]
	});
}
function layerSettings(value) {
	return isRecord(value) ? value : void 0;
}
function hasLayerField(value, field) {
	return isRecord(value) && Object.hasOwn(value, field);
}
function SettingFieldHeading({ label, suffix, overriddenLabel, resetLabel, overridden, resettable, disabled, onReset }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
		className: "xmimo-tts-field-heading",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: "xmimo-tts-field-label",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), suffix]
		}), overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
			className: "xmimo-tts-field-badges",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
				className: "xmimo-tts-overridden",
				children: overriddenLabel
			}), resettable && onReset !== void 0 && resetLabel !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "xmimo-tts-reset",
				disabled,
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					onReset();
				},
				children: resetLabel
			}) : null]
		}) : null]
	});
}
function SettingsCard({ scope, t }) {
	const snapshot = useSettingsSnapshot(scope);
	const value = snapshot.value;
	const initial = resolveTtsSettings(value);
	const [apiKey, setApiKey] = (0, react.useState)("");
	const [enabled, setEnabled] = (0, react.useState)(initial.enabled);
	const [autoPlay, setAutoPlay] = (0, react.useState)(initial.autoPlay);
	const [model, setModel] = (0, react.useState)(initial.model);
	const [voice, setVoice] = (0, react.useState)(initial.voice);
	const [voiceDesignPrompt, setVoiceDesignPrompt] = (0, react.useState)(initial.voiceDesignPrompt);
	const [voiceDesignCustomPrompt, setVoiceDesignCustomPrompt] = (0, react.useState)(initial.voiceDesignCustomPrompt);
	const [format, setFormat] = (0, react.useState)(initial.format);
	const [changes, setChanges] = (0, react.useState)({});
	const [state, setState] = (0, react.useState)("idle");
	const [open, setOpen] = (0, react.useState)(false);
	const accepted = resolveTtsSettings(value);
	const base = resolveTtsSettings(layerSettings(snapshot.base));
	const draft = {
		enabled,
		autoPlay: enabled && autoPlay,
		model,
		voice,
		voiceDesignPrompt,
		voiceDesignCustomPrompt,
		format
	};
	const acceptedValue = (field) => {
		const raw = value?.[field];
		return raw === void 0 ? accepted[field] : raw;
	};
	const hasOverride = (field) => hasLayerField(snapshot.user, field);
	const fieldOverridden = (field) => {
		const change = changes[field];
		if (change?.kind === "clear") return false;
		if (change?.kind === "set") return field === "apiKey" ? apiKey.trim().length > 0 : true;
		return hasOverride(field);
	};
	const fieldDirty = (field) => {
		const change = changes[field];
		if (change === void 0) return false;
		if (change.kind === "clear") return hasOverride(field);
		return !Object.is(draft[field], acceptedValue(field));
	};
	const apiKeyDirty = changes.apiKey?.kind === "clear" ? hasOverride("apiKey") : changes.apiKey?.kind === "set" && apiKey.trim().length > 0;
	const dirty = EDITABLE_SETTING_FIELDS.some(fieldDirty) || apiKeyDirty === true;
	(0, react.useEffect)(() => {
		if (dirty) return;
		const next = resolveTtsSettings(value);
		setEnabled(next.enabled);
		setAutoPlay(next.autoPlay);
		setModel(next.model);
		setVoice(next.voice);
		setVoiceDesignPrompt(next.voiceDesignPrompt);
		setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt);
		setFormat(next.format);
		setChanges({});
	}, [dirty, value]);
	if (snapshot.status === "unavailable") return null;
	const markChange = (field, kind = "set") => {
		setChanges((current) => ({
			...current,
			[field]: { kind }
		}));
		setState("idle");
	};
	const resetField = (field) => {
		markChange(field, "clear");
		if (field === "enabled") setEnabled(base.enabled);
		if (field === "autoPlay") setAutoPlay(base.autoPlay);
		if (field === "model") setModel(base.model);
		if (field === "voice") setVoice(base.voice);
		if (field === "voiceDesignPrompt") setVoiceDesignPrompt(base.voiceDesignPrompt);
		if (field === "voiceDesignCustomPrompt") setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt);
		if (field === "format") setFormat(base.format);
	};
	const discard = () => {
		const next = resolveTtsSettings(scope.getSnapshot().value);
		setEnabled(next.enabled);
		setAutoPlay(next.autoPlay);
		setModel(next.model);
		setVoice(next.voice);
		setVoiceDesignPrompt(next.voiceDesignPrompt);
		setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt);
		setFormat(next.format);
		setApiKey("");
		setChanges({});
		setState("idle");
	};
	const save = async () => {
		setState("saving");
		try {
			for (const field of EDITABLE_SETTING_FIELDS) {
				const change = changes[field];
				if (change === void 0) continue;
				if (change.kind === "clear") {
					if (hasOverride(field)) await scope.unset(field);
				} else if (!Object.is(draft[field], acceptedValue(field))) await scope.set(field, draft[field]);
			}
			const apiKeyChange = changes.apiKey;
			if (apiKeyChange?.kind === "clear") {
				if (hasOverride("apiKey")) await scope.unset("apiKey");
			} else if (apiKeyChange?.kind === "set" && apiKey.trim().length > 0) await scope.set("apiKey", apiKey.trim());
			setApiKey("");
			setChanges({});
			setState("saved");
		} catch {
			setState("failed");
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
		className: open ? "xmimo-tts-card xmimo-tts-card-open" : "xmimo-tts-card",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "xmimo-tts-card-header",
			"aria-expanded": open,
			"aria-label": `${t(open ? "settings.collapse" : "settings.expand")}: ${t("settings.title")}`,
			onClick: () => {
				setOpen((current) => !current);
			},
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "xmimo-tts-card-head-text",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "xmimo-tts-card-title",
						children: t("settings.title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "xmimo-tts-card-description",
						children: t("settings.description")
					})]
				}),
				dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "xmimo-tts-pending",
					role: "status",
					children: t("settings.unsaved")
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(__deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: open ? "xmimo-tts-chevron xmimo-tts-chevron-open" : "xmimo-tts-chevron" })
			]
		}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "xmimo-tts-card-body",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xmimo-tts-grid",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xmimo-tts-api-key xmimo-tts-wide",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
								label: t("settings.apiKey"),
								suffix: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: "xmimo-tts-api-key-link",
									href: "https://platform.xiaomimimo.com/console/api-keys",
									target: "_blank",
									rel: "noopener noreferrer",
									children: t("settings.getApiKey")
								}),
								overriddenLabel: t("settings.apiKeyConfigured"),
								overridden: fieldOverridden("apiKey"),
								resettable: false,
								disabled: !snapshot.writable
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "password",
								value: apiKey,
								name: "xmimo-tts-api-key",
								autoComplete: "new-password",
								autoCorrect: "off",
								spellCheck: false,
								"aria-autocomplete": "none",
								"data-1p-ignore": "true",
								"data-bwignore": "true",
								"data-lpignore": "true",
								placeholder: t("settings.secretPlaceholder"),
								disabled: !snapshot.writable,
								onChange: (event) => {
									setApiKey(event.target.value);
									markChange("apiKey");
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "xmimo-tts-api-key-hints",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.apiKeyStatus") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.apiKeyHint") })]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xmimo-tts-switch-row xmimo-tts-wide",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "xmimo-tts-checkbox-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: enabled,
								disabled: !snapshot.writable,
								onChange: (event) => {
									const next = event.target.checked;
									setEnabled(next);
									if (!next) {
										setAutoPlay(false);
										setChanges((current) => ({
											...current,
											enabled: { kind: "set" },
											autoPlay: { kind: "set" }
										}));
									} else markChange("enabled");
									setState("idle");
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
								label: t("settings.enabled"),
								overriddenLabel: t("settings.overridden"),
								resetLabel: t("settings.reset"),
								overridden: false,
								resettable: false,
								disabled: !snapshot.writable,
								onReset: () => {
									resetField("enabled");
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.enabledHint") })] })]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: "xmimo-tts-checkbox-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: enabled && autoPlay,
								disabled: !snapshot.writable,
								onChange: (event) => {
									const next = event.target.checked;
									setAutoPlay(next);
									if (next) {
										setEnabled(true);
										setChanges((current) => ({
											...current,
											autoPlay: { kind: "set" },
											enabled: { kind: "set" }
										}));
									} else markChange("autoPlay");
									setState("idle");
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
								label: t("settings.autoPlay"),
								overriddenLabel: t("settings.overridden"),
								resetLabel: t("settings.reset"),
								overridden: false,
								resettable: false,
								disabled: !snapshot.writable,
								onReset: () => {
									resetField("autoPlay");
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.autoPlayHint") })] })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xmimo-tts-model xmimo-tts-wide",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
								label: t("settings.model"),
								overriddenLabel: t("settings.overridden"),
								resetLabel: t("settings.reset"),
								overridden: fieldOverridden("model"),
								resettable: true,
								disabled: !snapshot.writable,
								onReset: () => {
									resetField("model");
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: model,
								disabled: !snapshot.writable,
								onChange: (event) => {
									setModel(event.target.value);
									markChange("model");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "mimo-v2.5-tts",
									children: t("settings.presetModel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "mimo-v2.5-tts-voicedesign",
									children: t("settings.voiceDesignModel")
								})]
							}),
							enabled && autoPlay ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t(model === "mimo-v2.5-tts" ? "settings.modelAutoPlayHintPreset" : "settings.modelAutoPlayHintVoiceDesign") }) : null
						]
					}),
					model === "mimo-v2.5-tts-voicedesign" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "xmimo-tts-voice-design-prompt xmimo-tts-wide",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
								label: t("settings.voiceDesignPrompt"),
								overriddenLabel: t("settings.overridden"),
								resetLabel: t("settings.reset"),
								overridden: fieldOverridden("voiceDesignPrompt"),
								resettable: true,
								disabled: !snapshot.writable,
								onReset: () => {
									resetField("voiceDesignPrompt");
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(VoiceDesignPresetPicker, {
								value: isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION,
								disabled: !snapshot.writable,
								label: t("settings.voiceDesignPrompt"),
								customLabel: t("settings.customVoiceOption"),
								customSummary: t("settings.customVoiceSummary"),
								onChange: (value$1) => {
									setVoiceDesignPrompt(value$1 === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : value$1);
									markChange("voiceDesignPrompt");
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								value: voiceDesignPrompt,
								rows: 4,
								disabled: !snapshot.writable,
								placeholder: t("settings.voiceDesignPromptHint"),
								onChange: (event) => {
									const next = event.target.value;
									setVoiceDesignPrompt(next);
									setVoiceDesignCustomPrompt(next);
									setChanges((current) => ({
										...current,
										voiceDesignPrompt: { kind: "set" },
										voiceDesignCustomPrompt: { kind: "set" }
									}));
									setState("idle");
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.voiceDesignPromptHint") })
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: model === "mimo-v2.5-tts" ? "xmimo-tts-select-column xmimo-tts-wide" : "xmimo-tts-select-column",
						children: [model === "mimo-v2.5-tts" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
							label: t("settings.voice"),
							overriddenLabel: t("settings.overridden"),
							resetLabel: t("settings.reset"),
							overridden: false,
							resettable: false,
							disabled: !snapshot.writable,
							onReset: () => {
								resetField("voice");
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							value: voice,
							disabled: !snapshot.writable,
							onChange: (event) => {
								setVoice(event.target.value);
								markChange("voice");
							},
							children: TTS_VOICES.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: item,
								children: item
							}, item))
						})] }) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
							label: t("settings.format"),
							overriddenLabel: t("settings.overridden"),
							resetLabel: t("settings.reset"),
							overridden: false,
							resettable: false,
							disabled: !snapshot.writable,
							onReset: () => {
								resetField("format");
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: format,
							disabled: !snapshot.writable,
							onChange: (event) => {
								setFormat(event.target.value);
								markChange("format");
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "mp3",
								children: "MP3"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "wav",
								children: "WAV"
							})]
						})] })]
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "xmimo-tts-card-actions",
				children: [
					!snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("settings.readOnly") }) : null,
					state === "saved" && !dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						children: t("settings.saved")
					}) : null,
					state === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "xmimo-tts-failed",
						role: "status",
						children: t("settings.failed")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "xmimo-tts-discard",
						disabled: !snapshot.writable || !dirty || state === "saving",
						onClick: discard,
						children: t("settings.discard")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: !snapshot.writable || !dirty || state === "saving",
						onClick: () => {
							save();
						},
						children: state === "saving" ? t("settings.saving") : t("settings.save")
					})
				]
			})]
		}) : null]
	});
}
/** Register the Web action, settings card, locale dictionaries, and styles. */
function apply(ctx) {
	const locale = ctx.locale;
	const t = locale.bind(NS);
	ctx.effect(() => locale.register(NS, {
		zh,
		en
	}), "xiaomi-mimo-tts: dictionaries");
	const scope = ctx.settingsScope.bind({
		namespace: TTS_SETTINGS_NAMESPACE,
		decode: decodeSettings
	});
	const playback = new PlaybackController();
	const live = new LiveSpeechController();
	live.setStateChangeListener((sessionId, messageId, status) => playback.updateLivePlayback(sessionId, messageId, status));
	ctx.effect(() => () => playback.dispose(), "xiaomi-mimo-tts: playback");
	ctx.effect(() => () => {
		live.dispose();
	}, "xiaomi-mimo-tts: live playback");
	ctx.effect(() => {
		const style = document.createElement("style");
		style.dataset.plugin = NS;
		style.textContent = `
      .xmimo-tts-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.xmimo-tts-action:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action:disabled{cursor:default;opacity:.45}.xmimo-tts-spin{animation:xmimo-spin 1s linear infinite}@keyframes xmimo-spin{to{transform:rotate(360deg)}}
      .xmimo-tts-inline-error{max-width:220px;color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px}
      .xmimo-tts-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-3,#fff);overflow:hidden;transition:border-color 160ms ease,background 160ms ease}.xmimo-tts-card:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-open{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-header{appearance:none;display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;border-radius:12px;color:inherit;text-align:left;background:transparent;font:inherit;cursor:pointer}.xmimo-tts-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}.xmimo-tts-card-head-text{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.xmimo-tts-card-title{font-size:15px;font-weight:600}.xmimo-tts-card-description{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:18px}.xmimo-tts-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform 160ms ease}.xmimo-tts-chevron-open{transform:rotate(180deg)}.xmimo-tts-pending{flex:none;border-radius:999px;padding:1px 8px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;font-weight:500;line-height:17px}.xmimo-tts-card-body{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding:0 0 16px}
      .xmimo-tts-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 14px;margin-top:16px;align-items:start}.xmimo-tts-grid label,.xmimo-tts-api-key,.xmimo-tts-model,.xmimo-tts-voice-design-prompt,.xmimo-tts-select-column>div{display:flex;min-width:0;flex-direction:column;gap:6px;font-size:13px}.xmimo-tts-grid input,.xmimo-tts-grid select,.xmimo-tts-grid textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,#f3f4f6);font:inherit}.xmimo-tts-grid select{color-scheme:light dark}.xmimo-tts-grid select option{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-1,#fff)}.xmimo-tts-grid select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:1px}.xmimo-tts-grid small{color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:17px}.xmimo-tts-field-heading{display:flex;min-width:0;min-height:20px;flex-direction:row!important;align-items:center;justify-content:space-between;gap:8px}.xmimo-tts-field-label{display:inline-flex;min-width:0;align-items:center;gap:8px}.xmimo-tts-api-key-link{color:var(--dsw-alias-brand-primary,#4f6ef7);font-size:12px;text-decoration:none}.xmimo-tts-api-key-link:hover{text-decoration:underline}.xmimo-tts-field-badges{display:flex!important;flex:none;flex-direction:row!important;align-items:center;gap:8px}.xmimo-tts-overridden{border-radius:999px;padding:1px 7px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;line-height:17px}.xmimo-tts-reset{padding:0;border:0;color:var(--dsw-alias-label-secondary,#5f6875);background:transparent;font:inherit;font-size:12px;cursor:pointer}.xmimo-tts-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328)}.xmimo-tts-reset:disabled{cursor:not-allowed;opacity:.45}.xmimo-tts-api-key-hints{display:flex;min-width:0;gap:8px;align-items:center}.xmimo-tts-api-key-hints small{min-width:0;white-space:nowrap}.xmimo-tts-wide{grid-column:1/-1}.xmimo-tts-switch-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.xmimo-tts-checkbox-row{flex-direction:row!important;align-items:flex-start!important}.xmimo-tts-checkbox-row input{width:auto!important;flex:none;margin-top:3px}.xmimo-tts-checkbox-row span{display:flex;min-width:0;flex-direction:column;gap:4px}.xmimo-tts-select-column{display:flex;min-width:0;flex-direction:row;gap:16px}.xmimo-tts-select-column>div{flex:1}
      .xmimo-tts-voice-picker{display:flex;min-width:0;flex-direction:column;gap:6px}.xmimo-tts-voice-picker-trigger,.xmimo-tts-voice-option{box-sizing:border-box;display:flex;width:100%;min-width:0;align-items:center;gap:10px;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,#f3f4f6);font:inherit;text-align:left;cursor:pointer}.xmimo-tts-voice-picker-trigger{min-height:54px;border-radius:10px;padding:6px 10px}.xmimo-tts-voice-picker-trigger:hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed,#c8ccd4);background:var(--dsw-alias-interactive-bg-hover,#eef0f3)}.xmimo-tts-voice-picker-trigger:focus-visible,.xmimo-tts-voice-option:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:1px}.xmimo-tts-voice-picker-trigger:disabled{cursor:not-allowed;opacity:.55}.xmimo-tts-voice-avatar{box-sizing:border-box;display:block;width:40px;height:40px;flex:none;border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2,#e5e7eb) 80%,transparent);border-radius:50%;object-fit:cover;background:var(--dsw-alias-bg-layer-1,#fff)}.xmimo-tts-custom-voice-avatar{display:grid;place-items:center;color:var(--dsw-alias-brand-primary,#4f6ef7);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f6ef7) 12%,var(--dsw-alias-bg-layer-1,#fff))}.xmimo-tts-custom-voice-avatar svg{width:30px;height:30px;overflow:visible}.xmimo-tts-custom-voice-avatar circle{fill:currentColor}.xmimo-tts-custom-voice-avatar path{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.xmimo-tts-voice-option-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:1px}.xmimo-tts-voice-option-copy strong{overflow:hidden;font-size:13px;font-weight:600;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.xmimo-tts-voice-option-copy small{overflow:hidden;font-size:12px;text-overflow:ellipsis;white-space:nowrap}.xmimo-tts-voice-picker-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform 160ms ease}.xmimo-tts-voice-picker-chevron-open{transform:rotate(180deg)}.xmimo-tts-voice-picker-menu{display:grid;max-height:310px;overflow:auto;overscroll-behavior:contain;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:10px;padding:5px;background:var(--dsw-alias-bg-layer-1,#fff);box-shadow:0 10px 28px rgba(15,23,42,.12)}.xmimo-tts-voice-option{min-height:50px;border:0;border-radius:7px;padding:5px 7px;background:transparent}.xmimo-tts-voice-option:hover,.xmimo-tts-voice-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6)}.xmimo-tts-voice-option-selected{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4f6ef7) 10%,transparent)}
      .xmimo-tts-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);font-size:12px;color:var(--dsw-alias-label-tertiary,#8b93a1)}.xmimo-tts-card-actions button{border:1px solid var(--dsw-alias-brand-primary,#4f6ef7);border-radius:8px;padding:5px 14px;color:var(--dsw-alias-bg-layer-1,#fff);background:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;font:inherit}.xmimo-tts-card-actions button:hover:not(:disabled){filter:brightness(1.08)}.xmimo-tts-card-actions button:disabled{cursor:not-allowed;color:var(--dsw-alias-label-dimmed,#9ca3af);background:var(--dsw-alias-bg-layer-2,#f3f4f6);border-color:var(--dsw-alias-border-l2,#e5e7eb);opacity:1}.xmimo-tts-card-actions .xmimo-tts-discard{border-color:var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-secondary,#5f6875);background:transparent}.xmimo-tts-card-actions .xmimo-tts-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-failed{color:var(--dsw-alias-state-error-primary,#dc2626)}
      @media(max-width:720px){.xmimo-tts-grid{grid-template-columns:1fr}.xmimo-tts-wide{grid-column:auto}.xmimo-tts-switch-row{grid-template-columns:1fr}.xmimo-tts-select-column{grid-column:auto;flex-direction:column}.xmimo-tts-api-key-hints{flex-wrap:wrap}.xmimo-tts-api-key-hints small{white-space:normal}}
    `;
		document.head.appendChild(style);
		return () => style.remove();
	}, "xiaomi-mimo-tts: styles");
	registerSlotContribution(ctx, "conversation.input.dock", () => ctx.slots.register({
		name: "conversation.input.dock",
		id: "xiaomi-mimo-tts-session-playback-observer",
		order: 998,
		inject: () => ({
			playback,
			live,
			settings: scope
		})
	}, SessionPlaybackObserver));
	registerSlotContribution(ctx, "conversation.chat.assistant-actions", () => ctx.slots.register({
		name: "conversation.chat.assistant-actions",
		id: "xiaomi-mimo-tts",
		order: 20,
		locale: NS,
		inject: () => ({
			playback,
			live,
			settings: scope,
			t
		})
	}, ReadAloudAction));
	registerSlotContribution(ctx, "settings.plugin.item", () => ctx.slots.register({
		name: "settings.plugin.item",
		key: TTS_SETTINGS_NAMESPACE,
		locale: NS,
		inject: () => ({
			scope,
			t
		})
	}, SettingsCard));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
return module.exports; } });
//# sourceMappingURL=client.js.map