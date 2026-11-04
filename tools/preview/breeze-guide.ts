import type { ManualCopy } from './document-page.js'
import type { ManualLocale } from './user-manual.js'

const REGISTER = 'https://breezeblue.ai/zh?code=JHKLSJ'
const API_KEYS = 'https://breezeblue.ai/app/developer/api-keys'
const COKECLOUD = 'https://vip.ih004.com/#/register?code=UHKslrCy'
const PRICING = 'https://breezeblue.ai/pricing'
const VOICES = 'https://breezeblue.ai/zh/voice-library'
const INSTRUCTIONS = 'https://docs.breezeblue.ai/guides/voice-instruction-prompting'
const STREAMING = 'https://docs.breezeblue.ai/concepts/streaming'

export const BREEZE_GUIDE: Record<ManualLocale, ManualCopy> = {
  zh: {
    title: '让 Breeze 按你想要的情绪开口',
    intro: 'Breeze Blue 提供云端语音合成、音色设计与克隆。本插件使用 breeze-tts-2，适合角色对话与情感朗读。需要可访问海外服务的外网环境；请同时确认浏览器能打开官网、运行 DSH 的机器能连接 API。',
    toc: '本页目录',
    sections: [
      {
        id: 'breeze-start', title: '先了解优点与限制',
        summary: '优先考虑情感、语气和角色表现力时，可以从 Breeze 开始。以下官方资料于 2026-11-04 核对，插件范围以本页说明为准。',
        items: [
          { label: '优点 · 情感语气自定义强', detail: '自然语言指令可以描述情绪、意图与节奏，正文还能加入轻笑、叹气等声音标签。支持使用音色库或已有的个人 Voice ID，适合对话陪伴、角色演绎和有表现力的旁白。' },
          { label: '优点 · 免费积分可体验', detail: '注册可获免费积分开始体验，每日也可在官网领取免费积分。官方 Free 方案目前标注每日可手动领取 400 积分；网页与 API 共用余额。注册赠送、领取条件和数量以账户页面为准。' },
          { label: '限制 · 外网、积分与排队', detail: '需要外网环境，尤其是 DSH 服务端到 api.breeze.blue 的连接。合成消耗账户积分，免费方案有标准队列与并发限制；网络、排队和文本分段都会影响实际首音延迟。插件中 Breeze 仍标为实验性。' },
          { label: '限制 · 官网能力不等于插件全部支持', detail: '本插件固定使用 breeze-tts-2，不提供模型切换、音色训练或克隆上传。官网多语言模型的 51 种语言能力不代表当前插件全部可用；创建音色需在官网完成，再将 Voice ID 填回插件。' },
        ],
        links: [{ label: '去注册Breeze', href: REGISTER }, { label: 'Breeze 免费积分与方案', href: PRICING }, { label: '官方语音指令说明', href: INSTRUCTIONS }],
      },
      {
        id: 'breeze-network', title: '准备外网环境',
        summary: '网页由浏览器打开，语音合成由 DSH 服务端发起；两边都要能访问对应服务。',
        items: [
          { label: '本机运行 DSH', detail: '先确认官网、音色库可打开，再确认运行 DSH 的进程可访问 https://api.breeze.blue。仅给浏览器配置代理，不一定覆盖 Node.js 的请求；应使用能覆盖 DSH 进程的网络方案。' },
          { label: '远程或容器部署', detail: '在服务器或容器所在环境检查外网连通性。手机或电脑浏览器能注册，不代表远端 DSH 能合成；遇到超时优先检查服务端网络、DNS 与代理配置。' },
          { label: 'CokeCloud 网络服务', detail: '需要外网连接方案时，可通过下方 CokeCloud 链接了解和注册。网络服务与 Breeze 语音账户分别开通，购买网络服务不会增加 Breeze 积分。' },
        ],
        links: [{ label: 'CokeCloud · 注册与网络服务', href: COKECLOUD }],
      },
      {
        id: 'breeze-register', title: '注册、领积分并创建 API Key',
        summary: '注册入口与插件 API Key 区域的跳转地址一致；完成注册后再进入开发者控制台取密钥。',
        steps: [
          { title: '注册并确认免费积分', detail: '点击“去注册Breeze”，按官网流程完成注册和验证，登录后检查积分余额。新用户可用免费积分体验，之后每天到官网手动领取当日免费积分；不要把每日领取理解成自动到账或无限使用。' },
          { title: '创建开发者密钥', detail: '打开 Developer → API Keys，创建并复制 brz_ 开头的完整 API Key。登录密码、邀请码和 voc_ 音色 ID 都不能代替密钥。密钥仅填写到真实 DSH 的密码框，不要贴到公开截图或聊天中。' },
          { title: '确认 API 使用余额', detail: '网页和 API 使用同一账户的积分。检查实际余额、用量与当前套餐限制；网页试听同样可能消耗积分，免费积分不足时可等下一次领取或按需充值。' },
        ], items: [],
        links: [{ label: '去注册Breeze', href: REGISTER }, { label: '打开 Breeze API Key 管理', href: API_KEYS }, { label: '官方鉴权说明', href: 'https://docs.breezeblue.ai/authentication' }],
      },
      {
        id: 'breeze-configure', title: '在 DSH 配置并验证',
        summary: '本 preview 使用模拟配置和演示音频，不会验证真实密钥、积分或网络。请在真实 DSH 完成以下操作。',
        steps: [
          { title: '启用 Breeze 并保存密钥', detail: '在插件设置的“播报台 → 语音服务商”开启 Breeze 并保存，再将当前服务商切换为 Breeze，粘贴 API Key 并保存。各供应商的密钥与音色独立保留；新密钥须先保存才能用于试听。' },
          { title: '先选预置音色', detail: '在调音台选择一个 Breeze 预置音色，语速保持 1×、语音指令留空。使用其他音色时选择自定义并填写完整的 voc_ Voice ID；可在官网音色库或个人音色中取得 ID，不要填写音色显示名称。' },
          { title: '关闭本地兜底，播放短句', detail: '将本地语音策略设为“关闭本地语音”并保存，在播报台输入“你好，这是一条 Breeze 语音测试。”后播放。确认来源显示 Breeze、实际声音符合所选音色且播放完成；密钥格式识别成功不代表鉴权成功。' },
          { title: '保存后再开启自动朗读', detail: '试听满意后保存模型、音色和语音设置，按需恢复本地兜底。开启“语音播放”和“自动播放”并保存，再发一条新消息验证。浏览器可能需要先手动播放一次；“仅最终回答”会等回复结束后再读。' },
        ], items: [],
        links: [{ label: 'Breeze 官方音色库', href: VOICES }, { label: '官方流式合成说明', href: STREAMING }],
      },
      {
        id: 'breeze-expression', title: '调情绪、语气与声音标签',
        summary: '先固定同一个音色与短句，每次只改变一个要求，更容易听出差别。',
        items: [
          { label: '语音指令 · 描述怎么说', detail: '例如“像深夜电台主持人一样，温柔、放慢节奏，带一点安慰”。写清情绪、意图和节奏，避免堆叠矛盾要求；留空恢复音色默认表达。指令不会被当作正文朗读，Breeze 指令与其他供应商独立保存。' },
          { label: '声音标签 · 放进正文', detail: '在试听框的“声音标签”中插入，例如“你好，[轻笑]今天过得怎么样？”中文使用方括号、英文使用圆括号。标签描述具体发声动作，整体情感仍写在语音指令中；使用面板提供的标签，不保证官网多语言模型的所有标签在此可用。' },
          { label: '自定义声音 · 先在官网创建', detail: '如需克隆或设计音色，先在 Breeze 官网按要求创建并保存可用声音，再复制 Voice ID 回填。插件只使用已有音色，不上传训练素材；确认该声音对当前 API Key 所属账户可用。' },
          { label: '语速与实时朗读', detail: '语速支持 0.5×–2×，由云端应用。自动朗读按语义分段请求 PCM 音频流，收到音频即可播放；它不是无限连续文本输入，分段衔接与实际延迟仍受网络和并发限制影响。更改设置不会重做旧的历史录音。' },
        ],
        links: [{ label: '官方指令编写指南', href: INSTRUCTIONS }, { label: '官网音色克隆说明', href: 'https://breezeblue.ai/voice-cloning' }],
      },
      {
        id: 'breeze-troubleshooting', title: '常见问题',
        summary: '关闭本地兜底后，以一条短句按网络 → 密钥 → 积分 → 音色的顺序排查。',
        items: [
          { label: '网页能打开，DSH 合成超时', detail: '检查 DSH 所在机器或容器到 api.breeze.blue 的连接；浏览器代理和远程服务器代理可能不同。不要连续发起多次试听，先排除网络连接与代理问题。' },
          { label: '密钥被拒绝或音色不可用', detail: '确认 Breeze 已启用、当前供应商正确、完整 brz_ 密钥已保存且未失效。自定义音色需提供完整 voc_ ID，归属和权限须匹配当前账户；先换回内置音色定位问题。' },
          { label: '积分不足或请求受限', detail: '到官网查看积分、当天领取状态和 API 用量。免费积分需手动领取；并发受限时停止重复试听，稍后用单条请求重试。额度与领取规则以当前账户显示为准。' },
          { label: '听到声音但情感没有变化', detail: '确认来源为 Breeze，而非浏览器兜底或历史录音。新建一次合成，用一条清晰的指令测试，再检查音色和草稿是否保存；各音色的演绎范围不同。QQ 发送须另按 QQBot 教程配置。' },
        ],
        links: [{ label: 'QQBot 接入教程', href: '#qqbot' }, { label: '返回用户手册', href: '#manual' }],
      },
    ],
    notes: [{ title: '接入完成的标准', body: '在真实 DSH 关闭本地兜底后，Breeze 来源的短句可完整播放，Key、Voice ID 和语气设置均已保存。之后再开启自动朗读或 QQ 发送。' }],
  },
  en: {
    title: 'Direct the emotion and delivery of Breeze',
    intro: 'Breeze Blue offers cloud speech, voice design, and cloning. This plugin uses breeze-tts-2 for expressive dialogue and narration. You need network access to overseas services from both your browser and the machine running DSH.',
    toc: 'On this page',
    sections: [
      {
        id: 'breeze-start', title: 'Strengths and limitations', summary: 'A choice for emotion, delivery, and character performance. Official sources checked on November 4, 2026; plugin support is described below.',
        items: [
          { label: 'Strength · Expressive control', detail: 'Natural-language instructions direct emotion, intent, and pacing. In-text audio tags add actions such as laughter or sighs. Use public voices or an existing personal Voice ID.' },
          { label: 'Strength · Free credits to start', detail: 'Register to start with free credits and claim more each day. The Free plan currently lists 400 credits to claim manually daily. Website and API share your balance; signup offers and eligibility follow your account page.' },
          { label: 'Limit · Network, credits, and queues', detail: 'The DSH process needs access to api.breeze.blue. Generation uses credits; free accounts have a standard queue and concurrency limits. Network and segmentation affect latency. Breeze is experimental in this plugin.' },
          { label: 'Limit · A fixed plugin model', detail: 'This plugin uses breeze-tts-2 without model switching or sample uploads. The multilingual model’s 51-language support does not apply in full here. Create voices on the website, then copy their IDs into DSH.' },
        ], links: [{ label: 'Register for Breeze', href: REGISTER }, { label: 'Free credits and plans', href: PRICING }, { label: 'Official instruction guide', href: INSTRUCTIONS }],
      },
      {
        id: 'breeze-network', title: 'Prepare network access', summary: 'The browser opens the website; the DSH server makes synthesis requests. Both need access.',
        items: [
          { label: 'Local DSH', detail: 'Check the website and voice library, then verify that the DSH process can reach https://api.breeze.blue. A browser-only proxy may not cover Node.js requests.' },
          { label: 'Remote or container deployment', detail: 'Check connectivity, DNS, and proxy settings on the server or inside the container. Access from your phone or laptop does not verify the remote host.' },
          { label: 'CokeCloud', detail: 'The link below opens a network service registration page. Its account and fees are separate from Breeze; a network subscription does not add speech credits.' },
        ], links: [{ label: 'CokeCloud · Register for network access', href: COKECLOUD }],
      },
      {
        id: 'breeze-register', title: 'Register, claim credits, and create a key', summary: 'The registration link matches the plugin’s API key link. After signup, open the developer console.',
        steps: [
          { title: 'Register and check credits', detail: 'Follow Register for Breeze, complete signup and verification, and check your balance. Free credits let new users try the service. Return to the website to claim daily credits manually; this is not unlimited or automatic usage.' },
          { title: 'Create an API key', detail: 'Open Developer → API Keys and copy the complete brz_ key. A password, invitation code, or voc_ voice ID is not a key. Enter it only in real DSH’s password field; keep it out of public screenshots and messages.' },
          { title: 'Check API balance', detail: 'Website generation and API requests use the same credits. Check your balance, usage, and plan limits. If free credits run out, wait for the next claim or top up as needed.' },
        ], items: [], links: [{ label: 'Register for Breeze', href: REGISTER }, { label: 'Breeze API keys', href: API_KEYS }, { label: 'Official authentication guide', href: 'https://docs.breezeblue.ai/authentication' }],
      },
      {
        id: 'breeze-configure', title: 'Configure and verify in DSH', summary: 'This preview uses mock settings and sample audio. It cannot verify a key, credits, or connectivity.',
        steps: [
          { title: 'Enable Breeze and save the key', detail: 'Enable Breeze under Broadcast Desk → Speech providers and save. Switch the active provider to Breeze, paste the API key, and save again. Provider settings remain independent; a new key must be saved before testing.' },
          { title: 'Start with a built-in voice', detail: 'Choose a Breeze voice in Console, keep speed at 1×, and leave instructions blank. For another voice, select Custom and enter the full voc_ ID from the voice library or your saved voices, rather than a display name.' },
          { title: 'Disable fallback and play a short sentence', detail: 'Save Disable local speech, then play a short sentence in Broadcast Desk. Confirm Breeze is shown as the source and speech completes in the selected voice. Recognizing a key’s format does not verify authentication.' },
          { title: 'Save before enabling automatic reading', detail: 'Save the voice and delivery you tested, then restore fallback if wanted. Enable and save speech playback and autoplay; send a new message. You may need a manual playback first for browser permission. Final answer only waits until the response finishes.' },
        ], items: [], links: [{ label: 'Official voice library', href: VOICES }, { label: 'Official streaming guide', href: STREAMING }],
      },
      {
        id: 'breeze-expression', title: 'Emotion, delivery, and audio tags', summary: 'Keep the voice and test sentence fixed while changing one requirement at a time.',
        items: [
          { label: 'Instructions · How to say it', detail: 'Try “Speak like a late-night radio host, warm, reassuring, and unhurried.” Describe emotion, intent, and pacing without contradictory requirements. Instructions are not spoken and are saved separately for Breeze.' },
          { label: 'Audio tags · In the text', detail: 'Insert supported cues using Audio tags below the test field. Chinese cues use square brackets and English cues use parentheses, such as “Hello, (laughs) how was your day?” Use the picker; not every multilingual-model tag is guaranteed here.' },
          { label: 'Custom voices · Create on the website', detail: 'Clone or design a voice on Breeze first, save it, and copy its Voice ID into the plugin. DSH does not upload training samples. The voice must be available to the account behind your API key.' },
          { label: 'Speed and live reading', detail: 'Speed ranges from 0.5× to 2× and is applied in the cloud. Automatic reading segments incoming text and plays PCM as audio arrives. Segment joins and latency depend on network and concurrency. Changes do not regenerate old history recordings.' },
        ], links: [{ label: 'Official instruction guide', href: INSTRUCTIONS }, { label: 'Voice cloning on Breeze', href: 'https://breezeblue.ai/voice-cloning' }],
      },
      {
        id: 'breeze-troubleshooting', title: 'Troubleshooting', summary: 'Disable local fallback, test a short sentence, then check network → key → credits → voice.',
        items: [
          { label: 'Website works but DSH times out', detail: 'Check api.breeze.blue from the actual DSH server or container. Browser proxies may differ. Avoid repeated tests until connectivity is resolved.' },
          { label: 'Key rejected or voice unavailable', detail: 'Check Breeze is enabled and active, and the full valid brz_ key was saved. Custom voices need a complete voc_ ID and account access. Retry with a built-in voice to isolate the issue.' },
          { label: 'Insufficient credits or request limits', detail: 'Check balance, daily claim status, and API usage. Claim daily credits manually. For concurrency limits, stop overlapping tests and retry one request later. Current account rules apply.' },
          { label: 'No change in emotion', detail: 'Confirm the source is Breeze rather than local fallback or an old recording. Generate fresh audio with one clear instruction, then check voice selection and saved settings. Each voice has a different expressive range. Configure QQ separately using its guide.' },
        ], links: [{ label: 'QQBot setup', href: '#qqbot' }, { label: 'User manual', href: '#manual' }],
      },
    ],
    notes: [{ title: 'A completed setup', body: 'With local fallback disabled in real DSH, a Breeze sentence plays completely and the key, voice, and delivery are saved. Then enable automatic reading or QQ delivery.' }],
  },
}
