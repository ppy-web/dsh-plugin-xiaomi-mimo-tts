import type { ManualCopy } from './document-page.js'
import type { ManualLocale } from './user-manual.js'

export const QQBOT_GUIDE: Record<ManualLocale, ManualCopy> = {
  zh: {
    title: '让 QQ 里的回复也有声音',
    intro: '先让机器人正常回复文字，再接通云端语音，最后启用 QQ 鲸鱼娘预设。以下操作在真实 DSH 与手机 QQ 中完成；本预览不连接机器人，也不会发送消息。',
    toc: '本页目录',
    sections: [
      {
        id: 'qqbot-start', title: '开始前准备',
        summary: '需要一个运行中的 DSH、可用的 QQBot，以及小米或豆包的云端语音配置。',
        items: [
          { label: '使用同一个 DSH 实例', detail: 'dsh-xiaomi-tts 与 @tencent-connect/dsh-qqbot 必须安装、启用在同一个实例／profile。多个 profile 的插件、服务和预设互不共享；在桌面版配置好语音，不代表另一个终端启动的 profile 也配置好了。' },
          { label: '先验证云端合成', detail: '打开本插件设置，选择小米 MiMo 或豆包，保存 API Key、模型和音色。将调音台的本地语音策略设为“关闭本地语音”，在播报台试听一句短话，确认状态显示所选云端来源并能听到声音。QQ 发送在宿主完成，不能使用浏览器本地语音兜底。' },
          { label: '保持宿主运行', detail: '配置完成后可以关闭网页，不需要让浏览器自动播放一直开启；DSH 进程、QQBot 连接和语音服务必须继续运行。建议先用一个 QQ 私聊测试，成功后再为目标群配置。' },
        ],
        links: [{ label: '先完成豆包语音配置', href: '#doubao' }, { label: '查看通用设置说明', href: '#manual' }],
      },
      {
        id: 'qqbot-connect', title: '安装与连接机器人',
        summary: '以“QQ 发一句话，机器人回复文字”为第一项验收结果。文字不通时，先解决 QQBot 连接。',
        steps: [
          { title: '安装官方 QQBot 插件', detail: '在 DSH 左侧“插件 → 添加插件”中输入下面的包名，安装并立即启动。已经安装的用户先确认插件运行正常。', command: '@tencent-connect/dsh-qqbot@latest' },
          { title: '用手机 QQ 扫码', detail: '打开 DSH“设置 → QQ 机器人”，按页面提示用手机 QQ 扫码并完成绑定。连接和账号问题以 QQBot 的绑定页面及日志为准，本插件不提供第二套 QQ 登录。' },
          { title: '测试普通文字回复', detail: '进入已绑定机器人的 QQ 私聊，发送“你好”。等到机器人正常回复文字后再继续。群聊需先让机器人加入目标群，并按 QQBot 设置要求 @机器人。若文字无回复，检查连接、机器人使用的对话模型及 QQBot 日志，暂时不要排查音色。' },
        ],
        items: [],
        links: [{ label: 'QQBot 官方安装与绑定说明', href: 'https://github.com/tencent-connect/dsh-qqbot#安装' }],
      },
      {
        id: 'qqbot-configure', title: '开启传声与选择预设',
        summary: '组件、来源开关、会话预设各管一件事，需要逐项完成。',
        steps: [
          { title: '开启 QQ Bot 传声组件', detail: '在“设置 → 插件 → 本插件 → 包含的组件”开启“QQ Bot 传声”。这一个组件同时提供 QQ 发送适配和“QQ 鲸鱼娘”预设，无需另开普通“鲸鱼娘 Agent 预设”来代替它。' },
          { title: '开启自动发送来源并保存', detail: '打开本插件“播报台 → 插件联动”，打开“QQ Bot”来源开关，再点击底部“保存”。来源默认关闭；希望每轮普通回复都带语音时才打开。浏览器“语音播放”“自动播放”和音效开关不控制 QQ 发送。' },
          { title: '在目标 QQ 私聊或群查看预设', detail: '向机器人单独发送下面的命令，确认列表中出现“QQ 鲸鱼娘（qq-speech-assistant）”。只查看列表不会切换预设；如果未出现，先检查传声组件是否运行，以及两个插件是否处于同一 profile。', command: '/preset' },
          { title: '按 ID 选择 QQ 鲸鱼娘', detail: '单独发送下面的完整命令，等待机器人确认预设已切换。使用 ID qq-speech-assistant，沿用旧版“QQ 语音助手”的 ID；不需要把中文显示名称填入命令。', command: '/preset qq-speech-assistant' },
          { title: '新建对话让预设生效', detail: '在刚才选择预设的同一个 QQ 私聊或群中单独发送 /new。它会开启新对话并清空原对话上下文；当前对话不会因 /preset 自动换预设。私聊和每个群各自选择，需在每个目标会话重复选择与新建步骤。', command: '/new' },
        ],
        items: [],
        links: [{ label: 'QQBot 官方预设命令实现', href: 'https://github.com/tencent-connect/dsh-qqbot/blob/main/src/commands/preset.ts' }],
      },
      {
        id: 'qqbot-verify', title: '验证自动与按需发送',
        summary: '请在 QQ 中实际点击语音消息播放；网页试听成功只验证了合成，没有验证 QQ 交付。',
        steps: [
          { title: '测试自动语音', detail: '来源开启并保存后，在新对话中发送“你好，介绍一下自己”，无需额外要求语音。等本轮成功结束，确认收到文字和可点击播放的语音消息，播放核对内容与已保存音色。文字与语音的到达先后没有严格保证。' },
          { title: '测试仅按需发送', detail: '关闭 QQ Bot 来源并保存，再发一条普通消息，确认不会自动附带语音。接着发送“请用语音说一句你好”，由模型调用语音工具完成按需发送；前提是传声组件与 QQ 预设仍启用、工具权限允许。' },
          { title: '恢复你需要的模式', detail: '希望每轮都带语音就重新打开来源并保存；只想偶尔听语音则保持来源关闭。更换云端服务商、模型或音色后也要保存，再用新的 QQ 消息验证。已发出的语音不会随设置改变。' },
        ],
        table: {
          caption: '两个开关对应的发送行为', headers: ['QQ Bot 传声', 'QQ Bot 来源', '结果'],
          rows: [
            ['开启', '开启并保存', '成功轮次自动发送完整正文；本轮显式调用 speak 后不再自动补发。'],
            ['开启', '关闭并保存', '不自动发送，仍可按用户要求调用语音工具。'],
            ['关闭', '任意', '本插件不提供 QQ 语音发送；QQBot 的普通文字链路仍可工作。'],
          ],
        },
        items: [],
      },
      {
        id: 'qqbot-behavior', title: '长回复、停止与表情包',
        summary: '自动语音在成功轮次结束后开始处理，不会逐字跟读 QQ 中正在生成的文字。',
        items: [
          { label: '朗读哪些内容', detail: '自动发送最后一条助手正文，过滤思考、工具过程、代码、链接和文件路径。QQ 不按浏览器的“智能／全文／首段”范围裁剪，也不再按 300 字或 60 秒截断；超过合成接口单次文本上限时按顺序分段发送。供应商单次音频大小与 QQ 平台限制仍适用。' },
          { label: '取消与重新发送', detail: '新轮次会取消尚未发送的旧任务；关闭来源取消待处理的自动语音，仍保留按需语音。重新开启不补发关闭期间的回复。失败、取消、被打断的轮次不自动朗读，分段发送中失败会停止后续段落，不自动重试。' },
          { label: '已经开始上传的消息', detail: 'QQBot 上传发送一旦开始，取消不能保证撤回已送出的消息，/stop 也不是语音撤回命令。怀疑发送失败时先查看 QQ 会话和日志，确认实际送达情况后再决定是否重试，避免重复。' },
          { label: 'QQ 鲸鱼娘与表情包', detail: '内置预设默认用一到三句口语短话回答，明确要求详细说明时展开。它附带人设和本地表情包能力，无需手动加载 skill；可要求“不发图片”或“只要语音”。QQ Bot 来源仅控制自动语音，不控制表情包。' },
        ],
      },
      {
        id: 'qqbot-troubleshooting', title: '按故障位置排查',
        summary: '按文字连接 → 云端合成 → 组件与预设 → QQ 交付的顺序检查，每次只改一处并重新测试。',
        items: [
          { label: '文字和语音都没有', detail: '先回到 QQBot 连接页确认在线，再核对目标私聊／群、群内 @要求和对话模型。连普通文字都收不到时，问题通常还没有进入语音链路。' },
          { label: '预设缺失或切换后无变化', detail: '确认“QQ Bot 传声”已运行、两个插件在同一实例。看到预设仍不够，需收到切换确认并在同一 QQ 目标执行 /new。不要用普通鲸鱼娘预设替代 QQ 鲸鱼娘。' },
          { label: '能回文字，但普通消息没有语音', detail: '先在真实 DSH 关闭本地语音并试听，确认云端可用；再检查 QQ Bot 来源是否打开并保存，以及 QQ 会话是否应用了新预设。来源关闭时普通回复不发语音属于预期，可用明确的语音请求继续定位。' },
          { label: '明确要求语音也失败', detail: '查看本插件的合成错误及 QQBot 的文件发送日志，区分密钥／资源／音色问题与 qqbot_send_file 工具不可用、工具策略拒绝、路径白名单或 QQ 额度问题。适配器使用 QQBot 默认媒体目录，不需要为正常接入关闭路径限制，也不要手动填写 openid。' },
          { label: '长回复只收到一部分', detail: '检查第一条失败分段的供应商错误、文件发送错误和平台额度。后续分段会停止，不会自动补发；先修复具体错误，再明确请求重发需要的内容。' },
          { label: '反馈时带哪些信息', detail: '记录发生时间、私聊还是群聊、所选服务商／模型、组件和来源开关状态、是否已执行 /new，以及脱敏后的错误代码。不要附带 API Key、QQ 凭据或完整私人对话。' },
        ],
        links: [{ label: '返回用户手册', href: '#manual' }, { label: '豆包云端故障排查', href: '#doubao-troubleshooting' }],
      },
    ],
    notes: [{ title: '接入完成的标准', body: '同一个目标 QQ 会话中，普通文字回复正常，预设切换并新建对话后，能收到并播放符合已保存音色的语音；关闭来源后普通消息不再自动附带语音。' }],
  },
  en: {
    title: 'Give your QQ replies a voice',
    intro: 'Verify text replies first, then cloud synthesis, then the QQ Whale Girl preset. Perform these steps in real DSH and QQ. This preview does not connect a bot or send messages.',
    toc: 'On this page',
    sections: [
      {
        id: 'qqbot-start', title: 'Before you begin', summary: 'Use one running DSH instance with QQBot and a working Xiaomi or Doubao cloud voice.',
        items: [
          { label: 'One instance and profile', detail: 'Install and enable dsh-xiaomi-tts and @tencent-connect/dsh-qqbot in the same DSH instance/profile. Separate profiles do not share plugins, services, presets, or saved speech settings.' },
          { label: 'Verify real cloud synthesis', detail: 'Choose Xiaomi or Doubao in plugin settings and save the key, model, and voice. Disable local speech fallback and play a short preview in Broadcast Desk. Confirm the status names your cloud provider and you hear its voice. QQ delivery runs on the host and cannot use browser speech fallback.' },
          { label: 'Keep the host running', detail: 'You may close the web page after configuration, but DSH, the bot connection, and the speech service must stay running. Start with a private QQ chat before setting up groups.' },
        ],
        links: [{ label: 'Set up Doubao first', href: '#doubao' }, { label: 'General settings', href: '#manual' }],
      },
      {
        id: 'qqbot-connect', title: 'Install and connect QQBot', summary: 'First confirm that a message in QQ receives a normal text reply.',
        steps: [
          { title: 'Install the official plugin', detail: 'Open Plugins → Add plugin in DSH, enter this package name, and install/start it. Existing installations should already be running without errors.', command: '@tencent-connect/dsh-qqbot@latest' },
          { title: 'Bind with mobile QQ', detail: 'Open Settings → QQ 机器人 in DSH and complete the QR binding flow using mobile QQ. Connection and account issues belong to QQBot’s binding page and logs; this plugin does not add another QQ login.' },
          { title: 'Check a text reply', detail: 'Send “Hello” in the bound bot’s private chat. Proceed once it replies. For a group, add the bot and @mention it when required. If text fails, check the connection and conversation model before investigating speech.' },
        ], items: [],
        links: [{ label: 'Official QQBot installation', href: 'https://github.com/tencent-connect/dsh-qqbot#安装' }],
      },
      {
        id: 'qqbot-configure', title: 'Enable delivery and select a preset', summary: 'The component, source switch, and conversation preset have separate roles.',
        steps: [
          { title: 'Enable QQ Bot Voice Relay', detail: 'Open Settings → Plugins → this plugin → Included components. Enable QQ Bot Voice Relay (QQ Bot 传声). It includes both delivery and the QQ 鲸鱼娘 preset. The regular Whale Girl Agent component is not a substitute.' },
          { title: 'Enable and save automatic delivery', detail: 'In Broadcast Desk → Plugin integrations, turn QQ Bot on and click Save. It starts off. Browser speech, autoplay, and sound effect switches do not control QQ delivery.' },
          { title: 'List presets in the target QQ chat', detail: 'Send this command separately and find QQ 鲸鱼娘 (qq-speech-assistant). Listing presets alone does not select one. If missing, check the relay component and ensure both plugins share one profile.', command: '/preset' },
          { title: 'Select by preset ID', detail: 'Send the full command and wait for confirmation. Use qq-speech-assistant rather than the Chinese display name. The ID is unchanged from the earlier QQ Speech Assistant preset.', command: '/preset qq-speech-assistant' },
          { title: 'Apply it to a new conversation', detail: 'Send /new separately in that same private chat or group. This clears the old conversation context and starts with the selected preset. The existing conversation keeps its old preset. Repeat preset selection and /new for every target group or private chat.', command: '/new' },
        ], items: [],
        links: [{ label: 'Official preset command', href: 'https://github.com/tencent-connect/dsh-qqbot/blob/main/src/commands/preset.ts' }],
      },
      {
        id: 'qqbot-verify', title: 'Test automatic and requested speech', summary: 'Play the actual voice message in QQ. A web preview tests synthesis, not QQ delivery.',
        steps: [
          { title: 'Test automatic voice', detail: 'With the source saved on, ask “Hello, introduce yourself” in the new conversation without requesting voice. After a successful turn, expect text and a playable voice message. Check its content and saved voice. Text and voice arrival order is not guaranteed.' },
          { title: 'Test voice on request', detail: 'Turn the QQ Bot source off and save. An ordinary message should no longer trigger automatic voice. Then ask “Please say hello in a voice message.” The model can call the speech tool if the relay, QQ preset, and tool permissions remain available.' },
          { title: 'Keep your preferred mode', detail: 'Turn the source back on and save for voice on every successful turn, or leave it off for requested voice. Save provider, model, and voice changes and test with a new QQ message; existing recordings do not change.' },
        ],
        table: { caption: 'Delivery switches', headers: ['Voice Relay', 'QQ Bot source', 'Result'], rows: [
          ['On', 'On and saved', 'Automatic full voice replies. An explicit speak call suppresses automatic duplication for that turn.'],
          ['On', 'Off and saved', 'No automatic voice; requested speech remains available.'],
          ['Off', 'Either', 'No QQ speech from this plugin. QQBot text replies can still work.'],
        ] }, items: [],
      },
      {
        id: 'qqbot-behavior', title: 'Long replies, cancellation, and memes', summary: 'Automatic synthesis starts after a successful turn, rather than following text as it streams into QQ.',
        items: [
          { label: 'What gets read', detail: 'The last assistant body is read, excluding reasoning, tool output, code, links, and paths. QQ ignores browser read scope and has no 300-character or 60-second cutoff. Replies exceeding the synthesis text limit are sent in ordered segments. Provider audio size and QQ platform limits still apply.' },
          { label: 'Cancellation and retries', detail: 'A new turn cancels older unsent work. Turning the source off cancels pending automatic speech but keeps requested speech available. Re-enabling never catches up old replies. Failed, canceled, or interrupted turns are not read automatically. A segment failure stops subsequent segments without automatic retry.' },
          { label: 'Uploads already in progress', detail: 'Cancellation cannot guarantee recall once QQBot begins uploading or sending. /stop is not a voice recall command. Check the chat and delivery logs before requesting a retry to avoid duplicate messages.' },
          { label: 'Persona and memes', detail: 'QQ Whale Girl normally uses one to three conversational sentences, expanding when asked. Its persona and local memes are bundled; no manual skill loading is required. You can ask for no pictures or voice only. The QQ Bot source controls automatic speech, not memes.' },
        ],
      },
      {
        id: 'qqbot-troubleshooting', title: 'Locate the failure', summary: 'Check text connectivity, cloud synthesis, component and preset, then QQ delivery. Change one thing at a time.',
        items: [
          { label: 'No text or voice', detail: 'Check QQBot online status, the target chat, group mention requirements, and the conversation model. If plain text does not work, fix the bot connection first.' },
          { label: 'Missing or ineffective preset', detail: 'Check Voice Relay and the shared profile. Obtain preset selection confirmation, then send /new in the same QQ target. Do not substitute the regular Whale Girl preset.' },
          { label: 'Text without automatic voice', detail: 'Verify real cloud synthesis with local fallback disabled. Then check the saved QQ Bot source and that the new conversation uses the QQ preset. With the source off, ordinary text-only replies are expected; use an explicit voice request to investigate further.' },
          { label: 'Requested voice also fails', detail: 'Inspect synthesis errors and QQBot file delivery logs. Separate key/resource/voice errors from unavailable qqbot_send_file, tool policy rejection, path restrictions, or QQ quota. Normal integration uses QQBot’s default media directory; there is no need to disable path restrictions or supply an openid manually.' },
          { label: 'Only part of a long reply arrives', detail: 'Find the first failed segment and inspect provider, file delivery, and quota errors. Later segments stop rather than retry. Resolve the cause before explicitly requesting the missing content.' },
          { label: 'Useful diagnostic details', detail: 'Record the time, private/group chat, provider/model, component and source state, whether /new ran, and redacted error codes. Exclude API keys, QQ credentials, and private conversation contents.' },
        ],
        links: [{ label: 'User manual', href: '#manual' }, { label: 'Doubao troubleshooting', href: '#doubao-troubleshooting' }],
      },
    ],
    notes: [{ title: 'Completion check', body: 'In the same target QQ chat, text works and a new conversation using the selected preset produces playable voice with the saved voice settings. Turning the source off stops automatic voice on ordinary replies.' }],
  },
}
