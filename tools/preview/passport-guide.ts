import type { ManualCopy } from './document-page.js'
import type { ManualLocale } from './user-manual.js'

const firmware = 'https://github.com/liutaocode/esp32demo/tree/main/examples/qwen-voice-bean'
const dshFirmware = 'https://github.com/ppy-web/whaletalk-passport'
const passportWebsite = 'https://ai-passport.folotoy.cn/'
const example = `host: '0.0.0.0'
port: 3101
accessToken: '1234' # 示例，实际请一键生成 / example only
deviceId: ''
agentPreset: 'whale-girl'
cwd: '~/.dsh-xiaomi-tts/passport/workspace'`

export const PASSPORT_GUIDE: Record<ManualLocale, ManualCopy> = {
  zh: {
    title: '把 DSH 带在身边',
    intro: '从认识 AI Passport 开始，了解本组件提供的随身语音对话功能，再按步骤连接 DSH。此页是接入说明，预览表单仅保存演示数据，不连接硬件。',
    toc: '本页目录',
    sections: [
      {
        id: 'passport-about', title: 'AI Passport 是什么', summary: 'AI Passport 是 FoloToy 推出的卡片大小、可随身佩戴的开放式 AI 硬件平台。',
        items: [
          { label: '安装玩法，也能自己开发', detail: '可以安装社区提供的应用，也可以借助官方开发资源和 AI Agent 编写自己的固件，把同一台设备变成随身伙伴、实用工具或小游戏。设备的具体功能取决于安装的固件。' },
        ],
        links: [{ label: 'AI Passport 官网：产品介绍与社区玩法', href: passportWebsite }],
      },
      {
        id: 'passport-features', title: '我们的组件实现了什么', summary: '本插件的 AI Passport 连接器配合 WhaleTalk Passport 固件，让设备通过 Wi-Fi 成为 DSH 的随身语音终端。',
        items: [
          { label: '语音提问与有声回复', detail: '设备收音后，由所选宿主、小米或豆包服务完成语音识别，将文字交给当前默认对话模型，再通过本插件已保存的 TTS 服务和音色合成回复，回传到设备播放。播放完成后恢复收音，可继续下一轮对话。' },
          { label: 'Agent 预设与专用会话', detail: '支持选择 Agent 预设，使用独立于网页和 QQ 的设备会话；重启后恢复同一会话。工具操作仍遵循 DSH 的权限和审批规则。' },
          { label: '快捷配对与取消', detail: '一键生成 4 位配对码并显示电脑局域网地址。使用配套固件时，可按 DOWN 取消当前识别、对话或播报；掉线重连后不会补播旧回复。' },
          { label: 'DSH 持续运行即可使用', detail: '关闭 DSH 网页后仍可对话，电脑上的 DSH 进程需保持运行且设备能访问它。接入需要下文说明的兼容固件，官方测试基线和其他玩法不能直接连接。' },
        ],
      },
      {
        id: 'passport-start', title: '开始前准备', summary: '需要兼容固件、可用的所选语音识别、对话模型与 TTS，以及设备能访问的网络。',
        items: [
          { label: '确认固件', detail: '推荐使用独立仓库 WhaleTalk Passport（鲸语通行证）应用，附有环境安装、构建和配网说明，旧 Qwen Voice Bean 仍可使用长令牌连接；4 位配对需使用新版应用。组件实现 GCP 7.0.0 音频子集，官方测试基线和其他玩法不能直接连接。' },
          { label: '同一个 DSH 实例', detail: '本插件、Agent 预设和默认对话模型需在同一实例／profile 中可用。识别默认使用宿主，也可选小米或豆包，复用已保存密钥；云端模式无需宿主 ASR。语音识别组件由 DSH 宿主提供，不随本插件安装；安装或更新组件后需重启 DSH 才会加载。关闭网页不影响使用，但 DSH 进程必须保持运行。' },
          { label: '可信的局域网', detail: '设备与主机可使用同一 Wi-Fi 或手机热点，需能相互访问。默认连接是明文 WebSocket，使用私有令牌并限定可信网络，不要直接暴露到公网。' },
        ],
        links: [{ label: 'WhaleTalk Passport 固件与开发指南', href: dshFirmware }, { label: 'Qwen Voice Bean 参考项目', href: firmware }, { label: '查看 AI Passport 组件配置', href: '#components-passport' }],
      },
      {
        id: 'passport-host', title: '先让宿主能听、能说', summary: '设备不是浏览器音频的遥控器，它使用宿主识别与宿主 TTS。',
        steps: [
          { title: '准备语音识别', detail: '在连接器选择识别来源：宿主需先准备识别模型；小米提交整句 WAV，豆包实时和一句话识别均边收音边上传，前者侧重低延迟，后者侧重准确率。设备只提交最终文字，不显示中间结果。云端复用插件密钥，已配置不代表权限或额度已验证。本组件不自动切换识别来源。失败时新固件保留屏幕原因并响本地提示音，保持开麦选择；等待超过 8 秒可按 DOWN 取消。支持的 TTS 模型边合成边播音，流式超限或中断会停止并提示。' },
          { title: '验证默认对话模型与预设', detail: '先在 DSH 正常完成一轮文字对话，确认默认模型、凭据和所选 Agent 预设可用。工具操作仍遵循宿主权限和审批。' },
          { title: '保存并测试 TTS', detail: '在插件设置中保存服务商、密钥、模型与音色，关闭浏览器本地语音兜底后试听短句，确认云端来源正常。设备需要宿主生成 WAV，再转换为 24 kHz 单声道 PCM；浏览器系统音色不能回传给设备。' },
        ], items: [],
        links: [{ label: '语音配置与试听', href: '#manual-console' }, { label: '豆包语音接入', href: '#doubao' }],
      },
      {
        id: 'passport-configure', title: '配置连接器组件', summary: '确认 AI Passport 连接器已开启（默认开启），一键生成 4 位数字配对码，设备只填写电脑 IP 和配对码。',
        steps: [
          { title: '一键开放局域网连接', detail: '点击“生成配对码并开启连接”，自动使用 0.0.0.0 监听。连接电脑的 Windows 移动热点时，选择热点网卡地址，通常为 192.168.137.1；连接路由器时选择对应局域网地址。不要把 0.0.0.0、127.0.0.1 或设备 IP 当成电脑地址。' },
          { title: '记下 4 位配对码', detail: '配对码是页面生成的 4 位数字，不分开发和正常模式。设备填写相同数字，保留前导 0；重新生成会替换旧码。默认端口 3101，通常不用修改。' },
          { title: '选择首次会话设置', detail: '默认使用本插件 whale-girl 预设与 ~/.dsh-xiaomi-tts/passport/workspace 目录（不存在时自动创建）；请先启用鲸鱼娘预设组件。希望限定设备时填写其 client.instance_id，通常为 bean_ 加设备 MAC 的十六进制值。' },
          { title: '查看连接状态', detail: '确认显示“正在监听，等待设备”。若提示仅本机可访问，重新使用快捷按钮；若 ASR 未准备好，先在宿主语音输入中准备模型。按需允许 3101 端口通过防火墙。手写配置示例使用 1234，占位码请替换。', command: example },
        ], items: [],
        links: [{ label: '试用组件配置（演示）', href: '#components-passport' }],
      },
      {
        id: 'passport-connect', title: '设备配网与第一轮对话', summary: '新连接只填电脑 IP 和 4 位配对码；端口默认 3101。',
        steps: [
          { title: '连接网络并填写服务地址', detail: '连接设备显示的 DSH-Voice 热点（无需密码），打开 192.168.4.1。已配网时勾选“保留已连接的 Wi-Fi”，只填电脑 IP 与 4 位配对码；首次使用再选择 Wi-Fi 并填密码。端口在高级设置中，默认 3101。旧 Qwen 固件不支持短码，请使用新版 WhaleTalk Passport。' },
          { title: '开始收音', detail: '固件启动后麦克风默认关闭。短按 OK 开始收音，说“你好，简单介绍一下自己”，说完后停顿，等待识别、对话和播报完成。再次短按 OK 可暂停收音。' },
          { title: '确认播放与恢复', detail: '实际听到完整回复后，再说第二句话确认能继续对话。播放期间忽略新的录音输入，等待设备播放回执后恢复；DOWN 按键可取消当前识别、对话或播报，不支持声音自动打断。' },
        ], items: [],
      },
      {
        id: 'passport-tuning', title: '收音与等待时间怎么调', summary: '先保留默认值；每次只调一项，再在同一环境中重新说一句短话。',
        table: { caption: '录音、回复与超时参数', headers: ['参数', '默认值 / 范围', '作用'], rows: [
          ['silenceMs', '700 ms / 200–3000 ms', '说完后静音多久才断句；切句太快时增大。'],
          ['minSpeechMs', '200 ms / 100–1000 ms', '过滤过短的有效语音，减少碰撞声触发。'],
          ['speechThreshold', '0.015 / 0.001–0.5', '归一化 RMS；环境嘈杂时适当增大。'],
          ['maxRecordingSeconds', '30 秒 / 1–60 秒', '包含预录与尾部静音；超长录音不提交。'],
          ['maxReplySeconds', '60 秒 / 1–120 秒', '超长回复不发声，保留完整会话文字。'],
          ['requestTimeoutMs', '180000 ms / 10000–600000 ms', '识别、对话、播报的整轮等待上限；超时取消。'],
        ] }, items: [
          { label: '响应较慢时', detail: '分别测试识别、对话模型和 TTS，定位耗时步骤后再调整整轮上限。增加上限不会让服务变快，也不能替代修复网络或模型不可用的问题。' },
        ],
      },
      {
        id: 'passport-session', title: '会话、重连与停止', summary: '设备使用专用会话，不接管网页或 QQ 会话。',
        items: [
          { label: '首次创建，之后恢复', detail: '第一次有效设备连接才创建会话，并按 profile 与组件位置保存身份到 ~/.dsh-xiaomi-tts/passport/。重启后恢复同一会话，不重播历史回复。状态文件不保存令牌或录音；损坏或恢复失败会报错，不会覆盖历史另建会话。' },
          { label: '预设与目录不是换会话开关', detail: 'agentPreset、cwd 仅用于首次创建。恢复时沿用原目录；已有会话不允许通过修改预设静默更换身份。对话模型选择遵循 DSH 自身规则，不由设备指定。' },
          { label: '一台设备占用连接', detail: '相同设备身份重连会关闭旧连接并取消旧任务，其他设备不能接管。掉线、停用组件或取消后不补发旧回复，重新连接后请主动发起新的一轮。' },
        ],
      },
      {
        id: 'passport-troubleshooting', title: '按链路排查', summary: '依次确认组件运行、网络、认证、识别、会话和播报。',
        table: { caption: '现象与排查方向', headers: ['现象 / 错误', '先检查'], rows: [
          ['组件无法启动', '同一 profile 的 speechSynthesis、speechToText、agents、agentPresets、agentDefaultModel；监听地址是否属于本机，3101 是否被占用。'],
          ['设备连接失败 / 401', '局域网 IPv4、防火墙、端口、令牌和兼容固件。浏览器跨域请求会被拒绝，不能用网页直接建立设备连接。'],
          ['passport-asr-unavailable', '宿主识别 provider 是否选定、模型是否准备好；先在宿主完成语音转文字测试。'],
          ['passport-session-unavailable / passport-preset-unavailable', '默认对话模型与 Agent 预设是否可用；检查会话恢复错误，不要先删除状态文件。'],
          ['passport-preset-changed', '已保存的会话与新填写的预设不同，恢复原预设配置后再连接。'],
          ['passport-recognition-failed / passport-speech-failed', '先单独测试宿主识别与已保存的 TTS，检查供应商、音色和脱敏错误日志。'],
          ['passport-request-timeout / 长回复无声', '识别、模型和合成耗时，以及整轮上限和最长回复时长；先用短句验证。'],
        ] }, items: [
          { label: '验收与反馈', detail: '真实设备上检查两轮连续对话、DOWN 取消和 Wi-Fi 断开重连。记录错误代码、组件开关、固件版本及所用识别／TTS 服务，隐去令牌、密钥和私人对话。模拟预览不能代替硬件音质与按键验收。' },
        ], links: [{ label: '返回用户手册', href: '#manual' }, { label: '检查组件配置', href: '#components-passport' }],
      },
    ], notes: [{ title: '接入完成的标准', body: '设备能完成两轮语音对话，回复音色符合已保存设置，播放后恢复收音，按 DOWN 能取消，重连后不会补播旧回复。' }],
  },
  en: {
    title: 'Take DSH with you',
    intro: 'Meet AI Passport, learn what this component adds, then connect it to DSH step by step. Preview forms only store demo data and do not connect hardware.',
    toc: 'On this page',
    sections: [
      {
        id: 'passport-about', title: 'What is AI Passport?', summary: 'AI Passport is a card-sized, open wearable AI hardware platform by FoloToy.',
        items: [
          { label: 'Install an app or build your own', detail: 'Install community apps or use the official development resources and an AI agent to create firmware for a pocket companion, a practical tool or a game. The installed firmware determines what the device can do.' },
        ],
        links: [{ label: 'AI Passport official website: product and community apps', href: passportWebsite }],
      },
      {
        id: 'passport-features', title: 'What our component provides', summary: 'The AI Passport Connector in this plugin works with WhaleTalk Passport firmware to turn the device into a portable DSH voice terminal over Wi-Fi.',
        items: [
          { label: 'Spoken questions and replies', detail: 'The selected Host, Xiaomi or Doubao service transcribes device audio, sends the text to the current default conversation model, then uses this plugin’s saved TTS service and voice to generate audio for device playback. Capture resumes after playback so you can continue the conversation.' },
          { label: 'Agent presets and a dedicated conversation', detail: 'Choose an Agent preset and use a device conversation separate from web and QQ conversations. The same conversation resumes after a restart. Tool actions retain DSH permission and approval rules.' },
          { label: 'Quick pairing and cancellation', detail: 'Generate a four-digit pairing code and view the computer’s LAN addresses with one click. With the companion firmware, DOWN cancels recognition, generation or playback. Reconnection does not replay old replies.' },
          { label: 'Keep DSH running', detail: 'Conversations continue after closing the DSH web page while the DSH process stays running and reachable. Install the compatible firmware described below; the official hardware-test baseline and other apps cannot connect directly.' },
        ],
      },
      {
        id: 'passport-start', title: 'Before you begin', summary: 'Prepare compatible firmware, Host recognition, a conversation model and TTS, plus a network the device can use.',
        items: [
          { label: 'Compatible firmware', detail: 'Use the standalone WhaleTalk Passport repository for environment, build and provisioning instructions. Older Qwen Voice Bean remains compatible with long credentials; use the updated app for four-digit pairing. The adapter uses the GCP 7.0.0 audio subset; the official hardware-test baseline and other firmware cannot connect directly.' },
          { label: 'One DSH instance', detail: 'This plugin, Agent presets and a default model must be available in one profile. Select Host, Xiaomi or Doubao recognition independently of TTS. Cloud recognition reuses saved keys and does not require Host ASR. The recognizer is a Host capability and is not installed by this plugin; restart DSH after installing or updating it. The web page may close, but DSH must keep running.' },
          { label: 'A trusted LAN', detail: 'Use reachable Wi-Fi or a mobile hotspot. The default transport is plain WebSocket; use a private token and a trusted network instead of exposing it directly to the internet.' },
        ], links: [{ label: 'WhaleTalk Passport firmware and guide', href: dshFirmware }, { label: 'Qwen Voice Bean reference', href: firmware }, { label: 'Explore component settings', href: '#components-passport' }],
      },
      {
        id: 'passport-host', title: 'Verify Host input and speech', summary: 'The device uses Host recognition and TTS, independently of browser audio.',
        steps: [
          { title: 'Prepare recognition', detail: 'Select a recognition source in the connector. Host mode needs a prepared model; Xiaomi submits full utterances. Both Doubao modes upload while you speak: real-time favors latency, utterance recognition favors accuracy. Only the final transcript is submitted and interim text is not displayed. Cloud keys are reused; access and quota still need validation. The connector does not switch recognizers automatically. New firmware retains failure reasons and plays a local cue without closing the microphone. Supported TTS models stream audio; failures and duration limits stop playback with feedback. If the settings page says it is waiting for Host services, enable @deepseek-ai/dsh-experimental-speech-to-text and a provider, then restart DSH.' },
          { title: 'Test the model and preset', detail: 'Complete a text conversation in DSH to check the default model, credentials and selected Agent preset. Tools retain the Host’s permission and approval rules.' },
          { title: 'Save and test TTS', detail: 'Save the provider, key, model and voice. Disable browser speech fallback and test a short cloud preview. The device needs Host-generated WAV converted to 24 kHz mono PCM; browser system voices cannot be sent back to it.' },
        ], items: [], links: [{ label: 'Speech settings and previews', href: '#manual-console' }, { label: 'Doubao voice setup', href: '#doubao' }],
      },
      {
        id: 'passport-configure', title: 'Configure the component', summary: 'Confirm AI Passport Connector is enabled (on by default), then generate a four-digit pairing code. The device needs only the computer IP and code.',
        steps: [
          { title: 'Enable LAN access with one click', detail: 'Generate a pairing code and enable the connection. The listener uses 0.0.0.0. For a Windows mobile hotspot, use its adapter address, usually 192.168.137.1. For router Wi-Fi, choose the corresponding LAN address. Do not enter 0.0.0.0, 127.0.0.1 or the device IP.' },
          { title: 'Note the four-digit code', detail: 'Use the same four digits on both ends, including leading zeros. There is no separate development mode. Generating another code replaces the previous code. Keep the default port 3101.' },
          { title: 'Choose initial conversation settings', detail: 'Defaults are the plugin’s whale-girl preset and ~/.dsh-xiaomi-tts/passport/workspace (created if missing). Enable the Whale Girl preset component first. Optionally restrict deviceId to client.instance_id, typically bean_ followed by the hexadecimal device MAC.' },
          { title: 'Check connection status', detail: 'Confirm that the connector is listening and waiting for the device. Use quick setup if it only accepts local connections; prepare Host ASR when indicated. Allow port 3101 through the firewall as needed. Replace the example pairing code before use.', command: example },
        ], items: [], links: [{ label: 'Try the settings preview', href: '#components-passport' }],
      },
      {
        id: 'passport-connect', title: 'Connect and have a conversation', summary: 'Enter the computer IP and four-digit pairing code. The port defaults to 3101.',
        steps: [
          { title: 'Provision Wi-Fi and the server', detail: 'Join the password-free DSH-Voice hotspot and open 192.168.4.1. Keep saved Wi-Fi to change only the computer IP and four-digit code. First-time setup also needs Wi-Fi credentials. The default port 3101 is under Advanced settings. Use the updated DSH firmware for short codes; older Qwen firmware requires long tokens.' },
          { title: 'Start recording', detail: 'The microphone starts muted. Briefly press OK, say “Hello, introduce yourself briefly”, then pause while recognition, the conversation and speech complete. Press OK again to pause capture.' },
          { title: 'Check playback and a second turn', detail: 'Listen to the whole reply, then speak again. Input is ignored during playback and resumes after the device acknowledges playback completion. DOWN cancels recognition, generation or playback; automatic voice interruption is not supported.' },
        ], items: [],
      },
      {
        id: 'passport-tuning', title: 'Tune capture and waiting limits', summary: 'Start with defaults and change one value at a time in the same environment.',
        table: { caption: 'Capture and playback parameters', headers: ['Setting', 'Default / range', 'Purpose'], rows: [
          ['silenceMs', '700 ms / 200–3000 ms', 'Silence before segmentation. Increase for premature cuts.'],
          ['minSpeechMs', '200 ms / 100–1000 ms', 'Filters very short voice bursts and bumps.'],
          ['speechThreshold', '0.015 / 0.001–0.5', 'Normalized RMS. Increase to reject ambient noise.'],
          ['maxRecordingSeconds', '30 s / 1–60 s', 'Includes pre-roll and trailing silence. Oversized input is discarded.'],
          ['maxReplySeconds', '60 s / 1–120 s', 'Longer replies are not spoken; conversation text stays complete.'],
          ['requestTimeoutMs', '180000 ms / 10000–600000 ms', 'Total recognition, conversation and playback time. Expiry cancels the request.'],
        ] }, items: [{ label: 'Slow responses', detail: 'Test recognition, the conversation model and TTS separately before increasing the timeout. A larger limit does not make a service faster or fix an unavailable network or model.' }],
      },
      {
        id: 'passport-session', title: 'Conversations and reconnection', summary: 'The device has its own conversation and cannot take over web or QQ conversations.',
        items: [
          { label: 'Create once, then resume', detail: 'The first valid connection creates a conversation. Identity is stored under ~/.dsh-xiaomi-tts/passport/, isolated by profile and component entry. Restarting resumes it without replaying history. State stores no tokens or recordings. Corrupt state or resume failures report errors instead of replacing history.' },
          { label: 'Preset and directory apply to creation', detail: 'agentPreset and cwd initialize a new conversation. Resumed conversations retain their directory; changing the preset cannot silently replace the saved identity. Model selection follows DSH rules, not device-supplied settings.' },
          { label: 'One device at a time', detail: 'Reconnecting the same identity replaces its old connection and cancels old work. Another device cannot take over. Disconnecting, disabling or cancelling never resends old replies; start a new request after reconnection.' },
        ],
      },
      {
        id: 'passport-troubleshooting', title: 'Locate the failure', summary: 'Check component services, network, authentication, recognition, conversation and playback in that order.',
        table: { caption: 'Symptoms and checks', headers: ['Symptom / code', 'Check first'], rows: [
          ['Component cannot start', 'speechSynthesis, speechToText, agents, agentPresets and agentDefaultModel in the same profile; a local listen address and an available port.'],
          ['Connection failure / 401', 'LAN IPv4, firewall, port, matching tokens and compatible firmware. Browser-origin requests are rejected.'],
          ['passport-asr-unavailable', 'A selected Host recognizer with its model prepared. Test transcription in the Host first.'],
          ['passport-session-unavailable / passport-preset-unavailable', 'The default model, Agent preset and conversation resume errors. Do not start by deleting saved state.'],
          ['passport-preset-changed', 'The saved conversation uses a different preset. Restore the original preset setting.'],
          ['passport-recognition-failed / passport-speech-failed', 'Test Host recognition and saved TTS separately; inspect provider, voice and sanitized logs.'],
          ['passport-request-timeout / silent long reply', 'Recognition, model and synthesis latency, whole-request timeout and maximum spoken duration. Test a short reply first.'],
        ] }, items: [{ label: 'Hardware verification and reports', detail: 'Test two consecutive turns, DOWN cancellation and Wi-Fi reconnection on real hardware. Report error codes, firmware version, component state and providers, omitting tokens, keys and private conversations. A simulation cannot validate real speaker quality or buttons.' }],
        links: [{ label: 'User manual', href: '#manual' }, { label: 'Component settings', href: '#components-passport' }],
      },
    ], notes: [{ title: 'When setup is complete', body: 'The device completes two voice turns with the saved voice, resumes capture after playback, cancels with DOWN and does not replay old replies after reconnection.' }],
  },
}
