import type {} from '@deepseek-ai/dsh-client-locale/client'

export const NS = 'xiaomi-mimo-tts'

export const zh = {
  "action.play": "朗读回复",
  "action.pause": "暂停朗读",
  "action.resume": "继续朗读",
  "action.loading": "正在生成语音",
  "action.cancel": "取消语音生成",
  "action.stop": "停止朗读",
  "action.localFallback": "本地语音",
  "action.retry": "重新生成语音",
  "error.noText": "没有可朗读的正文。",
  "error.request": "语音生成失败。",
  "error.play": "浏览器阻止了自动播放，请点击朗读按钮。",
  "error.localNotAllowed": "本地语音被拒绝了，请重试。",
  "error.localVoiceUnavailable": "当前浏览器音色不可用，请重新选择音色。",
  "error.localTimeout": "等待超时。",
  "error.localAudioDevice": "本地音频设备异常，请检查系统声音设置。",
  "error.localSynthesis": "本地语音合成失败，请重试。",
  "settings.title": "语音朗读 (Xiaomi MiMo)",
  "settings.description": "在对话中使用 Xiaomi MiMo TTS 生成并播放语音。",
  "settings.enabled": "语音播报",
  "settings.enabledOnLabel": "开麦啦",
  "settings.enabledOffLabel": "休息一会儿",
  "settings.enabledHint": "关闭后会隐藏语音设置并停止自动播报。",
  "settings.apiKey": "MiMo API Key",
  "settings.apiKeyStatus": "只有输入新值并保存时才会替换现有密钥。",
  "settings.apiKeyConfigured": "已配置",
  "settings.apiKeyMissing": "尚未配置 API Key，请先获取并设置密钥。",
  "settings.apiKeyUnsupported":
    "这个 API Key 似乎是错的，请检查（sk-/tp- 开头）。",
  "settings.getApiKey": "获取 API Key",
  "settings.autoPlay": "自动播报",
  "settings.autoPlayOnLabel": "主动念给你听",
  "settings.autoPlayOffLabel": "等你叫我再念",
  "settings.autoPlayHint": "浏览器可能会拒绝自动播放。",
  "settings.detailedVoiceConfig": "调音台",
  "settings.summaryPresetModel": "预置模型",
  "settings.summaryVoiceDesignModel": "自定义音色",
  "settings.localSpeechAutoSummary": "MiMo 优先",
  "settings.stateOn": "已开启",
  "settings.stateOff": "已关闭",
  "settings.model": "模型选择",
  "settings.presetModel": "预置音色模型 (mimo-v2.5-tts)",
  "settings.voiceDesignModel": "自定义音色模型 (mimo-v2.5-tts-voicedesign)",
  "settings.localSpeechMode": "语音策略",
  "settings.localSpeechAuto": "MiMo 优先（默认）",
  "settings.localSpeechFirst": "本地优先",
  "settings.localSpeechDisabled": "关闭本地语音",
  "settings.localSpeechAutoHint": "优先使用 MiMo 音色，失败时使用本地语音。",
  "settings.localSpeechFirstHint":
    "优先使用浏览器本地语音朗读，失败时尝试使用 MiMo 音色。",
  "settings.localSpeechDisabledHint":
    "仅使用 MiMo 音色，失败时不会切换到本地语音。",
  "settings.localVoice": "本地音色",
  "settings.localVoiceLoading": "正在读取浏览器音色…",
  "settings.localVoiceUnavailable": "没有可用的浏览器音色",
  "settings.localVoiceOffline": "离线",
  "settings.localVoiceOnline": "在线",
  "settings.modelAutoPlayHintPreset": "预置音色的播放方式由音频格式决定。",
  "settings.modelAutoPlayHintVoiceDesign":
    "自定义音色仅支持在回复完成后自动播放。",
  "settings.voice": "内置音色",
  "settings.format": "音频格式",
  "settings.formatPcm": "PCM（流式播放）",
  "settings.formatMp3": "MP3（完整音频）",
  "settings.formatWav": "WAV（完整音频）",
  "settings.formatPcmHint": "边生成边播放，首个音频分片前失败时自动回退 MP3。",
  "settings.formatMp3Hint": "完整生成后播放，文件更小。",
  "settings.formatWavHint": "完整生成后播放，保留无损音频但文件更大。",
  "settings.voiceDesignPrompt": "自定义音色描述",
  "settings.customVoiceOption": "自定义",
  "settings.customVoiceSummary": "手动编写音色描述",
  "settings.voiceDesignPromptHint":
    "按“年龄段 + 性别、声音质感、语速节奏、情绪底色”描述声音本身；不写场景或动作。",
  "settings.voiceDesignPlaybackMode": "朗读方式",
  "settings.voiceDesignPlaybackComplete": "完整朗读",
  "settings.voiceDesignPlaybackSegmented": "分片朗读",
  "settings.voiceDesignPlaybackCompleteHint":
    "整篇生成后播放，语调连续性更好。长文本会出现模型幻觉。",
  "settings.voiceDesignPlaybackSegmentedHint":
    "适合长文本，分段生成、更快播放。但会重新推导音色细节，语调连续性略差。",
  "settings.previewTitle": "演播厅",
  "settings.previewText": "试听文本",
  "settings.previewDefaultText":
    "你好呀，很高兴陪你一起探索声音的世界！这个声音听起来怎么样？",
  "settings.previewPlaceholder": "输入一段想试听的文字",
  "settings.previewPlay": "播放试听",
  "settings.previewStop": "停止试听",
  "settings.previewHint": "写好台词后，点击小鲸鱼，让她念给你听",
  "settings.previewLoading": "清清嗓子...",
  "settings.previewPlaying": "正在播放...",
  "settings.previewFailed": "试听失败，请检查 API Key、网络或本地音色。",
  "settings.save": "保存",
  "settings.saving": "保存中…",
  "settings.saved": "已保存",
  "settings.unsaved": "未保存",
  "settings.overridden": "已覆盖",
  "settings.reset": "恢复默认",
  "settings.discard": "放弃修改",
  "settings.failed": "保存失败，请重试。",
  "settings.source": "✨查看源码",
  "settings.uninstall": "卸载",
  "settings.uninstalling": "卸载中…",
  "settings.uninstallQuestion": "确认卸载？",
  "settings.uninstallConfirm": "确认",
  "settings.uninstallCancel": "取消",
  "settings.uninstalled": "已卸载；重启DSH不再加载此插件。",
  "settings.uninstallFailed": "卸载失败，请重试或使用 DSH 命令行卸载。",
  "settings.updateAvailable": "🎉新版已发布",
  "settings.readOnly": "当前 DSH 设置为只读。",
  "settings.secretPlaceholder": "输入新的 Xiaomi MiMo API Key",
  "settings.expand": "展开设置",
  "settings.collapse": "收起设置",
} as const;

export const en: Record<keyof typeof zh, string> = {
  "action.play": "Read aloud",
  "action.pause": "Pause speech",
  "action.resume": "Resume speech",
  "action.loading": "Generating speech",
  "action.cancel": "Cancel speech generation",
  "action.stop": "Stop speech",
  "action.localFallback": "Local speech",
  "action.retry": "Generate speech again",
  "error.noText": "This response has no readable body text.",
  "error.request": "Speech generation failed.",
  "error.play": "The browser blocked autoplay. Click Read aloud to play it.",
  "error.localNotAllowed":
    "The browser blocked local speech. Click Read aloud to try again.",
  "error.localVoiceUnavailable":
    "The selected browser voice is unavailable. Choose another voice.",
  "error.localTimeout":
    "Browser speech did not respond within 2 minutes, so this playback was stopped.",
  "error.localAudioDevice":
    "The local audio device reported an error. Check your system sound settings.",
  "error.localSynthesis": "Local speech synthesis failed. Please try again.",
  "settings.title": "Text To Speech (Xiaomi MiMo)",
  "settings.description":
    "Generate and play Xiaomi MiMo TTS audio from assistant message actions.",
  "settings.enabled": "Voice playback",
  "settings.enabledOnLabel": "Whale maid is on air",
  "settings.enabledOffLabel": "Whale maid is resting",
  "settings.enabledHint":
    "Disabling it hides voice settings and turns off automatic playback.",
  "settings.apiKey": "API Key",
  "settings.apiKeyStatus":
    "An existing key changes only when you save a new value.",
  "settings.apiKeyConfigured": "Configured",
  "settings.apiKeyMissing":
    "No API key is configured. Get and set an API key first.",
  "settings.apiKeyUnsupported":
    "This API key seems invalid. Check it and set it again (starting with sk- or tp-).",
  "settings.getApiKey": "Get API Key",
  "settings.autoPlay": "Automatic playback",
  "settings.autoPlayOnLabel": "I'll read it to you",
  "settings.autoPlayOffLabel": "Call me when you need me",
  "settings.autoPlayHint": "The browser may reject automatic playback.",
  "settings.detailedVoiceConfig": "Mixing Console",
  "settings.summaryPresetModel": "Preset model",
  "settings.summaryVoiceDesignModel": "Custom voicedesign",
  "settings.localSpeechAutoSummary": "MiMo first",
  "settings.stateOn": "On",
  "settings.stateOff": "Off",
  "settings.model": "Voice source settings",
  "settings.presetModel": "Preset voices (mimo-v2.5-tts)",
  "settings.voiceDesignModel":
    "Custom voice design (mimo-v2.5-tts-voicedesign)",
  "settings.localSpeechMode": "Speech strategy",
  "settings.localSpeechAuto": "MiMo first (default)",
  "settings.localSpeechFirst": "Local first",
  "settings.localSpeechDisabled": "Disable local speech",
  "settings.localSpeechAutoHint":
    "Uses the MiMo voice first and falls back to local speech if MiMo fails.",
  "settings.localSpeechFirstHint":
    "Uses browser-local speech first and tries the MiMo voice if local speech fails.",
  "settings.localSpeechDisabledHint":
    "Uses only the MiMo voice and never falls back to local speech.",
  "settings.localVoice": "Browser voice",
  "settings.localVoiceLoading": "Loading browser voices…",
  "settings.localVoiceUnavailable": "No browser voices available",
  "settings.localVoiceOffline": "Offline",
  "settings.localVoiceOnline": "Online",
  "settings.modelAutoPlayHintPreset":
    "The selected audio format controls preset-voice playback.",
  "settings.modelAutoPlayHintVoiceDesign":
    "Custom voice design supports automatic playback only after the reply is complete.",
  "settings.voice": "Built-in voice",
  "settings.format": "Audio format",
  "settings.formatPcm": "PCM (streaming)",
  "settings.formatMp3": "MP3 (complete audio)",
  "settings.formatWav": "WAV (complete audio)",
  "settings.formatPcmHint":
    "Plays chunks as they arrive for a shorter wait; supports pause and resume. Falls back to MP3 if streaming fails before the first audio chunk.",
  "settings.formatMp3Hint":
    "Plays after the complete file is generated. Smaller file size; supports pause and resume.",
  "settings.formatWavHint":
    "Plays after the complete lossless file is generated. Larger file size; supports pause and resume.",
  "settings.voiceDesignPrompt": "Custom voice description",
  "settings.customVoiceOption": "Custom",
  "settings.customVoiceSummary": "Write a custom voice description",
  "settings.voiceDesignPromptHint":
    "Describe the voice itself with age/gender, texture, pace, and emotional baseline; avoid scenes or actions.",
  "settings.voiceDesignPlaybackMode": "Read-aloud mode",
  "settings.voiceDesignPlaybackComplete": "Complete",
  "settings.voiceDesignPlaybackSegmented": "Segmented",
  "settings.voiceDesignPlaybackCompleteHint":
    "Generates the entire reply before playback for better continuity.",
  "settings.voiceDesignPlaybackSegmentedHint":
    "Generates and plays semantic segments in order; better for long text and faster start.",
  "settings.previewTitle": "Broadcast Studio",
  "settings.previewText": "Preview text",
  "settings.previewDefaultText":
    "Hi! I'm Whale Maid. It's lovely to explore the world of voices with you!",
  "settings.previewPlaceholder": "Enter some text to preview",
  "settings.previewPlay": "Play preview",
  "settings.previewStop": "Stop preview",
  "settings.previewHint":
    "When your line is ready, tap the perched Whale Maid in the top-right to hear it.",
  "settings.previewLoading": "Whale Maid is preparing the voice…",
  "settings.previewPlaying": "Whale Maid is on air. Tap her again to stop.",
  "settings.previewFailed":
    "Preview failed. Check the API key, network, or browser voice.",
  "settings.save": "Save",
  "settings.saving": "Saving…",
  "settings.saved": "Saved",
  "settings.unsaved": "Unsaved",
  "settings.overridden": "Overridden",
  "settings.reset": "Restore default",
  "settings.discard": "Discard changes",
  "settings.failed": "Save failed. Try again.",
  "settings.source": "✨ View source",
  "settings.uninstall": "Uninstall",
  "settings.uninstalling": "Uninstalling…",
  "settings.uninstallQuestion": "Confirm uninstall?",
  "settings.uninstallConfirm": "Confirm",
  "settings.uninstallCancel": "Cancel",
  "settings.uninstalled":
    "Uninstalled. DSH remains active and will not load the plugin on its next start.",
  "settings.uninstallFailed":
    "Uninstall failed. Try again or remove the plugin with the DSH CLI.",
  "settings.updateAvailable": "🎉 New release",
  "settings.readOnly": "DSH settings are read-only.",
  "settings.secretPlaceholder": "Enter a new Xiaomi MiMo API key",
  "settings.expand": "Expand settings",
  "settings.collapse": "Collapse settings",
};

export type LocaleKey = keyof typeof zh

export type Translate = (key: LocaleKey) => string

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'xiaomi-mimo-tts': LocaleKey
  }
}
