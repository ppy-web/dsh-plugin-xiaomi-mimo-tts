import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Client services required by this plugin. */
export declare const inject: string[];
declare const zh: {
    readonly 'action.play': "朗读回复";
    readonly 'action.pause': "暂停朗读";
    readonly 'action.resume': "继续朗读";
    readonly 'action.loading': "正在生成语音";
    readonly 'action.retry': "重新生成语音";
    readonly 'error.noText': "这条回复没有可朗读的正文。";
    readonly 'error.request': "语音生成失败。";
    readonly 'error.play': "浏览器阻止了自动播放，请点击朗读按钮。";
    readonly 'settings.title': "语音朗读 (Xiaomi MiMo)";
    readonly 'settings.description': "在助手回复操作栏中使用 Xiaomi MiMo TTS 生成并播放语音。";
    readonly 'settings.enabled': "显示朗读按钮";
    readonly 'settings.enabledHint': "关闭后不会在助手回复操作栏显示朗读按钮，也不会自动播报。";
    readonly 'settings.apiKey': "API Key";
    readonly 'settings.apiKeyHint': "密钥保存在 DSH 设置文件中，传到浏览器前会被脱敏。";
    readonly 'settings.apiKeyStatus': "只有输入新值并保存时才会替换现有密钥。";
    readonly 'settings.apiKeyConfigured': "已配置";
    readonly 'settings.getApiKey': "获取 API Key";
    readonly 'settings.autoPlay': "开启自动播报";
    readonly 'settings.autoPlayHint': "开启时会同步显示朗读按钮；浏览器也可能拒绝自动播放。";
    readonly 'settings.model': "TTS 模型";
    readonly 'settings.presetModel': "预置音色模型";
    readonly 'settings.voiceDesignModel': "自定义音色模型";
    readonly 'settings.modelAutoPlayHintPreset': "预置音色模型支持实时流式播放。";
    readonly 'settings.modelAutoPlayHintVoiceDesign': "自定义音色仅支持在回复完成后自动播放。";
    readonly 'settings.voice': "内置音色";
    readonly 'settings.voiceDesignPrompt': "自定义音色描述";
    readonly 'settings.voiceDesignPromptHint': "按“年龄段 + 性别、声音质感、语速节奏、情绪底色”描述声音本身；不写场景或动作。";
    readonly 'settings.format': "音频格式";
    readonly 'settings.save': "保存";
    readonly 'settings.saving': "保存中…";
    readonly 'settings.saved': "已保存";
    readonly 'settings.unsaved': "未保存";
    readonly 'settings.overridden': "已覆盖";
    readonly 'settings.reset': "恢复默认";
    readonly 'settings.discard': "放弃修改";
    readonly 'settings.failed': "保存失败，请重试。";
    readonly 'settings.readOnly': "当前 DSH 设置为只读。";
    readonly 'settings.secretPlaceholder': "输入新的 Xiaomi MiMo API Key";
    readonly 'settings.expand': "展开设置";
    readonly 'settings.collapse': "收起设置";
};
type LocaleKey = keyof typeof zh;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'xiaomi-mimo-tts': LocaleKey;
    }
}
/** Register the Web action, settings card, locale dictionaries, and styles. */
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map