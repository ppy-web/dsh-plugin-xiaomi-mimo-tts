import type { ReactElement } from 'react'
import { DocumentPage } from './document-page.js'
import type { ManualCopy } from './document-page.js'

export type ManualLocale = 'zh' | 'en'

const COPY: Record<ManualLocale, ManualCopy> = {
  zh: {
    title: '把鲸鱼娘调成你喜欢的样子',
    intro: '按使用顺序了解语音配置、自动朗读与播放操作。QQBot 与豆包接入教程可从侧栏单独打开。所有安装和连接操作均在真实 DSH 中执行；本预览不修改 DSH，也不向 QQ 发送消息。',
    toc: '目录',
    sections: [
      {
        id: 'manual-start',
        links: [{ label: 'QQBot 接入教程', href: '#qqbot' }, { label: '豆包语音接入教程', href: '#doubao' }],
        title: '01 · 开始使用',
        summary: '先选择小米 MiMo 或豆包语音并保存密钥，再选择模型和音色试听。',
        items: [
          { label: '功能入口', detail: '侧栏按语音体验、插件管理和工具与帮助分组。插件设置、语音朗读、对话效果、详情、组件、文本过滤和手册均可单独打开；音频历史从插件设置页底部进入二级页面，启用引导以弹窗展示。手机上点击顶部侧栏按钮展开导航。' },
          { label: '推荐操作顺序', detail: '在真实 DSH 中选择语音服务商 → 填写 API Key 并保存 → 选择模型和音色 → 在播报台试听 → 保存确认后的语音与来源设置。试听可使用模型、音色等草稿，新密钥必须先保存；QQ 联动使用已保存配置。' },
          { label: '只读状态', detail: '在侧栏底部开启“只读配置”，可检查设置面板中输入、开关和选择器的禁用状态；关闭后即可继续编辑。' },
        ],
      },
      {
        id: 'manual-switches',
        title: '02 · 基础开关',
        summary: '三个角色卡片控制插件、自动播放和音效。',
        items: [
          { label: '语音播放', detail: '点击鲸鱼娘卡片或其中的复选框切换总开关。关闭后会隐藏调音台和播报台，并同时关闭自动播放、停止试听；重新开启后保留原有语音和播报来源配置。' },
          { label: '自动播放', detail: '新安装默认关闭。点击第二张角色卡片切换自动朗读；打开后，助手回复会自动尝试朗读，浏览器仍可能因自动播放策略拒绝。打开它会自动打开“语音播放”，关闭它只关闭自动朗读。' },
          { label: '音效', detail: '新安装默认关闭。点击第三张角色卡片切换音效总开关；开启后显示下方“音效库”，按面板内选择的范围播放，关闭后隐藏模块并保留配置。' },
          { label: 'QQ 语音发送', detail: '浏览器语音播放、自动播放和音效开关不控制 QQ 发声。QQ 发送能力由“QQ Bot 传声”组件决定，是否自动发送由“播报台 → 插件联动 → QQ Bot”来源开关决定，修改来源后需保存。' },
        ],
      },
      {
        id: 'manual-api-key',
        title: '03 · API Key',
        summary: '密钥只在点击“保存”时写入 DSH。',
        items: [
          { label: '服务商与获取 API Key', detail: '点击服务商名称可在小米 MiMo 与豆包语音之间切换。“获取 API Key”会打开当前服务商的密钥页面；豆包使用新版控制台的 API Key。两家的密钥、模型与音色分别保存，切换服务商不会覆盖另一家的配置。' },
          { label: '密钥输入框', detail: '在密码框中输入当前服务商的新 API Key。输入内容会被隐藏；输入后不会立即保存。清空输入草稿不会修改已保存密钥。' },
          { label: '密钥状态', detail: '提示会区分读取中、未配置、格式已识别、格式异常、Host 状态不可用和待保存。格式识别不等于连接已验证；保存后请用播报台确认。' },
        ],
      },
      {
        id: 'manual-console',
        title: '04 · 调音台',
        summary: '控制音量、速度、模型、声音来源和本地兜底策略。',
        items: [
          { label: '调音台标题', detail: '点击“调音台”标题栏展开或收起详细设置。标题栏摘要会显示当前音量、倍速、朗读范围、模型、声音和策略。' },
          { label: '音量滑块', detail: '拖动或用键盘方向键调整语音音量；松开鼠标或完成键盘操作时会试听当前音量。旁边的“恢复默认”按钮会把该项恢复为基础配置，恢复动作仍需点击“保存”。' },
          { label: '播放速度滑块', detail: '拖动或用键盘调整 0.5×–2.0× 速度。豆包在云端合成时应用语速，播放时保持 1×；小米 PCM 在本地调整速度，音高会随速度改变。' },
          { label: '模型按钮', detail: '小米可选择预置音色或音色设计；豆包可选择标准合成（seed-tts-2.0）或声音复刻（seed-icl-2.0）。下方音色控件随所选模型切换。' },
          { label: 'Voice Design 选择器与手动编辑', detail: '点击声音设计选择器，选择“自定义”或一个预设。选择自定义后可直接编辑音色描述文本框。' },
          { label: '语音指令与风格', detail: '小米与豆包标准合成提供各自的风格预设，也可手动输入；两家的指令独立保存。小米内置音色默认不附加风格，非空指令优先于 presetStylePrompt；已有该项配置仅在指令留空时使用。Voice Design 仍保留音色描述。本地语音和豆包复刻不应用语音指令。' },
          { label: '内置声音 / 浏览器声音选择器', detail: '点击选择器打开列表，再点击一个声音完成选择；也可用方向键、Home、End 浏览，Esc 关闭。浏览器声音会显示语言及在线/离线状态；本地语音策略关闭时，浏览器声音选择器会禁用。' },
          { label: '朗读范围单选项', detail: '智能模式自动朗读短文全文、长文前两个语义段，手动朗读全文；全文模式自动与手动均读全文；首段模式自动与手动均只读首个语义段。范围应用于浏览器朗读，QQ 自动语音始终发送完整回复。' },
          { label: '语音策略单选项', detail: '点击“云端优先”“本地优先”或“关闭本地语音”。云端使用当前选择的小米或豆包服务；前两项决定云端与浏览器语音的兜底顺序，关闭本地语音后只使用云端。' },
          { label: '字段“恢复默认”按钮', detail: '带“已覆盖”标记的字段会出现“恢复默认”按钮。点击后只清除该字段的用户覆盖并回到基础值；它不会绕过底部保存，也不会影响其他字段。' },
        ],
      },
      {
        id: 'manual-reading',
        title: '自动朗读与回复偏好',
        summary: '宿主决定读哪些回复，插件决定每条回复读多长。',
        items: [
          { label: '独立语音朗读页', detail: '侧栏“语音朗读”展示宿主独立设置页，可调整自动播报、声音和朗读范围；需要 API Key、模型、语音指令或插件联动时，前往插件设置。' },
          { label: '全部回复 / 仅最终回答', detail: '宿主选择“全部回复”时，支持实时朗读的模型在生成过程中播放，其余回复完成后播放；选择“仅最终回答”时，等待回合结束，只读宿主确认的最终回复，再应用朗读范围。' },
          { label: '停止与切换', detail: '切换会话、中途打开已有对话或重新开启自动播报，不补播已有内容。切换宿主回复偏好会停止当前自动朗读，从下一轮生效；手动点击消息的朗读按钮仍按该消息与朗读范围执行。' },
          { label: '避免重复', detail: '已进入实时朗读队列的正文，结束后不会再次自动从头播放。手动朗读可重播；云端已经开始播放后失败，不会自动切换浏览器声音重读。' },
        ],
      },
      {
        id: 'manual-sounds',
        title: '05 · 音效库',
        summary: '为 DSH 的任务和点击动作选择 UI 音效。',
        items: [
          { label: '音效库与范围选择', detail: '点击标题展开面板；调音台、音效库和播报台使用单开模式，展开一个会收起另外两个。面板内可横向选择全部开启、仅点击音效或仅任务音效；这只改变范围，总开关仍由顶部“音效库”控制。关闭再开启总开关会保留范围。' },
          { label: '音效音量滑块', detail: '拖动或用键盘调整音效音量；完成操作时会试听当前音量。音效总开关关闭时隐藏整个音效库；重新开启后保留原来的范围、音量和音效包。' },
          { label: '音效包按钮', detail: '点击一个音效包卡片选择它；再次点击当前卡片会播放一次点击提示音。也可用方向键、Home、End 在 12 个音效包之间移动。当前选项会显示选中状态。' },
          { label: '音效试听按钮', detail: '点击“开始”“完成”“失败”“提醒”或“点击”试听对应声音。每次点击都会播放一次，即使音效库当前折叠也不影响已开始的播放；关闭总开关会隐藏整个音效库。' },
          { label: '任务音效 / 点击音效', detail: '顶部开关只控制音效总开关，面板内三个选项只选择范围；关闭总开关会保留选择。修改后保存生效。' },
        ],
      },
      {
        id: 'manual-broadcast',
        title: '06 · 播报台',
        summary: '位于音效库下方的可折叠播报台，支持文字试听与来源设置。',
        items: [
          { label: '宿主播报来源', detail: '提问卡片标题默认开启并跟随自动播报，只读当前题目标题；翻题、提交、关闭或切换会话时取消。首次开启不补播已有卡片，忙碌时跳过。审批提醒和后台任务结果默认关闭、独立于自动播报，只观察当前会话；审批处理或撤回后停止语音，后台任务仅播报观察到运行过程后的结束、失败或取消。宿主需提供相应服务。' },
          { label: '插件联动', detail: 'dsh-pet 默认关闭，dsh-whale-musume 语音接口默认开启，来源名称可跳转项目主页。QQ Bot 默认关闭：开启并保存后自动发送完整语音；关闭后保留按需语音。QQ 需要另行启用 QQ Bot 传声组件并在 QQ 中选择对应预设，完整流程见独立的 QQBot 接入教程。' },
          { label: '试听文本框', detail: '点击文本框输入或替换试听内容，最多 100 个字符。文本为空时，试听按钮会禁用；试听文本本身不会写入 DSH。模型、声音、音量和速度可直接使用草稿，但新 API Key 必须先保存。' },
          { label: '播放 / 停止按钮', detail: '点击摘要首个“试听”标签即可直接播放当前文案，无需展开；面板内的“播放试听”按钮使用同一播放器。准备中或播放中再次点击可中断。状态提示会显示当前语音来源，并针对未配置密钥、密钥被拒绝、限流、超时、本地音色不可用和自动播放限制给出对应提示。' },
        ],
        links: [{ label: 'QQ Bot 接入流程', href: '#qqbot' }],
      },
      {
        id: 'manual-actions',
        title: '07 · 底部操作栏',
        summary: '查看源码、放弃草稿与保存配置。',
        items: [
          { label: '✨ 查看源码', detail: '点击后在新标签页打开插件 GitHub 仓库，用于查看源代码、问题和发布记录。' },
          { label: '音频历史 · 数量', detail: '点击插件设置页底部的“音频历史 · 数量”进入二级页面，普通与极简模式共用紧凑布局，关闭语音播放后仍可访问。标题栏右侧可搜索摘要或按来源筛选，点击摘要展开文字；使用记录左侧的圆形按钮播放或暂停，当前记录内可拖动进度。存储信息位于底部。下载不请求 MiMo；删除需确认，清空会删除全部记录，包括被筛选隐藏的记录。点击标题左侧的返回按钮回到设置页，未保存的设置会保留；返回或离开页面会停止重听。记录保存在当前浏览器，最多 100 条 / 100 MB；存储不可用时会显示临时保存提示。' },
          { label: '放弃修改', detail: '点击后丢弃当前所有未保存草稿，恢复到设置层最近一次已接受的值；不会写入新的配置。没有未保存修改或只读时按钮不可用。' },
          { label: '保存', detail: '点击后按字段提交所有修改，并在提交前收起调音台和音效库。成功显示“已保存”；失败显示错误提示，可在修正后重试。保存是 API Key、语音和音效设置真正持久化的边界。' },
        ],
      },
      {
        id: 'manual-troubleshooting',
        title: '试听与故障排查',
        summary: '先区分预览演示、浏览器语音和真实云端合成，再检查对应配置。',
        items: [
          { label: '预览页能验证什么', detail: '本页模拟保存、组件状态和云端合成，播放的是演示音频，不校验真实供应商权限或 QQ 连通性。真实云端和 QQ 发送请按独立接入教程在 DSH 中验证；浏览器本地语音可用于检查本机声音权限。' },
          { label: '密钥格式正确，云端仍失败', detail: '格式识别只检查密钥形式。在真实 DSH 保存密钥，选择“关闭本地语音”再试听，避免浏览器兜底掩盖云端失败。豆包还需开通对应模型、资源与音色；Agent Plan 使用专属 Key，Coding Plan 不含语音模型。' },
          { label: '浏览器不自动播放', detail: '先点击播放按钮确认权限、系统音量与输出设备，再检查语音播放和自动播放开关。自动播放策略可能阻止页面发声；QQ 语音由宿主发送，应单独在 QQ 验证。' },
          { label: '豆包实时朗读异常', detail: '真实 DSH 宿主需支持 WebSocket upgrade，反向代理需转发 Upgrade。仅最终回答模式会等待回合完成；停止当前朗读或切换会话后，不补播旧内容。' },
        ],
      },
      {
        id: 'manual-preview-tools',
        title: '09 · 预览导航与工具',
        summary: '这些控件只服务于本地预览，不属于插件设置。',
        items: [
          { label: '语言', detail: '顶部语言菜单支持中文、英文、日语和法语，切换语言保留配置。手册提供中文和英文版本，日语与法语界面显示英文手册。' },
          { label: '主题', detail: '点击顶部的太阳或月亮图标切换浅色和深色主题，不改变设置值。' },
          { label: '只读', detail: '侧栏底部的“只读配置”模拟 DSH 只读设置层；关闭后恢复编辑。' },
          { label: '重置状态', detail: '清空 Preview 的本地草稿、关闭只读并重新载入设置卡片，用于重新开始一次演示；不会改动真实 DSH 配置。' },
        ],
      },
    ],
    notes: [
      { title: '保存边界', body: '此页面仅供预览，所有修改（包括点击“保存”）都只作用于本地模拟状态，不会影响 DSH 设置。' },
      { title: '声音权限', body: '浏览器可能阻止自动播放或本地语音。遇到这种情况，请直接点击播放按钮，并检查浏览器和系统音频权限。' },
    ],
  },
  en: {
    title: 'Tune Whale Maid your way',
    intro: 'Set up speech and understand automatic reading and playback controls. QQBot and Doubao setup guides have their own sidebar pages. Perform installation and connection steps in real DSH; this preview does not change DSH or send QQ messages.',
    toc: 'Contents',
    sections: [
      {
        id: 'manual-start',
        links: [{ label: 'QQBot setup guide', href: '#qqbot' }, { label: 'Doubao voice setup guide', href: '#doubao' }],
        title: '01 · Getting started',
        summary: 'Choose Xiaomi MiMo or Doubao, save its key, then select a model and voice to preview.',
        items: [
          { label: 'Feature navigation', detail: 'The sidebar groups speech, plugin management, and tools. Audio history opens as a subpage from the plugin settings footer; Activation guide opens a modal. On a phone, use the sidebar button in the top bar to open navigation.' },
          { label: 'Recommended order', detail: 'In DSH, choose a provider → enter and save its API key → select a model and voice → test in Broadcast Desk → save the confirmed voice and source settings. Previews can use voice drafts, but a new key must be saved first. QQ delivery uses saved configuration.' },
          { label: 'Read-only state', detail: 'Turn on Read-only settings at the bottom of the sidebar to inspect disabled controls. Turn it off to edit again.' },
        ],
      },
      {
        id: 'manual-switches',
        title: '02 · Basic switches',
        summary: 'Three character cards control the plugin, autoplay, and sounds.',
        items: [
          { label: 'Voice playback', detail: 'Click the Whale Maid card or its checkbox to toggle the main switch. Turning it off hides the mixer and Broadcast Desk, turns autoplay off and stops the preview. Turning it back on retains the voice and announcement source settings.' },
          { label: 'Automatic playback', detail: 'New installs start with this off. Click the second character card to toggle automatic reading; the browser may still reject autoplay. Enabling it also enables Voice playback; disabling it only turns off automatic reading.' },
          { label: 'Sound effects', detail: 'New installs start with this off. Click the third character card to toggle the sound master switch. Turning it on shows Sound Effects below and plays the selected scope; turning it off hides the module and retains its settings.' },
          { label: 'QQ voice delivery', detail: 'Browser voice playback, autoplay, and sounds do not control QQ delivery. QQ Bot Voice Relay enables delivery; Broadcast Desk → Plugin integrations → QQ Bot controls automatic delivery. Save source changes to apply them.' },
        ],
      },
      {
        id: 'manual-api-key',
        title: '03 · API Key',
        summary: 'The key is written to DSH only when Save is clicked.',
        items: [
          { label: 'Provider and API key', detail: 'Click the provider name to switch between Xiaomi MiMo and Doubao. Get API Key opens the selected provider’s key page; Doubao uses an API key from the new console. Keys, models, and voices are saved separately for each provider.' },
          { label: 'Key input', detail: 'Enter the selected provider’s new key in the password field. It stays hidden and is not saved immediately. Erasing the draft leaves the saved key intact.' },
          { label: 'Key status', detail: 'The status distinguishes loading, missing, recognized format, unrecognized format, unavailable Host state, and unsaved changes. A recognized prefix is not a connection check; use Broadcast Desk after saving.' },
        ],
      },
      {
        id: 'manual-console',
        title: '04 · Mixing Console',
        summary: 'Control volume, speed, model, voice source, and local fallback.',
        items: [
          { label: 'Console header', detail: 'Click Mixing Console to expand or collapse detailed settings. Its summary shows volume, speed, read scope, model, voice, and strategy.' },
          { label: 'Voice volume slider', detail: 'Drag or use arrow keys to change voice volume; releasing the pointer or finishing a keyboard interaction previews that level. Restore default returns this field to its base value, but still requires Save.' },
          { label: 'Playback speed slider', detail: 'Drag or use the keyboard to set 0.5×–2.0× speed. Doubao applies speed during cloud synthesis and plays the result at 1×. Xiaomi PCM adjusts speed locally, which also changes pitch.' },
          { label: 'Model buttons', detail: 'Xiaomi offers preset voices and Voice Design. Doubao offers Standard TTS (seed-tts-2.0) and Voice cloning (seed-icl-2.0). Voice controls change with the selected model.' },
          { label: 'Voice Design picker', detail: 'Open the picker and choose Custom or a preset. Custom enables the editable description. Edit the description directly and save the settings when it is ready.' },
          { label: 'Speech instructions and styles', detail: 'Xiaomi and Doubao Standard offer separate style presets and custom instructions, saved independently. Xiaomi built-in voices add no style by default. A nonempty instruction takes priority over presetStylePrompt; an existing presetStylePrompt is used only when the instruction is blank. Voice Design keeps its voice description. Browser speech and Doubao cloning do not apply speech instructions.' },
          { label: 'Built-in / browser voice pickers', detail: 'Click a picker to open its list, then click a voice. Arrow keys, Home, End, and Escape also work. Browser voices show language and online/offline status; the browser voice picker is disabled when local speech is disabled.' },
          { label: 'Read-aloud scope radios', detail: 'Smart automatically reads short replies in full and the first two semantic segments of long replies; manual reading uses the full reply. Full always reads everything. First segment limits both automatic and manual reading to that segment. These scopes apply to browser reading; QQ automatic voice sends the full reply.' },
          { label: 'Speech strategy radios', detail: 'Choose Cloud first, Local first, or Disable local speech. Cloud speech uses the selected Xiaomi or Doubao provider. The first two choose the fallback order; disabling local speech uses only the cloud provider.' },
          { label: 'Restore default buttons', detail: 'Fields marked Overridden expose Restore default. Clicking it clears that field’s user override and returns to its base value; it does not bypass Save or affect other fields.' },
        ],
      },
      {
        id: 'manual-reading',
        title: 'Automatic reading and reply preferences',
        summary: 'The host chooses which replies to read; the plugin chooses how much of each reply to read.',
        items: [
          { label: 'Dedicated Voice reading page', detail: 'Voice reading in the sidebar opens the independent host settings page for autoplay, voices, and read scope. Use plugin settings for API keys, models, speech instructions, and integrations.' },
          { label: 'All replies / Final answer only', detail: 'All replies allows supported models to read during generation; other replies play after completion. Final answer only waits for the turn to finish, reads the final answer identified by the host, then applies the plugin read scope.' },
          { label: 'Stopping and switching', detail: 'Switching conversations, opening an existing conversation, or enabling autoplay does not replay old content. Changing the host reply preference stops current automatic reading and applies next turn. Manual reading still uses the selected message and read scope.' },
          { label: 'Avoiding duplicate playback', detail: 'Text already queued for live reading is not automatically replayed from the beginning after completion. Manual reading can replay it. A cloud failure after playback starts does not restart the reply with browser speech.' },
        ],
      },
      {
        id: 'manual-sounds',
        title: '05 · Sound Effects',
        summary: 'Choose UI sounds for DSH tasks and clicks.',
        items: [
          { label: 'Sound Effects and scope', detail: 'The Mixer, Sound Effects, and Broadcast Desk share a single-open accordion. Choose All sounds, Click sounds only, or Task sounds only inside Sound Effects. These choices do not change the master switch at the top, and switching it off and on retains the selected scope.' },
          { label: 'Sound volume slider', detail: 'Drag or use arrow keys to change sound volume; finishing the interaction previews the level. Turning the master switch off hides the entire Sound Effects module. Turning it back on retains the scope, volume, and pack.' },
          { label: 'Sound pack buttons', detail: 'Click a pack card to select it; clicking the current card again plays a click cue. Arrow keys, Home, and End move through all 12 packs. The selected card exposes its checked state.' },
          { label: 'Sound preview buttons', detail: 'Click Start, Complete, Error, Notification, or Press to preview that cue once. Turning the sound switch off hides the entire Sound Effects module.' },
          { label: 'Task / click sounds', detail: 'The top switch controls sound playback; the three options inside the panel select its scope. Save to apply the changes.' },
        ],
      },
      {
        id: 'manual-broadcast',
        title: '06 · Broadcast Desk',
        summary: 'A collapsible panel below Sound Effects for text previews and announcement sources.',
        items: [
          { label: 'Host announcements', detail: 'Question titles are enabled by default and follow autoplay. Only the current title is read; changing, submitting, closing, or switching sessions cancels speech. Existing cards are not replayed on activation, and busy speech is respected. Approval reminders and Background job results are off by default, independent of autoplay, and limited to the current conversation. Answered or withdrawn approvals stop speech. Jobs announce settlement only after their live state was observed. The corresponding host services must be available.' },
          { label: 'Plugin integrations', detail: 'dsh-pet is off by default; the dsh-whale-musume speech API is on. Source names link to their projects. QQ Bot starts off: enable and save it for automatic full voice replies; leave it off for voice on request. Enable QQ Bot Voice Relay and select its QQ preset using the dedicated setup guide.' },
          { label: 'Preview text field', detail: 'Click and replace the preview text, up to 100 characters. An empty field disables the preview button. Model, voice, volume, and speed drafts apply immediately, but a new API key must be saved first.' },
          { label: 'Play / stop button', detail: 'Click the first Preview chip in the summary to play the current text without expanding the panel. The Play preview button inside uses the same player. Click again while preparing or playing to stop. The status identifies the speech source and distinguishes missing or rejected keys, rate limits, timeouts, unavailable local voices, and autoplay restrictions.' },
        ],
        links: [{ label: 'Set up QQ Bot', href: '#qqbot' }],
      },
      {
        id: 'manual-actions',
        title: '07 · Bottom action bar',
        summary: 'View the source, discard drafts, and save changes.',
        items: [
          { label: '✨ View source', detail: 'Click to open the plugin GitHub repository in a new tab for source, issues, and release history.' },
          { label: 'Audio history · count', detail: 'The Audio history button in the plugin settings footer opens a compact subpage shared by default and minimal modes, available even when speech is off. Search summaries, filter by source, or expand text. Each recording has playback controls with pause and seeking; storage information sits at the bottom. Downloads do not call MiMo. Deletion requires confirmation; clearing removes all entries, including filtered-out records. Use the back button beside the title to return to settings with unsaved changes preserved. Returning or leaving the page stops replay. This browser retains up to 100 entries / 100 MB; a warning appears when only temporary storage is available.' },
          { label: 'Discard changes', detail: 'Click to drop every unsaved draft and restore the last accepted settings-layer values. It writes no new configuration and is disabled when clean or read-only.' },
          { label: 'Save', detail: 'Click to submit all changed fields and collapse the Console and Sound Effects panels first. Success shows Saved; failure shows an error so you can retry. Save is the persistence boundary for API keys, voice, and sound settings.' },
        ],
      },
      {
        id: 'manual-troubleshooting',
        title: 'Previewing and troubleshooting',
        summary: 'Distinguish the demo, browser speech, and real cloud synthesis before checking the corresponding settings.',
        items: [
          { label: 'What this preview verifies', detail: 'Saving, component states, and cloud synthesis here are simulated with demo audio. They do not check real provider permissions or QQ connectivity. Verify real cloud and QQ delivery in DSH; local browser speech can check this device’s audio permissions.' },
          { label: 'Recognized key format but cloud synthesis fails', detail: 'Recognizing a key format does not verify access. In real DSH, save the key and choose Disable local speech before previewing so fallback cannot hide a cloud error. Doubao also requires the selected model, resource, and voice. Agent Plan uses its dedicated key; Coding Plan does not include speech models.' },
          { label: 'The browser does not autoplay', detail: 'Click Play to check permission, system volume, and the output device, then check Voice playback and autoplay. Browser policy may block page audio. The host sends QQ voice separately; verify it in QQ.' },
          { label: 'Doubao live reading fails', detail: 'The real DSH host must support WebSocket upgrade; reverse proxies must forward Upgrade. Final answer only waits for the turn to end. Stopping speech or switching conversations does not replay old content.' },
        ],
      },
      {
        id: 'manual-preview-tools',
        title: '09 · Navigation and preview controls',
        summary: 'These controls belong to the local preview, not the plugin settings.',
        items: [
          { label: 'Language', detail: 'The top-bar language menu supports Chinese, English, Japanese, and French without resetting configuration. The manual is available in Chinese and English; Japanese and French use the English manual.' },
          { label: 'Theme', detail: 'Use the sun or moon button in the top bar to switch themes without changing settings.' },
          { label: 'Read-only', detail: 'Use Read-only settings at the bottom of the sidebar to inspect a read-only DSH settings layer; turn it off to edit again.' },
          { label: 'Reset state', detail: 'Clears the local Preview draft, turns off read-only, and reloads the settings card for a fresh walkthrough. It does not modify real DSH configuration.' },
        ],
      },
    ],
    notes: [
      { title: 'Persistence boundary', body: 'This page is a preview. All changes, including clicking Save, apply only to local mock data and never affect your DSH settings.' },
      { title: 'Audio permissions', body: 'The browser may block autoplay or local speech. If that happens, click the play button directly and check browser and system audio permissions.' },
    ],
  },
}

export function UserManual({ locale }: { locale: ManualLocale }): ReactElement {
  return <DocumentPage copy={COPY[locale]} />
}
