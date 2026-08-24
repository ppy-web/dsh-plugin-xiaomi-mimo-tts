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
		prompt: "元气少女音色，明亮、轻快、笑意明显，语速偏快，句尾灵动，适合轻松内容和年轻化短视频。"
	},
	{
		label: "邻家女孩",
		prompt: "年轻女性，声音甜美、软萌、亲近，语速轻快，带一点黏人感和撒娇气质，但保持清晰可懂，适合轻松日常、聊天向内容。"
	},
	{
		label: "新闻播报",
		prompt: "专业新闻播报音色，中性偏成熟，吐字标准，节奏平稳，情绪克制，适合公告、新闻和正式说明。"
	},
	{
		label: "温柔客服",
		prompt: "温柔客服女声，亲切、耐心、清晰，语速适中，句尾轻微上扬，听起来可靠且不机械。"
	},
	{
		label: "温柔女友",
		prompt: "年轻女性，声音温柔、柔软、低饱和，语速偏慢，带轻微耳语感和亲密感，适合情感、治愈和晚间陪伴内容。"
	},
	{
		label: "ASMR低语",
		prompt: "年轻女性，声音极度轻柔，像在耳边说话，呼吸感明显，语速慢，适合哄睡、放松和沉浸式内容。"
	},
	{
		label: "少年感男声",
		prompt: "年轻男性，声音干净明亮，有少年感，语速略快，语气轻松自然，适合短视频口播和产品介绍。"
	},
	{
		label: "纪录片男声",
		prompt: "成熟男性，低沉稳重，气息稳定，语速中等偏慢，像纪录片旁白，带一点故事感但不过分夸张。"
	},
	{
		label: "古风说书男声",
		prompt: "古风说书人音色，成熟、有韵味，语速从容，语调起伏带叙事感，适合历史、武侠和传统故事。"
	},
	{
		label: "科技解说男声",
		prompt: "清晰、理性、现代，语速中等偏快，语气专业但不生硬，适合产品演示和技术说明。"
	},
	{
		label: "电台夜谈男声",
		prompt: "电台夜谈男声，温暖、低缓、松弛，带轻微气声，语速偏慢，适合情感电台、睡前故事和长篇陪伴内容。"
	},
	{
		label: "悬疑旁白男声",
		prompt: "悬疑故事旁白，声线偏低，语速克制，停顿明显，带一点紧张感和神秘感，适合悬疑、案件和氛围叙述。"
	}
];
const TTS_PUNCTUATION = {
	"，": ",",
	"。": ".",
	"！": "!",
	"？": "?",
	"：": ":",
	"；": ";",
	"、": ",",
	"（": "(",
	"）": ")",
	"【": "[",
	"】": "]",
	"［": "[",
	"］": "]",
	"“": "\"",
	"”": "\"",
	"‘": "'",
	"’": "'",
	"「": "\"",
	"」": "\"",
	"『": "\"",
	"』": "\"",
	"《": "\"",
	"》": "\"",
	"〈": "\"",
	"〉": "\"",
	"…": "...",
	"—": "-",
	"–": "-",
	"－": "-",
	"～": "~",
	"　": " "
};
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
	return value.replace(/[，。！？：；、（）【】［］“”‘’「」『』《》〈〉…—–－～　]/gu, (character) => TTS_PUNCTUATION[character] ?? character).replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, " ").replace(/(^|\s)[,;:!?]+(?=\s|$)/g, "$1").replace(/([,;:])\s*([.!?])/g, "$2").replace(/\s+([,.;:!?])/g, "$1");
}
/**
* Prepare assistant text for speech synthesis without changing the chat transcript.
*
* @param value Raw assistant text or Markdown-derived text.
* @returns Text with non-speech content removed and punctuation normalized.
*/
function prepareTtsText(value) {
	if (value.length === 0) return "";
	return normalizeTtsPunctuation(removeTtsSymbols(removeTtsMarkup(value).replace(/\\[rn]|\/n/gi, " ").replace(/\r\n?/g, "\n"))).replace(/\s+/g, " ").trim();
}
/** Defaults shared by the Schemastery config and the Web settings form. */
const DEFAULT_TTS_SETTINGS = {
	enabled: true,
	apiKey: "",
	baseURL: "https://api.xiaomimimo.com/v1",
	model: "mimo-v2.5-tts",
	voice: "冰糖",
	voiceDesignPrompt: "青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。",
	voiceDesignCustomPrompt: "青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。",
	format: "mp3",
	autoPlay: true,
	instruction: "请用自然、清晰、语速适中的语气朗读。",
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
	"settings.presetModel": "预置音色模型",
	"settings.voiceDesignModel": "自定义音色模型",
	"settings.voice": "内置音色",
	"settings.voiceDesignPrompt": "自定义音色描述",
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
	"settings.presetModel": "Preset voices",
	"settings.voiceDesignModel": "Custom voice design",
	"settings.voice": "Built-in voice",
	"settings.voiceDesignPrompt": "Custom voice description",
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
var PlaybackController = class {
	autoPlayArmedAt = Date.now();
	view = {
		messageId: null,
		status: "idle",
		error: null
	};
	listeners = /* @__PURE__ */ new Set();
	automaticallyPlayed = /* @__PURE__ */ new Set();
	current = null;
	request = null;
	generation = 0;
	getSnapshot = () => this.view;
	subscribe = (listener) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};
	claimAutomaticPlayback(sessionId, messageId) {
		const key = `${sessionId}:${messageId}`;
		if (this.automaticallyPlayed.has(key)) return false;
		this.automaticallyPlayed.add(key);
		return true;
	}
	async toggle(messageId, text, automatic) {
		if (this.view.messageId === messageId && this.current !== null) {
			if (this.current.audio.paused) try {
				await this.current.audio.play();
				this.publish({
					messageId,
					status: "playing",
					error: null
				});
			} catch {
				this.publish({
					messageId,
					status: "paused",
					error: automatic ? "autoplay-blocked" : "play-failed"
				});
			}
			else {
				this.current.audio.pause();
				this.publish({
					messageId,
					status: "paused",
					error: null
				});
			}
			return;
		}
		if (text.length === 0) {
			this.publish({
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
			if (generation !== this.generation) return;
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			this.current = {
				url,
				audio
			};
			this.request = null;
			audio.addEventListener("ended", () => {
				if (this.current?.audio === audio) this.publish({
					messageId,
					status: "idle",
					error: null
				});
			});
			audio.addEventListener("error", () => {
				if (this.current?.audio === audio) this.publish({
					messageId,
					status: "error",
					error: "play-failed"
				});
			});
			try {
				await audio.play();
				this.publish({
					messageId,
					status: "playing",
					error: null
				});
			} catch {
				this.publish({
					messageId,
					status: "paused",
					error: automatic ? "autoplay-blocked" : "play-failed"
				});
			}
		} catch (error) {
			if (controller.signal.aborted || generation !== this.generation) return;
			this.request = null;
			this.publish({
				messageId,
				status: "error",
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}
	dispose() {
		this.generation += 1;
		this.stopCurrent();
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
function ReadAloudAction({ sessionId, messageId, useSession, playback, settings, t }) {
	const message = useSession((snapshot) => ({
		text: messageText(snapshot, messageId),
		time: messageTime(snapshot, messageId),
		latestMessageId: latestAssistantMessageId(snapshot),
		running: snapshot.running
	}));
	const text = message.text;
	const settingsSnapshot = useSettingsSnapshot(settings);
	const view = (0, react.useSyncExternalStore)(playback.subscribe, playback.getSnapshot, playback.getSnapshot);
	(0, react.useEffect)(() => {
		if (text.length === 0 || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || !message.running || message.latestMessageId !== messageId || message.time === null || message.time < playback.autoPlayArmedAt) return;
		const cancel = window.setTimeout(() => {
			if (playback.claimAutomaticPlayback(sessionId, messageId)) playback.toggle(messageId, text, true);
		}, 0);
		return () => window.clearTimeout(cancel);
	}, [
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
	const mine = view.messageId === messageId;
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
				playback.toggle(messageId, text, false);
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
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SettingFieldHeading, {
							label: t("settings.model"),
							overriddenLabel: t("settings.overridden"),
							resetLabel: t("settings.reset"),
							overridden: fieldOverridden("model"),
							resettable: true,
							disabled: !snapshot.writable,
							onReset: () => {
								resetField("model");
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
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
						})]
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
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION,
								disabled: !snapshot.writable,
								"aria-label": t("settings.voiceDesignPrompt"),
								onChange: (event) => {
									setVoiceDesignPrompt(event.target.value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : event.target.value);
									markChange("voiceDesignPrompt");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: CUSTOM_VOICE_DESIGN_OPTION,
									children: "自定义"
								}), TTS_VOICE_DESIGN_PRESETS.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: item.prompt,
									children: item.label
								}, item.label))]
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
	ctx.effect(() => () => playback.dispose(), "xiaomi-mimo-tts: playback");
	ctx.effect(() => {
		const style = document.createElement("style");
		style.dataset.plugin = NS;
		style.textContent = `
      .xmimo-tts-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.xmimo-tts-action:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action:disabled{cursor:default;opacity:.45}.xmimo-tts-spin{animation:xmimo-spin 1s linear infinite}@keyframes xmimo-spin{to{transform:rotate(360deg)}}
      .xmimo-tts-inline-error{max-width:220px;color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px}
      .xmimo-tts-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-3,#fff);overflow:hidden;transition:border-color 160ms ease,background 160ms ease}.xmimo-tts-card:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-open{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-header{appearance:none;display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;border-radius:12px;color:inherit;text-align:left;background:transparent;font:inherit;cursor:pointer}.xmimo-tts-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}.xmimo-tts-card-head-text{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.xmimo-tts-card-title{font-size:15px;font-weight:600}.xmimo-tts-card-description{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:18px}.xmimo-tts-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform 160ms ease}.xmimo-tts-chevron-open{transform:rotate(180deg)}.xmimo-tts-pending{flex:none;border-radius:999px;padding:1px 8px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;font-weight:500;line-height:17px}.xmimo-tts-card-body{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding:0 0 16px}
      .xmimo-tts-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 14px;margin-top:16px;align-items:start}.xmimo-tts-grid label,.xmimo-tts-api-key,.xmimo-tts-model,.xmimo-tts-voice-design-prompt,.xmimo-tts-select-column>div{display:flex;min-width:0;flex-direction:column;gap:6px;font-size:13px}.xmimo-tts-grid input,.xmimo-tts-grid select,.xmimo-tts-grid textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,#f3f4f6);font:inherit}.xmimo-tts-grid select{color-scheme:light dark}.xmimo-tts-grid select option{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-1,#fff)}.xmimo-tts-grid select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:1px}.xmimo-tts-grid small{color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:17px}.xmimo-tts-field-heading{display:flex;min-width:0;min-height:20px;flex-direction:row!important;align-items:center;justify-content:space-between;gap:8px}.xmimo-tts-field-label{display:inline-flex;min-width:0;align-items:center;gap:8px}.xmimo-tts-api-key-link{color:var(--dsw-alias-brand-primary,#4f6ef7);font-size:12px;text-decoration:none}.xmimo-tts-api-key-link:hover{text-decoration:underline}.xmimo-tts-field-badges{display:flex!important;flex:none;flex-direction:row!important;align-items:center;gap:8px}.xmimo-tts-overridden{border-radius:999px;padding:1px 7px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;line-height:17px}.xmimo-tts-reset{padding:0;border:0;color:var(--dsw-alias-label-secondary,#5f6875);background:transparent;font:inherit;font-size:12px;cursor:pointer}.xmimo-tts-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328)}.xmimo-tts-reset:disabled{cursor:not-allowed;opacity:.45}.xmimo-tts-api-key-hints{display:flex;min-width:0;gap:8px;align-items:center}.xmimo-tts-api-key-hints small{min-width:0;white-space:nowrap}.xmimo-tts-wide{grid-column:1/-1}.xmimo-tts-switch-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.xmimo-tts-checkbox-row{flex-direction:row!important;align-items:flex-start!important}.xmimo-tts-checkbox-row input{width:auto!important;flex:none;margin-top:3px}.xmimo-tts-checkbox-row span{display:flex;min-width:0;flex-direction:column;gap:4px}.xmimo-tts-select-column{display:flex;min-width:0;flex-direction:row;gap:16px}.xmimo-tts-select-column>div{flex:1}
      .xmimo-tts-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);font-size:12px;color:var(--dsw-alias-label-tertiary,#8b93a1)}.xmimo-tts-card-actions button{border:1px solid var(--dsw-alias-brand-primary,#4f6ef7);border-radius:8px;padding:5px 14px;color:var(--dsw-alias-bg-layer-1,#fff);background:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;font:inherit}.xmimo-tts-card-actions button:hover:not(:disabled){filter:brightness(1.08)}.xmimo-tts-card-actions button:disabled{cursor:not-allowed;color:var(--dsw-alias-label-dimmed,#9ca3af);background:var(--dsw-alias-bg-layer-2,#f3f4f6);border-color:var(--dsw-alias-border-l2,#e5e7eb);opacity:1}.xmimo-tts-card-actions .xmimo-tts-discard{border-color:var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-secondary,#5f6875);background:transparent}.xmimo-tts-card-actions .xmimo-tts-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-failed{color:var(--dsw-alias-state-error-primary,#dc2626)}
      @media(max-width:720px){.xmimo-tts-grid{grid-template-columns:1fr}.xmimo-tts-wide{grid-column:auto}.xmimo-tts-switch-row{grid-template-columns:1fr}.xmimo-tts-select-column{grid-column:auto;flex-direction:column}.xmimo-tts-api-key-hints{flex-wrap:wrap}.xmimo-tts-api-key-hints small{white-space:normal}}
    `;
		document.head.appendChild(style);
		return () => style.remove();
	}, "xiaomi-mimo-tts: styles");
	registerSlotContribution(ctx, "conversation.chat.assistant-actions", () => ctx.slots.register({
		name: "conversation.chat.assistant-actions",
		id: "xiaomi-mimo-tts",
		order: 20,
		locale: NS,
		inject: () => ({
			playback,
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