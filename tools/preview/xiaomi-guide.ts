import type { ManualCopy } from './document-page.js'
import type { ManualLocale } from './user-manual.js'

const API_KEYS = 'https://platform.xiaomimimo.com/console/api-keys'
const DOCS = 'https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/multimodal-understanding/speech-synthesis-v2.5'
const PRICING = 'https://mimo.mi.com/docs/zh-CN/price/pay-as-you-go'

export const XIAOMI_GUIDE: Record<ManualLocale, ManualCopy> = {
  zh: {
    title: '从小米 MiMo 开始云端朗读',
    intro: '先用预置音色跑通短句，再尝试语音指令和自定义声音。以下操作在真实 DSH 中完成；preview 只播放演示音频，不验证密钥、权限或网络。',
    toc: '本页目录',
    sections: [
      {
        id: 'xiaomi-start', title: '先了解优点与限制',
        summary: '适合希望低成本开始、以预置音色日常朗读为主的用户。官方资料于 2026-11-04 核对，使用体验建议与官方能力分开说明。',
        items: [
          { label: '优点 · 目前限时免费', detail: '官方定价页目前将 MiMo-V2.5-TTS 系列列为限时免费，适合先体验再决定长期方案。免费活动、权限和限额以控制台为准，不代表永久免费或不限并发。' },
          { label: '优点 · 预置音色适合日常稳定使用', detail: '预置音色配置简单，无需先创建声音，可作为日常朗读的起点；固定使用同一预置音色，更容易保持声音一致。支持自然语言调整情绪、语气与风格，建议先用默认设置验证连接。' },
          { label: '不足 · 自定义声音与流式体验有局限', detail: '自定义音色的一致性、分段流式的衔接和情绪延续未必理想，建议先试听后使用。本插件的实时 PCM 仅支持预置音色模型；音色设计不支持同样的实时链路，需要等待合成音频。对情感控制或实时体验要求较高时，可对比豆包与 Breeze。' },
          { label: '插件范围 · 两种模型', detail: '插件提供 mimo-v2.5-tts 预置音色和 mimo-v2.5-tts-voicedesign 音色设计。小米官方还提供其他模型，不能据此认为本插件已支持音频样本复刻。' },
        ],
        links: [{ label: '获取小米 API Key', href: API_KEYS }, { label: '官方 TTS 能力与限制', href: DOCS }, { label: '官方定价与免费政策', href: PRICING }],
      },
      {
        id: 'xiaomi-configure', title: '配置密钥并试听预置音色',
        summary: '先用默认接口、预置音色、正常语速和空指令完成第一次验证。',
        steps: [
          { title: '创建并保存密钥', detail: '在小米 MiMo 开放平台注册或登录，进入 API Key 管理创建密钥，确认账户可用。回到真实 DSH 选择“小米 MiMo”，粘贴完整密钥并保存；不要将豆包或 Breeze 的 Key 填到这里。' },
          { title: '选择预置音色模型', detail: '展开调音台，选择 mimo-v2.5-tts 和一个预置音色。语音指令先留空、语速保持 1×；初次接入保留默认接口地址，不要填官网页面或 API Key 管理页地址。' },
          { title: '关闭本地兜底并验证短句', detail: '将本地语音策略设为“关闭本地语音”并保存，在播报台播放“你好，这是一条小米语音测试。”确认来源为小米，声音与音色匹配并完整播放。密钥格式被识别或 preview 有声音都不代表云端接入成功。' },
          { title: '保存并开启自动播放', detail: '试听满意后保存音色和语音设置，按需恢复本地兜底。启用语音播放与自动播放并保存，再发一条新消息；浏览器可能需要手动播放一次来允许音频。' },
        ], items: [], links: [{ label: '小米 API Key 管理', href: API_KEYS }],
      },
      {
        id: 'xiaomi-expression', title: '语音指令与音色设计',
        summary: '整体语气和声音特征是两类设置：先确定声音，再调整表达。',
        items: [
          { label: '预置音色的语音指令', detail: '用自然语言描述表达方式，例如“用轻松自然的语气，稍微放慢节奏”。同一文本逐项比较，避免一次加入矛盾要求；留空恢复默认表达。实际效果依赖音色和文本。' },
          { label: '音色设计', detail: '切换到 mimo-v2.5-tts-voicedesign 后填写声音描述，说明年龄感、音高、音质与风格等特征；这与上传音频复刻不同。生成的一致性与可控性需要试听确认，不能保证每段都完全相同。' },
          { label: '实时朗读限制', detail: '只有预置音色模型使用插件的实时 PCM 链路；音色设计采用完整音频合成路径。宿主选择“仅最终回答”时仍需等待回复结束，实时播放也受网络和分段衔接影响。' },
        ], links: [{ label: '官方语音合成指南', href: DOCS }, { label: '比较豆包接入', href: '#doubao' }, { label: '比较 Breeze 接入', href: '#breeze' }],
      },
      {
        id: 'xiaomi-troubleshooting', title: '故障排查', summary: '关闭本地兜底，用预置音色和短句检查基础连接。',
        items: [
          { label: '密钥或额度问题', detail: '确认小米为当前服务商、密钥已保存且有效；检查开放平台权限、当前免费活动和调用限制。保存密钥不等于验证权限。' },
          { label: '超时或连接失败', detail: '检查 DSH 所在机器到小米 API 的连接与代理配置；使用自定义兼容接口时，确认它支持当前 TTS 模型与音频格式，不仅是文本对话。' },
          { label: '自定义声音或实时效果不理想', detail: '先切回预置音色比较，用完整短句和简洁指令减少变量。音色设计无法走实时 PCM 时属于当前限制；需要更丰富的声音或表现力，可参照豆包、Breeze 页面选型。旧录音不会随新设置更新。' },
        ], links: [{ label: '返回用户手册', href: '#manual' }],
      },
    ],
    notes: [{ title: '接入完成的标准', body: '在真实 DSH 关闭本地兜底后，小米来源的短句可完整播放，密钥、模型与音色均已保存。之后再验证自动朗读或 QQ 联动。' }],
  },
  en: {
    title: 'Start cloud reading with Xiaomi MiMo',
    intro: 'Verify a short sentence with a preset voice before trying instructions or voice design. Follow these steps in real DSH; this preview uses sample audio and does not verify keys or network access.',
    toc: 'On this page',
    sections: [
      {
        id: 'xiaomi-start', title: 'Strengths and limitations', summary: 'A starting point for low-cost everyday reading with preset voices. Official sources checked on November 4, 2026; practical guidance is separate from vendor guarantees.',
        items: [
          { label: 'Strength · Currently free for a limited time', detail: 'Official pricing currently lists MiMo-V2.5-TTS models as temporarily free. Check the console for current eligibility, access, and limits; this is not permanent or unlimited usage.' },
          { label: 'Strength · Preset voices for consistent daily use', detail: 'Preset voices are simple to configure without creating a voice first. Keeping the same preset helps maintain a consistent voice. Natural-language instructions adjust emotion and delivery; verify the connection with defaults first.' },
          { label: 'Limit · Custom voices and streaming', detail: 'Custom-voice consistency, segment joins, and emotional continuity may be uneven; audition first. The plugin’s realtime PCM path supports only the preset model. Voice design waits for complete audio. Compare Doubao and Breeze for expressive or realtime needs.' },
          { label: 'Plugin scope · Two models', detail: 'The plugin offers mimo-v2.5-tts and mimo-v2.5-tts-voicedesign. Other models offered by Xiaomi do not imply support here for cloning from uploaded samples.' },
        ], links: [{ label: 'Get a Xiaomi API key', href: API_KEYS }, { label: 'Official TTS capabilities', href: DOCS }, { label: 'Official pricing and free access', href: PRICING }],
      },
      {
        id: 'xiaomi-configure', title: 'Save a key and test a preset voice', summary: 'Start with the default endpoint, a preset voice, normal speed, and no instructions.',
        steps: [
          { title: 'Create and save a key', detail: 'Register or sign in to Xiaomi MiMo and create a key in API Keys. Select Xiaomi MiMo in real DSH, paste the complete key, and save. Doubao and Breeze credentials are separate.' },
          { title: 'Choose the preset model', detail: 'In Console select mimo-v2.5-tts and a preset voice. Leave instructions blank and speed at 1×. Keep the default API endpoint for the first test; a website or key-management URL is not an API endpoint.' },
          { title: 'Disable fallback and test', detail: 'Save Disable local speech and play a short sentence in Broadcast Desk. Verify the Xiaomi source, selected voice, and completed audio. Recognizing the key format or hearing this preview does not verify cloud access.' },
          { title: 'Save and enable automatic reading', detail: 'Save the voice settings and restore fallback if wanted. Enable and save speech playback and autoplay, then send a new message. The browser may require manual playback first.' },
        ], items: [], links: [{ label: 'Xiaomi API keys', href: API_KEYS }],
      },
      {
        id: 'xiaomi-expression', title: 'Instructions and voice design', summary: 'Choose the voice first, then adjust its delivery.',
        items: [
          { label: 'Preset voice instructions', detail: 'Try “Speak naturally and warmly, with a slightly slower pace.” Change one request at a time and avoid conflicting instructions. Leave blank for default delivery; results depend on the voice and text.' },
          { label: 'Voice design', detail: 'Select mimo-v2.5-tts-voicedesign and describe age, pitch, texture, and style. This does not clone from uploaded audio. Audition consistency and control; separate generations may differ.' },
          { label: 'Realtime limits', detail: 'Only the preset model uses realtime PCM in this plugin. Voice design uses complete audio synthesis. Final answer only waits for completion; network and segment joins still affect playback.' },
        ], links: [{ label: 'Official synthesis guide', href: DOCS }, { label: 'Compare Doubao', href: '#doubao' }, { label: 'Compare Breeze', href: '#breeze' }],
      },
      {
        id: 'xiaomi-troubleshooting', title: 'Troubleshooting', summary: 'Disable local fallback and use a short sentence with a preset voice.',
        items: [
          { label: 'Key or quota problems', detail: 'Check Xiaomi is active and the saved key is valid. Review platform permissions, current free access, and request limits. Saving a key does not verify access.' },
          { label: 'Timeouts', detail: 'Check connectivity and proxy settings from the DSH host. A custom compatible endpoint must support the TTS model and audio format, not just text conversation.' },
          { label: 'Uneven custom voices or streaming', detail: 'Compare with a preset voice, complete short sentences, and simple instructions. Voice design cannot use realtime PCM here. Consider Doubao or Breeze for other voices or delivery. Old recordings do not change with settings.' },
        ], links: [{ label: 'User manual', href: '#manual' }],
      },
    ],
    notes: [{ title: 'A completed setup', body: 'With local fallback disabled in real DSH, a Xiaomi sentence plays completely and the key, model, and voice are saved. Then verify automatic reading or QQ integration.' }],
  },
}
