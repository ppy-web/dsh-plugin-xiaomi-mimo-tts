import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin identifier. */
export declare const name = "xiaomi-mimo-tts";
/** Host services required by this plugin. */
export declare const inject: string[];
/** Settings namespace registered with the DSH Host. */
export declare const XIAOMI_MIMO_TTS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Validated Host settings schema. */
export declare const Config: z<Schemastery.ObjectS<{
    enabled: z<boolean, boolean>;
    apiKey: z<string, string>;
    baseURL: z<string, string>;
    model: z<"mimo-v2.5-tts" | "mimo-v2.5-tts-voicedesign", "mimo-v2.5-tts" | "mimo-v2.5-tts-voicedesign">;
    voice: z<string, string>;
    voiceDesignPrompt: z<string, string>;
    voiceDesignCustomPrompt: z<string, string>;
    format: z<"mp3" | "wav", "mp3" | "wav">;
    autoPlay: z<boolean, boolean>;
    instruction: z<string, string>;
    maxTextLength: z<number, number>;
    requestTimeoutMs: z<number, number>;
}>, Schemastery.ObjectT<{
    enabled: z<boolean, boolean>;
    apiKey: z<string, string>;
    baseURL: z<string, string>;
    model: z<"mimo-v2.5-tts" | "mimo-v2.5-tts-voicedesign", "mimo-v2.5-tts" | "mimo-v2.5-tts-voicedesign">;
    voice: z<string, string>;
    voiceDesignPrompt: z<string, string>;
    voiceDesignCustomPrompt: z<string, string>;
    format: z<"mp3" | "wav", "mp3" | "wav">;
    autoPlay: z<boolean, boolean>;
    instruction: z<string, string>;
    maxTextLength: z<number, number>;
    requestTimeoutMs: z<number, number>;
}>>;
export type Config = ReturnType<typeof Config>;
/** Register the TTS settings and same-origin synthesis route. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map