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
        summary: '先完成密钥，再打开语音播放。',
        items: [
          { label: '设置卡片标题按钮', detail: '点击“语音朗读 (Xiaomi MiMo)”标题栏可展开或收起全部设置。标题栏右侧的箭头和 aria 状态会同步变化；有未保存修改时，标题栏会显示“未保存”。' },
          { label: '推荐操作顺序', detail: '依次填写 API Key → 打开“语音播放” → 选择模型和声音 → 在“演播厅”输入试听文本 → 点击底部“保存”。没有点击“保存”前，右侧的改动都只是预览。' },
          { label: '只读状态', detail: '如果顶部勾选“只读”，所有输入、开关、滑块和选择器都会禁用；仍可阅读内容，但不能提交设置。' },
        ],
      },
      {
        id: 'manual-switches',
        title: '02 · 基础开关',
        summary: '三个角色卡片控制插件、自动播放和音效。',
        items: [
          { label: '语音播放', detail: '点击鲸鱼娘卡片或其中的复选框切换总开关。关闭后会隐藏调音台和演播厅，并同时关闭自动播放；正在播放的试听也会停止。再次打开后，语音相关设置会重新出现。' },
          { label: '自动播放', detail: '点击第二张角色卡片切换自动朗读。打开后，助手回复会自动尝试朗读；浏览器可能因自动播放策略拒绝播放。打开它会自动打开“语音播放”，关闭它只关闭自动朗读。' },
          { label: '音效', detail: '点击第三张角色卡片切换 UI 音效。开启时会同步打开任务音效和点击音效；关闭时两者也会一起关闭。详细的音效包和试听按钮在下方“音效库”中。' },
        ],
      },
      {
        id: 'manual-api-key',
        title: '03 · API Key',
        summary: '密钥只在点击“保存”时写入 DSH。',
        items: [
          { label: '获取 API Key 链接', detail: '点击 API Key 标题右侧的“获取 API Key”，会在新标签页打开 Xiaomi MiMo 控制台的密钥页面。创建或复制密钥后，回到 Preview。' },
          { label: '密钥输入框', detail: '在密码框中输入新的 Xiaomi MiMo API Key。输入内容会被隐藏；聚焦和移出输入框时，旁边的鲸鱼提示会切换文案。输入后状态提示会即时检查格式，但不会立即保存。' },
          { label: '已配置 / 警告', detail: '“已配置”表示当前设置层已有密钥；格式不支持或尚未配置时会显示提示。确认密钥正确后，点击底部“保存”才会替换已有值。' },
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
        summary: '用当前草稿设置立即试听一小段文本。',
        items: [
          { label: '试听文本框', detail: '点击文本框输入或替换试听内容，最多 100 个字符。文本为空时，鲸鱼按钮会禁用；试听文本本身不会随设置自动写入 DSH。' },
          { label: '播放 / 停止鲸鱼按钮', detail: '点击“播放试听”按当前模型、声音、音量和速度生成并播放；准备中或播放中再次点击会变成“停止试听”，用于中断本次试听。试听失败时，气泡会提示检查设置。' },
        ],
      },
      {
        id: 'manual-sounds',
        title: '06 · 音效库',
        summary: '为 DSH 的任务和点击动作选择 UI 音效。',
        items: [
          { label: '音效库标题与鲸鱼按钮', detail: '点击“音效库”标题栏展开或收起内容；点击右侧鲸鱼按钮直接开启/关闭音效。关闭音效会禁用音效包和试听按钮，但设置会保留，重新开启即可继续使用。' },
          { label: '音效音量滑块', detail: '拖动或用键盘调整音效音量；完成操作时会试听当前音量。音效总开关关闭时滑块不可操作。' },
          { label: '音效包按钮', detail: '点击一个音效包卡片选择它；再次点击当前卡片会播放一次点击提示音。也可用方向键、Home、End 在 12 个音效包之间移动。当前选项会显示选中状态。' },
          { label: '音效试听按钮', detail: '点击“开始”“完成”“失败”“提醒”或“点击”试听对应声音。每次点击都会播放一次，即使音效库当前折叠也不影响已开始的播放；总开关关闭时这些按钮禁用。' },
          { label: '任务音效 / 点击音效', detail: '这两个能力由顶部“音效”角色卡片一起控制。开启总开关会同步开启，关闭总开关会同步关闭；最终状态在点击底部“保存”后写入 DSH。' },
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
        summary: 'Set the key first, then turn voice playback on.',
        items: [
          { label: 'Settings card header', detail: 'Click the “Text To Speech (Xiaomi MiMo)” header to expand or collapse all settings. The arrow and aria state update together; “Unsaved” appears while a draft is dirty.' },
          { label: 'Recommended order', detail: 'Enter an API key → enable Voice playback → choose a model and voice → enter preview text in Broadcast Studio → click Save. Until Save is clicked, changes are only a local preview.' },
          { label: 'Read-only state', detail: 'Check Read-only in the toolbar to disable inputs, switches, sliders, and pickers. You can still read the guide, but cannot submit settings.' },
        ],
      },
      {
        id: 'manual-switches',
        title: '02 · Basic switches',
        summary: 'Three character cards control the plugin, autoplay, and sounds.',
        items: [
          { label: 'Voice playback', detail: 'Click the Whale Maid card or its checkbox to toggle the main switch. Turning it off hides the console and studio and stops an active preview. Turn it on again to reveal voice settings.' },
          { label: 'Automatic playback', detail: 'Click the second character card to toggle automatic reading. The browser may reject autoplay. Enabling it also enables Voice playback; disabling it only turns off automatic reading.' },
          { label: 'Sound effects', detail: 'Click the third character card to toggle UI sounds. Turning it on synchronizes task and click sounds on; turning it off synchronizes both off. Detailed packs and previews are in Sound Effects below.' },
        ],
      },
      {
        id: 'manual-api-key',
        title: '03 · API Key',
        summary: 'The key is written to DSH only when Save is clicked.',
        items: [
          { label: 'Get API Key link', detail: 'Click Get API Key beside the heading to open the Xiaomi MiMo console key page in a new tab. Create or copy a key, then return to Preview.' },
          { label: 'Key input', detail: 'Enter a new Xiaomi MiMo API key in the password field. The value is hidden; focusing and leaving the field changes the Whale Maid message. Format feedback is immediate, but the key is not saved yet.' },
          { label: 'Configured / warning state', detail: 'Configured means the current settings layer already has a key. Unsupported or missing keys show a warning. Confirm the value, then click Save to replace an existing key.' },
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
        summary: 'Preview a short passage with the current draft settings.',
        items: [
          { label: 'Preview text field', detail: 'Click and replace the preview text, up to 100 characters. An empty field disables the Whale button; preview text itself is not written to DSH settings.' },
          { label: 'Play / stop Whale button', detail: 'Click Play preview to generate and play using the current model, voice, volume, and speed. Click again while preparing or playing to stop. A failure message asks you to check the settings.' },
        ],
      },
      {
        id: 'manual-sounds',
        title: '06 · Sound Effects',
        summary: 'Choose UI sounds for DSH tasks and clicks.',
        items: [
          { label: 'Sound Effects header and Whale button', detail: 'Click the Sound Effects header to expand or collapse its content. Click the Whale button on the right to turn sounds on or off. When off, pack and preview controls are disabled but their values remain.' },
          { label: 'Sound volume slider', detail: 'Drag or use arrow keys to change sound volume; finishing the interaction previews the level. The slider is disabled while the sound switch is off.' },
          { label: 'Sound pack buttons', detail: 'Click a pack card to select it; clicking the current card again plays a click cue. Arrow keys, Home, and End move through all 12 packs. The selected card exposes its checked state.' },
          { label: 'Sound preview buttons', detail: 'Click Start, Complete, Error, Notification, or Press to preview that cue once. The sound switch disables these buttons when off.' },
          { label: 'Task / click sounds', detail: 'These capabilities are controlled together by the Sound Effects character card. The synchronized state is persisted in DSH only after Save.' },
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
  const tocSentinelRef = useRef<HTMLSpanElement | null>(null)
  const [tocStuck, setTocStuck] = useState(false)
  const [activeSection, setActiveSection] = useState(copy.sections[0]?.id ?? '')

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1081px)')
    let observer: IntersectionObserver | undefined
    const observe = (): void => {
      observer?.disconnect()
      observer = undefined
      if (!media.matches || manualRef.current === null || tocSentinelRef.current === null || typeof IntersectionObserver === 'undefined') {
        setTocStuck(false)
        return
      }
      observer = new IntersectionObserver(([entry]) => {
        setTocStuck(entry?.isIntersecting !== true)
      }, { root: manualRef.current, rootMargin: '-14px 0px 0px 0px', threshold: 0 })
      observer.observe(tocSentinelRef.current)
    }
    observe()
    media.addEventListener('change', observe)
    return () => {
      observer?.disconnect()
      media.removeEventListener('change', observe)
    }
  }, [])

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
    <span className="preview-manual-toc-sentinel" ref={tocSentinelRef} aria-hidden="true" />
    <nav className={tocStuck ? 'preview-manual-toc preview-manual-toc-stuck' : 'preview-manual-toc'} aria-label={copy.toc}>
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
