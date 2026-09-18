import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

export type ManualLocale = 'zh' | 'en'

interface ManualCopy {
  eyebrow: string
  title: string
  intro: string
  toc: string
  sections: Array<{
    id: string
    title: string
    summary: string
    items: Array<{ label: string, detail: string }>
  }>
  notes: Array<{ title: string, body: string }>
}

const COPY: Record<ManualLocale, ManualCopy> = {
  zh: {
    eyebrow: 'USER MANUAL · 设置手册',
    title: '把鲸鱼娘调成你喜欢的样子',
    intro: '左侧是完整操作说明，右侧是真实设置卡片。你可以边读边在右侧试用；Preview 中的修改只存在于本地模拟状态。',
    toc: '目录',
    sections: [
      {
        id: 'manual-start',
        title: '01 · 开始使用',
        summary: '先保存密钥，再试听 MiMo；自动播报和音效按需开启。',
        items: [
          { label: '设置卡片标题按钮', detail: '点击“语音朗读 (Xiaomi MiMo)”标题栏可展开或收起全部设置。标题栏右侧的箭头和 aria 状态会同步变化；有未保存修改时，标题栏会显示“未保存”。' },
          { label: '推荐操作顺序', detail: '依次填写 API Key → 点击底部“保存” → 选择模型和声音 → 在“演播厅”试听 → 按需开启自动播报和音效。除 API Key 外，演播厅会即时使用当前草稿；新密钥必须先保存到 Host 才能用于 MiMo。' },
          { label: '只读状态', detail: '如果顶部勾选“只读”，所有输入、开关、滑块和选择器都会禁用；仍可阅读内容，但不能提交设置。' },
        ],
      },
      {
        id: 'manual-switches',
        title: '02 · 基础开关',
        summary: '三个角色卡片控制插件、自动播放和音效。',
        items: [
          { label: '语音播放', detail: '点击鲸鱼娘卡片或其中的复选框切换总开关。关闭后会隐藏调音台和演播厅，并同时关闭自动播放；正在播放的试听也会停止。再次打开后，语音相关设置会重新出现。' },
          { label: '自动播放', detail: '新安装默认关闭。点击第二张角色卡片切换自动朗读；打开后，助手回复会自动尝试朗读，浏览器仍可能因自动播放策略拒绝。打开它会自动打开“语音播放”，关闭它只关闭自动朗读。' },
          { label: '音效', detail: '新安装默认关闭。点击第三张角色卡片切换音效总开关；开启时会同步打开任务音效和点击音效，关闭时两者也会一起关闭。详细的音效包和试听按钮在下方“音效库”中。' },
        ],
      },
      {
        id: 'manual-api-key',
        title: '03 · API Key',
        summary: '密钥只在点击“保存”时写入 DSH。',
        items: [
          { label: '获取 API Key 链接', detail: '点击 API Key 标题右侧的“获取 API Key”，会在新标签页打开 Xiaomi MiMo 控制台的密钥页面。创建或复制密钥后，回到 Preview。' },
          { label: '密钥输入框', detail: '在密码框中输入新的 Xiaomi MiMo API Key。输入内容会被隐藏；聚焦和移出输入框时，旁边的鲸鱼提示会切换文案。输入后状态提示会即时检查格式，但不会立即保存。' },
          { label: '状态与清除', detail: '提示会区分读取中、未配置、格式已识别、格式异常、Host 状态不可用和待保存。格式识别不等于连接已验证；保存后请用演播厅确认。存在个人密钥覆盖时可点击“清除个人密钥”，保存后移除该覆盖；若基础配置仍有密钥，会恢复继承。' },
        ],
      },
      {
        id: 'manual-console',
        title: '04 · 调音台',
        summary: '控制音量、速度、模型、声音来源和本地兜底策略。',
        items: [
          { label: '调音台标题与箭头', detail: '点击“调音台”标题栏展开或收起详细设置。标题栏摘要会显示当前音量、倍速、朗读范围、模型、声音和策略。右上角的鲸鱼按钮仅在选择 Voice Design 模型时可用。' },
          { label: '音量滑块', detail: '拖动或用键盘方向键调整语音音量；松开鼠标或完成键盘操作时会试听当前音量。旁边的“恢复默认”按钮会把该项恢复为基础配置，恢复动作仍需点击“保存”。' },
          { label: '播放速度滑块', detail: '拖动或用键盘调整 0.5×–2.0× 速度；完成操作时会按当前速度播放提示音。PCM 流式播放会随速度改变音高。' },
          { label: '模型按钮', detail: '在“预设声音 (MiMo-TTS)”和“声音设计 (MiMo-VoiceDesign)”之间点击切换。预设模型显示内置声音选择器；Voice Design 模型显示预设/自定义声音设计输入。' },
          { label: 'Voice Design 选择器与 AI 按钮', detail: '点击声音设计选择器，选择“自定义”或一个预设。选择自定义后可编辑文本框；点击右上角鲸鱼按钮“✨ 使用 AI 生成”会根据当前描述生成声音文案，生成后仍需保存。生成按钮在只读、生成中或预设模型下不可用。' },
          { label: '内置声音 / 浏览器声音选择器', detail: '点击选择器打开列表，再点击一个声音完成选择；也可用方向键、Home、End 浏览，Esc 关闭。浏览器声音会显示语言及在线/离线状态；本地语音策略关闭时，浏览器声音选择器会禁用。' },
          { label: '朗读范围单选项', detail: '点击“智能模式”“完整模式”或“首段模式”之一。智能模式会根据回复长度决定范围；完整模式朗读全文；首段模式只朗读开头。选择后下方说明会同步更新。' },
          { label: '语音策略单选项', detail: '点击“MiMo 优先”“本地优先”或“禁用本地语音”。前两者分别决定 MiMo 与浏览器语音的兜底顺序；禁用本地语音时只使用 MiMo。' },
          { label: '字段“恢复默认”按钮', detail: '带“已覆盖”标记的字段会出现“恢复默认”按钮。点击后只清除该字段的用户覆盖并回到基础值；它不会绕过底部保存，也不会影响其他字段。' },
        ],
      },
      {
        id: 'manual-broadcast',
        title: '05 · 演播厅',
        summary: '用当前草稿试听，并明确显示 MiMo 或浏览器本地语音来源。',
        items: [
          { label: '试听文本框', detail: '点击文本框输入或替换试听内容，最多 100 个字符。文本为空时，鲸鱼按钮会禁用；试听文本本身不会写入 DSH。模型、声音、音量和速度可直接使用草稿，但新 API Key 必须先保存。' },
          { label: '播放 / 停止鲸鱼按钮', detail: '点击“播放试听”生成并播放；准备中或播放中再次点击可中断。气泡会显示正在连接 MiMo 或使用浏览器本地语音，并针对未配置密钥、密钥被拒绝、限流、超时、本地音色不可用和自动播放限制给出对应提示。' },
        ],
      },
      {
        id: 'manual-sounds',
        title: '06 · 音效库',
        summary: '为 DSH 的任务和点击动作选择 UI 音效。',
        items: [
          { label: '音效库标题与鲸鱼按钮', detail: '点击“音效库”标题栏展开或收起内容；点击右侧鲸鱼按钮会按“音效总开关开（任务 / 点击同步开启）→ 音效总开关关（任务 / 点击同步关闭）→ 仅开启点击音效 → 仅开启任务音效”的顺序循环。总开关关闭时隐藏音效库内容，但鲸鱼按钮仍可点击切换；气泡会显示当前状态。' },
          { label: '音效音量滑块', detail: '拖动或用键盘调整音效音量；完成操作时会试听当前音量。音效总开关关闭时音效库内容隐藏，重新开启后保留原来的音量和音效包。' },
          { label: '音效包按钮', detail: '点击一个音效包卡片选择它；再次点击当前卡片会播放一次点击提示音。也可用方向键、Home、End 在 12 个音效包之间移动。当前选项会显示选中状态。' },
          { label: '音效试听按钮', detail: '点击“开始”“完成”“失败”“提醒”或“点击”试听对应声音。每次点击都会播放一次，即使音效库当前折叠也不影响已开始的播放；总开关关闭时这些按钮禁用。' },
          { label: '任务音效 / 点击音效', detail: '顶部“音效”角色卡片只负责总开关：开启总开关会同步开启两者，关闭总开关会同步关闭两者。音效库鲸鱼按钮可以进一步切换为仅开启点击音效或仅开启任务音效；最终状态在点击底部“保存”后写入 DSH。' },
        ],
      },
      {
        id: 'manual-actions',
        title: '07 · 底部操作栏',
        summary: '统一处理更新、卸载、放弃和保存。',
        items: [
          { label: '🎉 新版已发布', detail: '当检测到新版本时显示。点击后在新标签页打开 GitHub Releases；它只是查看发布页，不会自动升级。' },
          { label: '卸载 / 确认 / 取消', detail: '点击“卸载”先进入确认状态；点击“确认”向 DSH 发送卸载请求，点击“取消”返回普通状态。卸载成功后需按提示重启 DSH 才不会再次加载插件。' },
          { label: '✨ 查看源码', detail: '点击后在新标签页打开插件 GitHub 仓库，用于查看源代码、问题和发布记录。' },
          { label: '放弃修改', detail: '点击后丢弃当前所有未保存草稿，恢复到设置层最近一次已接受的值；不会写入新的配置。没有未保存修改或只读时按钮不可用。' },
          { label: '保存', detail: '点击后按字段提交所有修改，并在提交前收起调音台和音效库。成功显示“已保存”；失败显示错误提示，可在修正后重试。保存是 API Key、语音和音效设置真正持久化的边界。' },
        ],
      },
      {
        id: 'manual-preview-tools',
        title: '08 · Preview 工具栏',
        summary: '这些控件只服务于本地预览，不属于插件设置。',
        items: [
          { label: '语言', detail: '选择“中文”或“English”切换手册和右侧真实设置卡片的显示语言；切换后会重置当前本地预览状态。' },
          { label: '主题', detail: '选择“浅色”或“深色”查看两套主题下的布局与控件状态。主题切换不改变设置值。' },
          { label: '只读', detail: '勾选后模拟 DSH 只读设置层，检查禁用态和只读提示；取消勾选即可恢复编辑。' },
          { label: '重置状态', detail: '清空 Preview 的本地草稿、关闭只读并重新载入设置卡片，用于重新开始一次演示；不会改动真实 DSH 配置。' },
        ],
      },
    ],
    notes: [
      { title: '保存边界', body: '右侧控件的即时反馈是为了方便预览；只有底部“保存”完成后，修改才会进入 DSH 设置。' },
      { title: '声音权限', body: '浏览器可能阻止自动播放或本地语音。遇到这种情况，请直接点击播放按钮，并检查浏览器和系统音频权限。' },
    ],
  },
  en: {
    eyebrow: 'USER MANUAL · Settings guide',
    title: 'Tune Whale Maid your way',
    intro: 'The complete guide is on the left and the real settings card is on the right. Try each control as you read; changes in Preview live only in its local mock state.',
    toc: 'Contents',
    sections: [
      {
        id: 'manual-start',
        title: '01 · Getting started',
        summary: 'Save the key before testing MiMo; enable autoplay and sounds only when wanted.',
        items: [
          { label: 'Settings card header', detail: 'Click the “Text To Speech (Xiaomi MiMo)” header to expand or collapse all settings. The arrow and aria state update together; “Unsaved” appears while a draft is dirty.' },
          { label: 'Recommended order', detail: 'Enter an API key → click Save → choose a model and voice → test it in Broadcast Studio → optionally enable automatic playback and sounds. Broadcast Studio uses most drafts immediately, but a new key must be saved to the Host before MiMo can use it.' },
          { label: 'Read-only state', detail: 'Check Read-only in the toolbar to disable inputs, switches, sliders, and pickers. You can still read the guide, but cannot submit settings.' },
        ],
      },
      {
        id: 'manual-switches',
        title: '02 · Basic switches',
        summary: 'Three character cards control the plugin, autoplay, and sounds.',
        items: [
          { label: 'Voice playback', detail: 'Click the Whale Maid card or its checkbox to toggle the main switch. Turning it off hides the console and studio and stops an active preview. Turn it on again to reveal voice settings.' },
          { label: 'Automatic playback', detail: 'New installs start with this off. Click the second character card to toggle automatic reading; the browser may still reject autoplay. Enabling it also enables Voice playback; disabling it only turns off automatic reading.' },
          { label: 'Sound effects', detail: 'New installs start with this off. Click the third character card to toggle the sound master switch. Turning it on synchronizes task and click sounds on; turning it off synchronizes both off. Detailed packs and previews are below.' },
        ],
      },
      {
        id: 'manual-api-key',
        title: '03 · API Key',
        summary: 'The key is written to DSH only when Save is clicked.',
        items: [
          { label: 'Get API Key link', detail: 'Click Get API Key beside the heading to open the Xiaomi MiMo console key page in a new tab. Create or copy a key, then return to Preview.' },
          { label: 'Key input', detail: 'Enter a new Xiaomi MiMo API key in the password field. The value is hidden; focusing and leaving the field changes the Whale Maid message. Format feedback is immediate, but the key is not saved yet.' },
          { label: 'Status and clearing', detail: 'The status distinguishes loading, missing, recognized format, unrecognized format, unavailable Host state, and unsaved changes. A recognized prefix is not a connection check; use Broadcast Studio after saving. When a personal override exists, Clear personal key removes it on Save and falls back to a base key if one exists.' },
        ],
      },
      {
        id: 'manual-console',
        title: '04 · Mixing Console',
        summary: 'Control volume, speed, model, voice source, and local fallback.',
        items: [
          { label: 'Console header and arrow', detail: 'Click Mixing Console to expand or collapse detailed settings. Its summary shows volume, speed, read scope, model, voice, and strategy. The Whale Maid button on the right is available only for Voice Design.' },
          { label: 'Voice volume slider', detail: 'Drag or use arrow keys to change voice volume; releasing the pointer or finishing a keyboard interaction previews that level. Restore default returns this field to its base value, but still requires Save.' },
          { label: 'Playback speed slider', detail: 'Drag or use the keyboard to set 0.5×–2.0× speed; completing the interaction plays a cue at the selected rate. Streamed PCM changes pitch with playback speed.' },
          { label: 'Model buttons', detail: 'Click between Preset voices (MiMo-TTS) and Voice design (MiMo-VoiceDesign). Preset mode shows the built-in voice picker; Voice Design shows preset/custom voice-description controls.' },
          { label: 'Voice Design picker and AI button', detail: 'Open the picker and choose Custom or a preset. Custom enables the editable description. Click the Whale Maid button labelled Generate with AI to generate a description from the current prompt; the result still needs Save. It is disabled when read-only, while generating, or in preset mode.' },
          { label: 'Built-in / browser voice pickers', detail: 'Click a picker to open its list, then click a voice. Arrow keys, Home, End, and Escape also work. Browser voices show language and online/offline status; the browser voice picker is disabled when local speech is disabled.' },
          { label: 'Read-aloud scope radios', detail: 'Click Smart, Full, or First-segment mode. Smart chooses a range based on reply length; Full reads everything; First segment reads only the opening. The hint below updates with the selection.' },
          { label: 'Speech strategy radios', detail: 'Click MiMo first, Local first, or Disable local speech. The first two choose the fallback order; disabling local speech uses MiMo only.' },
          { label: 'Restore default buttons', detail: 'Fields marked Overridden expose Restore default. Clicking it clears that field’s user override and returns to its base value; it does not bypass Save or affect other fields.' },
        ],
      },
      {
        id: 'manual-broadcast',
        title: '05 · Broadcast Studio',
        summary: 'Preview the current draft and see whether MiMo or browser-local speech is used.',
        items: [
          { label: 'Preview text field', detail: 'Click and replace the preview text, up to 100 characters. An empty field disables the Whale button. Model, voice, volume, and speed drafts apply immediately, but a new API key must be saved first.' },
          { label: 'Play / stop Whale button', detail: 'Click Play preview to generate and play; click again while preparing or playing to stop. The bubble identifies MiMo or browser-local speech and distinguishes missing or rejected keys, rate limits, timeouts, unavailable local voices, and autoplay restrictions.' },
        ],
      },
      {
        id: 'manual-sounds',
        title: '06 · Sound Effects',
        summary: 'Choose UI sounds for DSH tasks and clicks.',
        items: [
          { label: 'Sound Effects header and Whale button', detail: 'Click the Sound Effects header to expand or collapse its content. Click the Whale button on the right to cycle through master on (task / click synced on) → master off (task / click synced off) → click sounds only → task sounds only. When the master switch is off, the library content is hidden but the Whale button remains available; its bubble shows the current state.' },
          { label: 'Sound volume slider', detail: 'Drag or use arrow keys to change sound volume; finishing the interaction previews the level. The library content is hidden while the master switch is off; the volume and pack are preserved when sounds are enabled again.' },
          { label: 'Sound pack buttons', detail: 'Click a pack card to select it; clicking the current card again plays a click cue. Arrow keys, Home, and End move through all 12 packs. The selected card exposes its checked state.' },
          { label: 'Sound preview buttons', detail: 'Click Start, Complete, Error, Notification, or Press to preview that cue once. The sound switch disables these buttons when off.' },
          { label: 'Task / click sounds', detail: 'The Sound Effects character card controls the master switch: enabling it synchronizes both capabilities on, and disabling it synchronizes both off. The Whale button can then select click-only or task-only mode. The final state is persisted in DSH only after Save.' },
        ],
      },
      {
        id: 'manual-actions',
        title: '07 · Bottom action bar',
        summary: 'Handle updates, uninstall, discard, and save in one place.',
        items: [
          { label: '🎉 New release', detail: 'Appears when an update is detected. Click it to open GitHub Releases in a new tab; it only opens the release page and does not upgrade automatically.' },
          { label: 'Uninstall / Confirm / Cancel', detail: 'Click Uninstall to enter confirmation. Confirm sends an uninstall request to DSH; Cancel returns to the normal state. Restart DSH as prompted so the plugin is not loaded again.' },
          { label: '✨ View source', detail: 'Click to open the plugin GitHub repository in a new tab for source, issues, and release history.' },
          { label: 'Discard changes', detail: 'Click to drop every unsaved draft and restore the last accepted settings-layer values. It writes no new configuration and is disabled when clean or read-only.' },
          { label: 'Save', detail: 'Click to submit all changed fields and collapse the Console and Sound Effects panels first. Success shows Saved; failure shows an error so you can retry. Save is the persistence boundary for API keys, voice, and sound settings.' },
        ],
      },
      {
        id: 'manual-preview-tools',
        title: '08 · Preview toolbar',
        summary: 'These controls belong to the local preview, not the plugin settings.',
        items: [
          { label: 'Language', detail: 'Choose 中文 or English to switch the guide and the real settings card. Switching language resets the local preview state.' },
          { label: 'Theme', detail: 'Choose Light or Dark to inspect both themes. Theme changes do not change setting values.' },
          { label: 'Read-only', detail: 'Check it to simulate a read-only DSH settings layer and inspect disabled states; uncheck it to edit again.' },
          { label: 'Reset state', detail: 'Clears the local Preview draft, turns off read-only, and reloads the settings card for a fresh walkthrough. It does not modify real DSH configuration.' },
        ],
      },
    ],
    notes: [
      { title: 'Persistence boundary', body: 'The right-side controls provide immediate feedback for previewing; changes enter DSH only after the bottom Save action completes.' },
      { title: 'Audio permissions', body: 'The browser may block autoplay or local speech. If that happens, click the play button directly and check browser and system audio permissions.' },
    ],
  },
}

export function UserManual({ locale }: { locale: ManualLocale }): ReactElement {
  const copy = COPY[locale]
  const manualRef = useRef<HTMLElement | null>(null)
  const [activeSection, setActiveSection] = useState(copy.sections[0]?.id ?? '')

  useEffect(() => {
    setActiveSection(copy.sections[0]?.id ?? '')
    const root = manualRef.current
    if (root === null || typeof IntersectionObserver === 'undefined') return
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.preview-manual-section'))
    if (sections.length === 0) return
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)
      const section = visible[0]?.target
      if (section instanceof HTMLElement) setActiveSection(section.id)
    }, { root, rootMargin: '-12% 0px -70% 0px', threshold: 0 })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [copy.sections])

  return <aside className="preview-manual" ref={manualRef} aria-label={copy.title}>
    <div className="preview-manual-intro">
      <span className="preview-manual-eyebrow">{copy.eyebrow}</span>
      <h1>{copy.title}</h1>
      <p>{copy.intro}</p>
    </div>
    <nav className="preview-manual-toc" aria-label={copy.toc}>
      <span>{copy.toc}</span>
      <div>
        {copy.sections.map((section) => <a
          className={activeSection === section.id ? 'preview-manual-toc-link-active' : undefined}
          key={section.id}
          href={`#${section.id}`}
          aria-current={activeSection === section.id ? 'location' : undefined}
        >{section.title}</a>)}
      </div>
    </nav>
    <div className="preview-manual-sections">
      {copy.sections.map((section) => <section className="preview-manual-section" id={section.id} key={section.id}>
        <h2>{section.title}</h2>
        <p className="preview-manual-summary">{section.summary}</p>
        <dl>
          {section.items.map((item) => <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.detail}</dd>
          </div>)}
        </dl>
      </section>)}
    </div>
    <div className="preview-manual-notes">
      {copy.notes.map((note) => <div className="preview-manual-note" key={note.title}>
        <strong>{note.title}</strong>
        <p>{note.body}</p>
      </div>)}
    </div>
  </aside>
}
