import type { ManualCopy } from './document-page.js'
import type { ManualLocale } from './user-manual.js'

const CONSOLE_KEY = 'https://console.volcengine.com/speech/new/setting/apikeys?projectName=default'
const CONSOLE_VOICES = 'https://console.volcengine.com/speech/new/voices?projectName=default'
const CONSOLE_CLONE = 'https://console.volcengine.com/speech/new/experience/clone?projectName=default'
const STREAMING_DOCS = 'https://docs.volcengine.com/docs/doubao-voice/bidirectional-streaming-text-to-speech-websocket?lang=zh'
const INSTRUCTION_DOCS = 'https://docs.volcengine.com/docs/doubao-voice/doubao-text-to-speech-20-capability-introduction?lang=zh'
const PLAN_DOCS = 'https://docs.volcengine.com/docs/ark/agent-plan-personal-faq?lang=zh'

export const DOUBAO_GUIDE: Record<ManualLocale, ManualCopy> = {
  zh: {
    title: '从一把密钥到第一句豆包语音',
    intro: '先用标准音色完成云端试听，再尝试复刻音色、语音指令和实时朗读。以下步骤在火山引擎控制台与真实 DSH 中操作；preview 使用模拟配置和演示音频，不验证你的密钥或资源权限。',
    toc: '本页目录',
    sections: [
      {
        id: 'doubao-start', title: '选择服务与模型',
        summary: '插件支持标准合成 2.0 与声音复刻 2.0。先确认账号、密钥、模型资源和音色属于可一起使用的一套配置。',
        table: {
          caption: '先选你要使用的声音来源', headers: ['用途', '插件模型', '需要准备'],
          rows: [
            ['使用现成声音', '标准合成 · seed-tts-2.0', '开通对应合成资源，准备可用的 TTS 2.0 标准音色；首次接入建议选内置音色。'],
            ['使用自己的复刻音色', '声音复刻 · seed-icl-2.0', '开通对应资源，在控制台完成音色创建并取得可用的复刻音色 ID。'],
          ],
        },
        items: [
          { label: '标准服务的 Key', detail: '在豆包语音新版控制台的“API Key 管理”获取密钥，并开通所需模型资源。插件使用 API Key，不是把旧教程里的 AppID、Access Token 或 Secret Key 拼起来；请使用当前控制台提供的对应凭据。' },
          { label: 'Agent Plan 的 Key', detail: '使用 Agent Plan 时，取该套餐控制台的专属 API Key，并核对套餐当前支持的语音能力与剩余额度。插件按 Key 自动选择标准或 Agent Plan 线路，无需手填接口地址。Coding Plan 不包含语音模型，不能仅凭对话模型能用就判定语音也可用。' },
          { label: '先核对资源，再调参数', detail: '密钥能保存、格式被识别，都不等于模型权限已开通。标准合成与复刻需要各自对应资源，音色也必须可被当前账号／项目使用。不要用复刻 ID 测标准模型，或用标准音色 ID 测复刻模型。' },
        ],
        links: [{ label: '豆包 API Key 管理', href: CONSOLE_KEY }, { label: 'Agent Plan 与 Coding Plan 区别', href: PLAN_DOCS }, { label: '官方接口与资源说明', href: STREAMING_DOCS }],
      },
      {
        id: 'doubao-configure', title: '在 DSH 配置标准音色',
        summary: '先用默认表达、正常语速和内置标准音色，减少首次排查时的变量。',
        steps: [
          { title: '开通并确认服务可用', detail: '登录火山引擎，进入豆包语音控制台，按页面提示开通标准合成所需资源；检查当前账号／项目的权限与可用额度。使用 Agent Plan 则核对套餐的语音权限及专属 Key。开通方式和计费以控制台实时显示为准。' },
          { title: '选择豆包并保存密钥', detail: '在真实 DSH 打开本插件设置，切换服务商到“豆包语音”，将对应 API Key 粘贴到密码框并点击底部“保存”。两家服务商的配置独立保留，切换不会把小米 Key 当作豆包 Key。新 Key 必须先保存，试听不会读取尚未保存的密钥草稿。' },
          { title: '选择标准合成与音色', detail: '展开“调音台”，模型选“标准合成（seed-tts-2.0）”，先选一个内置标准音色。语速先保持 1×，语音指令留空。需要其他音色时，在音色库确认它属于 TTS 2.0，再通过自定义选项填写完整音色 ID，不要只填显示名称。' },
          { title: '暂时关闭本地兜底', detail: '将本地语音策略改为“关闭本地语音”，然后保存模型、音色与策略。这样云端失败会直接显示错误，避免“听到声音”其实是浏览器本地语音。验证成功后可恢复你需要的兜底策略并保存。' },
        ], items: [],
        links: [{ label: '查看控制台音色库', href: CONSOLE_VOICES }, { label: '标准音色官方列表', href: 'https://docs.volcengine.com/docs/DoubaoVoice/Tonelist-1?lang=zh' }],
      },
      {
        id: 'doubao-verify', title: '验证第一句云端语音',
        summary: '验证地点是真实 DSH 的播报台，验收结果是“豆包来源状态 + 实际可听的云端音频”。',
        steps: [
          { title: '输入短句并手动播放', detail: '在“播报台”输入“你好，这是一条豆包语音测试。”，点击播放试听。试听文本最多 100 字符；先用短句，不要用长文排查首次连接。若语音播放总开关关闭、播报台被隐藏，先打开它。' },
          { title: '确认声音确实来自豆包', detail: '查看试听状态中的服务商，确认显示豆包并播放完成，声音与所选音色一致。API Key 的“格式已识别”仅说明格式；preview 的演示播放和启用引导中的浏览器语音都不能作为云端验证。' },
          { title: '验证保存后的行为', detail: '试听可使用模型、音色、语速等草稿；如果试听满意，点击“保存”，之后重新进入设置核对已保存值。QQ 等宿主渠道使用已保存配置，不能只停留在试听成功但未保存的状态。' },
        ],
        items: [{ label: '失败时先记录提示', detail: '保留错误类型、发生时间及脱敏后的请求标识，按本页末尾排错。不要为了让试听“有声音”先打开本地兜底，否则会混淆云端问题。' }],
      },
      {
        id: 'doubao-clone', title: '接入自己的复刻音色',
        summary: '音色创建在火山引擎完成，插件负责使用已有 ID 合成，不上传训练样本或自动创建音色。',
        steps: [
          { title: '在控制台完成音色创建', detail: '打开“创建音色”页面，按控制台流程提交所需素材、完成创建，并确认音色已达到可合成状态。核对当前 Key 所属账号／项目有该音色的使用权限；仅提交创建任务还不代表音色已可用。' },
          { title: '复制音色 ID 并切换模型', detail: '复制控制台给出的完整音色 ID，回到 DSH，将豆包模型改成“声音复刻（seed-icl-2.0）”，填入“复刻音色 ID”。这里需要 ID，不是音色昵称、任务 ID 或示例占位符；留空时不能保存或试听。' },
          { title: '保存并重新试听', detail: '保存后，用与标准合成相同的短句测试，保持本地兜底关闭。标准音色和复刻 ID 分别保存，输入框下可选择最近使用的 ID；切回标准模型时无需把复刻 ID 填进标准音色。' },
        ],
        items: [{ label: '复刻不应用语音指令', detail: '豆包声音复刻不发送标准合成的语音指令。若要比较情绪或风格预设，请切回支持指令的 TTS 2.0 标准音色；复刻音色的基础声音来自控制台创建结果。' }],
        links: [{ label: '在控制台创建音色', href: CONSOLE_CLONE }],
      },
      {
        id: 'doubao-style', title: '语音指令与语速',
        summary: '基础合成成功后再逐项微调，每次用同一句文本对比效果。',
        items: [
          { label: '情绪、风格与方言', detail: '标准合成可选预设或手动填写自然语言指令，例如“用轻松、自然的语气说话”。先保持一句明确要求，避免互相矛盾的描述。留空恢复默认表达；豆包与小米的指令独立保存，切换服务商不会覆盖另一家的设置。' },
          { label: '指令的适用范围', detail: '仅支持相应指令能力的 TTS 2.0 标准音色会应用指令，自定义 ID 也要确认系列。方言预设使用自然语言请求，不等于强制设置固定方言参数；实际效果取决于音色能力与待朗读文本。本地浏览器语音和豆包复刻不应用这些指令。' },
          { label: '语速与历史录音', detail: '可调整 0.5×–2.0×，豆包在云端合成开始时应用语速，播放按 1× 进行。音频历史保存的是已包含该语速的录音，重听不会再次加速；之后改语速也不会改变旧录音，需重新合成来比较。' },
          { label: '保存后再用于会话', detail: '试听可以比较草稿效果，确定后仍需保存。切换服务商或修改已保存语音指令会停止当前朗读，新配置用于后续回复。' },
        ],
        links: [{ label: '官方语音指令说明', href: INSTRUCTION_DOCS }],
      },
      {
        id: 'doubao-streaming', title: '开启实时朗读与 QQ 联动',
        summary: '手动云端试听成功后，再分别验证浏览器自动朗读与 QQ 发送。两条链路的开关不同。',
        steps: [
          { title: '开启浏览器自动朗读', detail: '打开并保存“语音播放”和“自动播放”，新建或进入对话后发一条新消息。浏览器可能要求先手动播放一次以允许音频。宿主回复偏好为“全部回复”时，豆包可边接收新增文本边合成播放；“仅最终回答”会等回合完成，这是预期行为。' },
          { title: '确认 WebSocket 链路', detail: '持续文本输入需要 DSH 宿主支持 WebSocket upgrade；经反向代理访问时，代理需支持 WebSocket 并转发 Upgrade。若短句试听正常，但边生成边朗读失败，先比较直连 DSH 与代理访问的表现，再检查宿主版本、代理和连接日志。' },
          { title: '单独配置 QQ 语音', detail: '希望把豆包音色发到 QQ，请先保存豆包的模型与音色，再按独立的 QQBot 教程开启传声组件、选择 QQ 预设并验证。QQ 自动语音等待轮次成功结束，不依赖浏览器自动播放，也不等于网页中的实时朗读。' },
        ],
        items: [{ label: '停止和切换会话', detail: '停止当前朗读会取消当前流式会话。切换会话、中途打开正在生成的会话，或切换宿主回复偏好，不会补播此前内容；请发一条新消息验证后续行为。' }],
        links: [{ label: 'QQBot 接入教程', href: '#qqbot' }, { label: '用户手册中的朗读设置', href: '#manual-console' }],
      },
      {
        id: 'doubao-troubleshooting', title: '常见故障与检查顺序',
        summary: '先关闭本地兜底，以短句复现，再从密钥 → 资源 → 音色 → 网络逐项排除。',
        items: [
          { label: '密钥未配置或被拒绝', detail: '确认选中豆包服务商、使用正确来源的 Key 且已点击保存；不要用小米、旧版 Token 或 Coding Plan Key 替代。若已保存但被拒绝，核对 Key 是否失效、账号／项目是否一致，Agent Plan 是否使用专属 Key。' },
          { label: '资源未开通或音色不可用', detail: '检查 seed-tts-2.0／seed-icl-2.0 对应权限和资源是否开通；核对完整音色 ID、音色所属系列及账号访问权限。复刻还需确认控制台创建完成。可切回内置标准音色对比，帮助区分复刻权限与基础连接问题。' },
          { label: '限流、额度不足或超时', detail: '查看对应控制台的额度、用量和并发状态；限流时停止并发试听，稍后用单条短句重试。超时则检查 DSH 所在机器到供应商的网络与日志，不要只确认本机浏览器能打开控制台。' },
          { label: '能听到声音但音色或指令不对', detail: '先确认来源确实为豆包，关闭本地兜底后再测。再检查标准／复刻模型、音色 ID、指令支持范围及是否保存。旧历史录音不会因设置改变而更新，比较效果需生成新的音频。' },
          { label: '手动正常，自动或实时朗读异常', detail: '核对语音播放与自动播放是否保存、浏览器是否允许播放，以及宿主是否选择“仅最终回答”。只有经代理才失败时检查 WebSocket Upgrade；若 QQ 不出声则转到 QQBot 教程，检查传声组件、来源与会话预设。' },
          { label: '提交问题时记录', detail: '附上 DSH 与插件版本、标准／Agent Plan 路线、模型、所选音色、错误类型和请求标识，以及是否使用代理和本地兜底。分享日志前移除密钥、账号凭据和私人文本。' },
        ],
        links: [{ label: '返回用户手册', href: '#manual' }, { label: 'QQBot 故障排查', href: '#qqbot-troubleshooting' }],
      },
    ],
    notes: [{ title: '接入完成的标准', body: '在真实 DSH 关闭本地兜底后，豆包短句试听可播放完成；模型、音色与 Key 均已保存。之后再按需要恢复兜底、开启自动朗读或配置 QQ 发送。' }],
  },
  en: {
    title: 'From an API key to your first Doubao voice',
    intro: 'Start with a standard voice, then try voice cloning, instructions, and streaming. Follow these steps in the Volcano Engine console and real DSH. This preview uses mock settings and sample audio; it does not verify keys or resource access.',
    toc: 'On this page',
    sections: [
      {
        id: 'doubao-start', title: 'Choose your service and model', summary: 'The account, key, model resource, and voice must work together.',
        table: { caption: 'Choose a voice source', headers: ['Goal', 'Plugin model', 'Requirements'], rows: [
          ['Use an existing voice', 'Standard TTS · seed-tts-2.0', 'Enable the matching synthesis resource and use an available TTS 2.0 voice. Start with a built-in voice.'],
          ['Use your cloned voice', 'Voice cloning · seed-icl-2.0', 'Enable the matching resource and finish creating a usable voice ID in the console.'],
        ] },
        items: [
          { label: 'Standard service key', detail: 'Obtain an API key from the new Doubao speech console and enable the required model resource. The plugin expects an API key, not an AppID, old Access Token, or Secret Key assembled from an older tutorial.' },
          { label: 'Agent Plan key', detail: 'Use the dedicated key from your Agent Plan console and check its current speech support and remaining quota. The plugin selects the standard or Agent Plan endpoint automatically; no manual URL is needed. Coding Plan does not include speech models, even if its conversation models work.' },
          { label: 'Resources before tuning', detail: 'Saving or recognizing a key does not verify model access. Standard synthesis and cloning require their matching resources and an accessible voice in the relevant account/project. Do not mix standard and cloned voice IDs.' },
        ],
        links: [{ label: 'Doubao API keys', href: CONSOLE_KEY }, { label: 'Agent Plan versus Coding Plan', href: PLAN_DOCS }, { label: 'Official API and resource reference', href: STREAMING_DOCS }],
      },
      {
        id: 'doubao-configure', title: 'Configure a standard voice in DSH', summary: 'Use a built-in voice, default delivery, and normal speed for the first connection test.',
        steps: [
          { title: 'Enable and check the service', detail: 'Open the Doubao speech console, enable the required standard TTS resource, and check account/project access and available quota. For Agent Plan, check speech access and its dedicated key. Follow the console for current activation and billing details.' },
          { title: 'Select Doubao and save the key', detail: 'In real DSH plugin settings, switch to Doubao, paste the matching API key, and click Save. Xiaomi and Doubao keep separate configurations. A new key must be saved before previewing; unsaved key drafts are not used for synthesis.' },
          { title: 'Choose standard TTS and a voice', detail: 'Expand Console, select Standard TTS (seed-tts-2.0), and choose a built-in voice. Keep speed at 1× and instructions blank. For another voice, verify it is a TTS 2.0 voice in the console, then enter its full ID using Custom; the display name alone is not enough.' },
          { title: 'Disable local speech fallback temporarily', detail: 'Select Disable local speech and save the model, voice, and policy. Cloud errors will then remain visible instead of being hidden by browser speech. Restore and save your preferred fallback policy after the cloud test succeeds.' },
        ], items: [],
        links: [{ label: 'Console voice library', href: CONSOLE_VOICES }, { label: 'Official standard voice list', href: 'https://docs.volcengine.com/docs/DoubaoVoice/Tonelist-1?lang=zh' }],
      },
      {
        id: 'doubao-verify', title: 'Verify the first cloud sentence', summary: 'Test in real DSH Broadcast Desk and confirm both a Doubao source status and audible cloud speech.',
        steps: [
          { title: 'Play a short sentence manually', detail: 'Enter “Hello, this is a Doubao voice test” in Broadcast Desk and play it. Preview text supports up to 100 characters. Keep it short for the first connection test. Enable speech playback if the desk is hidden.' },
          { title: 'Check the actual source', detail: 'Confirm the playback status names Doubao, completes successfully, and matches the selected voice. Key format recognition, this website’s demo audio, and browser speech in the activation guide do not verify cloud synthesis.' },
          { title: 'Save what you tested', detail: 'Model, voice, and speed drafts may be previewed. Save once satisfied, then reopen settings to check the accepted values. Host channels such as QQ use saved settings, so an unsaved successful preview is not enough.' },
        ],
        items: [{ label: 'Record failures before changing settings', detail: 'Keep the error type, time, and redacted request ID, then use the troubleshooting section. Enabling local fallback just to hear audio makes cloud diagnosis harder.' }],
      },
      {
        id: 'doubao-clone', title: 'Use a cloned voice', summary: 'Voice creation happens in Volcano Engine. The plugin uses existing IDs and does not upload training samples or create voices.',
        steps: [
          { title: 'Finish creating the voice', detail: 'Open Create a voice and follow the console’s workflow. Confirm the voice is ready for synthesis and accessible to the account/project behind your key. Submitting a creation task does not by itself make the voice ready.' },
          { title: 'Copy the ID and switch models', detail: 'Copy the complete voice ID into DSH after selecting Voice cloning (seed-icl-2.0). Use the Cloned voice ID field, not the standard voice picker. A nickname, task ID, or placeholder is insufficient; an empty ID blocks saving and previewing.' },
          { title: 'Save and retest', detail: 'Save and play the same short sentence with local fallback still disabled. Standard voices and clone IDs are stored separately, and recently used clone IDs appear below the field. Switching back to standard TTS does not require copying a clone ID into the standard field.' },
        ],
        items: [{ label: 'Cloning ignores speech instructions', detail: 'Doubao cloning does not send standard TTS speech instructions. Use a compatible standard TTS 2.0 voice to compare instruction presets; the cloned voice’s underlying sound comes from its console creation result.' }],
        links: [{ label: 'Create a voice in the console', href: CONSOLE_CLONE }],
      },
      {
        id: 'doubao-style', title: 'Instructions and speed', summary: 'After basic synthesis works, change one setting at a time and compare using the same sentence.',
        items: [
          { label: 'Emotion, style, and dialect', detail: 'Choose a standard TTS instruction preset or enter a clear request such as “Speak in a relaxed, natural tone.” Avoid conflicting descriptions. Leave it blank for default delivery. Xiaomi and Doubao instructions are saved independently.' },
          { label: 'Supported voices', detail: 'Instructions require a TTS 2.0 standard voice that supports them, including custom IDs. Dialect presets are natural-language requests rather than a forced dialect parameter. Results depend on the voice and text. Browser speech and Doubao cloning do not apply these instructions.' },
          { label: 'Speed and recordings', detail: 'Speed ranges from 0.5× to 2.0× and is applied during cloud synthesis. Playback runs at 1×. History recordings already contain that speed, so replay does not apply it twice. Later settings do not change older recordings; synthesize again for comparisons.' },
          { label: 'Save for later conversations', detail: 'Preview drafts to compare results, then save. Switching providers or changing saved instructions stops current reading; subsequent replies use the new configuration.' },
        ],
        links: [{ label: 'Official speech instruction guide', href: INSTRUCTION_DOCS }],
      },
      {
        id: 'doubao-streaming', title: 'Enable streaming and QQ delivery', summary: 'After manual cloud playback succeeds, verify browser automatic reading and QQ separately.',
        steps: [
          { title: 'Enable browser automatic reading', detail: 'Enable and save speech playback and autoplay, then send a new conversation message. The browser may require an initial manual playback gesture. With the host set to All replies, Doubao can synthesize incremental text as it arrives. Final answer only waits for the turn to finish.' },
          { title: 'Verify WebSocket support', detail: 'Incremental text input requires WebSocket upgrade support in DSH. Reverse proxies must support WebSocket and forward Upgrade. If a short preview works but live reading fails, compare direct and proxied access, then check host version, proxy configuration, and connection logs.' },
          { title: 'Configure QQ separately', detail: 'Save the Doubao model and voice, then follow the QQBot guide to enable Voice Relay, select the QQ preset, and test delivery. QQ automatic speech waits for a successful turn and is independent of browser autoplay and live web reading.' },
        ],
        items: [{ label: 'Stopping and switching', detail: 'Stopping reading cancels the streaming session. Switching conversations, opening an already generating conversation, or changing host reply preferences does not catch up earlier text. Send a new message to test subsequent behavior.' }],
        links: [{ label: 'QQBot setup guide', href: '#qqbot' }, { label: 'Reading settings in the manual', href: '#manual-console' }],
      },
      {
        id: 'doubao-troubleshooting', title: 'Troubleshooting checklist', summary: 'Disable local fallback, reproduce with a short sentence, then check the key, resource, voice, and network.',
        items: [
          { label: 'Missing or rejected key', detail: 'Check the selected provider, key source, and Save status. Do not substitute a Xiaomi key, older token, or Coding Plan key. For a saved rejected key, check expiry, account/project access, and whether Agent Plan uses its dedicated key.' },
          { label: 'Unavailable resource or voice', detail: 'Check resource access for seed-tts-2.0 or seed-icl-2.0, the full voice ID, matching voice family, and account permissions. Clones must be ready in the console. Compare with a built-in standard voice to distinguish clone access from basic connectivity.' },
          { label: 'Rate limits, quota, or timeouts', detail: 'Check the relevant console’s quota, usage, and concurrency. Stop parallel previews and retry one short sentence later after rate limiting. For timeouts, check the DSH host’s outbound network and logs, not just whether your browser can open the console.' },
          { label: 'Wrong voice or ignored instructions', detail: 'Confirm Doubao is the actual source with fallback disabled. Check the model, voice ID, instruction support, and saved settings. Older history recordings never change with settings; generate new audio to compare.' },
          { label: 'Manual playback works but automatic reading fails', detail: 'Check saved speech and autoplay switches, browser playback permission, and Final answer only. If only proxied access fails, check WebSocket Upgrade. If QQ fails, use the QQBot guide to check the relay, source switch, and conversation preset.' },
          { label: 'Useful issue details', detail: 'Include DSH/plugin versions, standard or Agent Plan service, model, voice, error type and request ID, proxy use, and fallback state. Remove keys, credentials, and private text before sharing logs.' },
        ],
        links: [{ label: 'User manual', href: '#manual' }, { label: 'QQBot troubleshooting', href: '#qqbot-troubleshooting' }],
      },
    ],
    notes: [{ title: 'Completion check', body: 'With local fallback disabled in real DSH, a short Doubao preview plays to completion and the key, model, and voice are saved. Then restore fallback, enable automatic reading, or configure QQ delivery as needed.' }],
  },
}
