import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { Player } from '@livliv-dev/player'
import { startLipSync } from '@livliv-dev/player/voice'
import { startFaceTracking } from '@livliv-dev/player/tracking'
import type { FaceTracking } from '@livliv-dev/player/tracking'
import type { LipSync } from '@livliv-dev/player/voice'
import type { PreviewLocale } from './preview-copy.js'
import './live2d.css'

const copy = {
  zh: {
    title: 'Live2D 设置',
    display: '角色显示', show: '显示角色', character: '角色', size: '大小', position: '位置',
    left: '左下', center: '底部居中', right: '右下',
    preview: '实时预览', canvas: '切换角色表情', loading: '正在加载角色…', hidden: '角色已隐藏。',
    clickHint: '点击角色随机切换表情，5 秒后恢复。',
    performance: '表情与动作', expressions: '表情', motions: '动作',
    neutral: '自然', nod: '点头', tilt: '歪头', shake: '摇头', hop: '跳跃', shy: '害羞',
    devices: '设备', camera: '摄像头', microphone: '麦克风', calibrate: '校准面部',
    deviceHint: '摄像头和麦克风仅在本页运行，离开时自动关闭。',
    unsupported: '浏览器不支持 WebGL2。', loadError: '角色加载失败，请检查网络后重新打开页面。',
    deviceError: '设备启动失败，请检查权限、网络和设备。', source: '角色来源与署名',
  },
  en: {
    title: 'Live2D settings',
    display: 'Character display', show: 'Show character', character: 'Character', size: 'Size', position: 'Position',
    left: 'Bottom left', center: 'Bottom center', right: 'Bottom right',
    preview: 'Live preview', canvas: 'Change character expression', loading: 'Loading character…', hidden: 'The character is hidden.',
    clickHint: 'Click the character for a random expression. It resets after 5 seconds.',
    performance: 'Expressions and motions', expressions: 'Expressions', motions: 'Motions',
    neutral: 'Neutral', nod: 'Nod', tilt: 'Tilt', shake: 'Shake', hop: 'Hop', shy: 'Shy',
    devices: 'Devices', camera: 'Camera', microphone: 'Microphone', calibrate: 'Calibrate face',
    deviceHint: 'The camera and microphone stop when you leave this page.',
    unsupported: 'This browser does not support WebGL2.', loadError: 'Character loading failed. Check your connection and reopen the page.',
    deviceError: 'Could not start the device. Check permissions, connection, and device.', source: 'Character source and credits',
  },
} as const
type CopyKey = keyof typeof copy.en
type Translate = (key: `live2d.${CopyKey}`) => string
const translate = (locale: PreviewLocale): Translate => key => copy[locale === 'zh' ? 'zh' : 'en'][key.slice(7) as CopyKey]

type Character = 'p01' | 'p02'
type Settings = { character: Character; size: number; position: number; visible: boolean }
const STORAGE_KEY = 'dsh-xiaomi-tts.live2d.v1'
const MIN_CHARACTER_SIZE = 120
const MAX_CHARACTER_SIZE = 360
const DEFAULTS: Settings = { character: 'p01', size: 220, position: 100, visible: true }
const MOTIONS = ['nod', 'tilt', 'shake', 'hop', 'shy'] as const
const modelUrl = (id: Character): string => `https://livliv-dev.github.io/player/characters/${id}.livliv`

function characterAlignment(position: number): 'flex-start' | 'center' | 'flex-end' {
  return position < 34 ? 'flex-start' : position > 66 ? 'flex-end' : 'center'
}

function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Settings>
    return { character: value.character === 'p02' ? 'p02' : 'p01',
      size: typeof value.size === 'number' && Number.isFinite(value.size) ? Math.max(MIN_CHARACTER_SIZE, Math.min(MAX_CHARACTER_SIZE, value.size)) : DEFAULTS.size,
      position: typeof value.position === 'number' && Number.isFinite(value.position) ? Math.max(0, Math.min(100, value.position)) : DEFAULTS.position,
      visible: typeof value.visible === 'boolean' ? value.visible : DEFAULTS.visible }
  } catch { return DEFAULTS }
}

function useCharacterSettings(): [Settings, (change: Partial<Settings>) => void] {
  const [settings, setSettings] = useState(readSettings)
  useEffect(() => {
    const refresh = (event: Event): void => setSettings(event instanceof CustomEvent && event.detail ? event.detail as Settings : readSettings())
    window.addEventListener('live2d-settings', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('live2d-settings', refresh); window.removeEventListener('storage', refresh) }
  }, [])
  const update = (change: Partial<Settings>): void => {
    const next = { ...settings, ...change }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* storage is optional */ }
    setSettings(next)
    window.dispatchEvent(new CustomEvent('live2d-settings', { detail: next }))
  }
  return [settings, update]
}

function CharacterPlayer({ settings, t, inSettings = false }: { settings: Settings; t: Translate; inSettings?: boolean }) {
  const { character, visible, size, position } = settings
  const id = useId()
  const canvas = useRef<HTMLCanvasElement>(null)
  const player = useRef<Player | null>(null)
  const camera = useRef<FaceTracking | null>(null)
  const microphone = useRef<LipSync | null>(null)
  const generation = useRef(0)
  const [ready, setReady] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [microphoneOn, setMicrophoneOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [expressions, setExpressions] = useState<Array<{ id: string; label: string }>>([])
  useEffect(() => {
    setReady(false)
    setCameraOn(false)
    setMicrophoneOn(false)
    setBusy(false)
    setError('')
    setExpressions([])
    if (!visible) return
    const node = canvas.current
    if (!node || !Player.isSupported()) { setError(t('live2d.unsupported')); return }
    const current = new Player(node, { maxPixelRatio: 1.5 })
    player.current = current
    const session = ++generation.current
    let timer: ReturnType<typeof setTimeout> | undefined
    const click = (): void => {
      const expressions = current.expressions
      if (!expressions.length) return
      current.setExpression(expressions[Math.floor(Math.random() * expressions.length)].id)
      clearTimeout(timer)
      timer = setTimeout(() => current.setExpression(null), 5000)
    }
    node.addEventListener('click', click)
    void current.load(modelUrl(character)).then(model => { if (generation.current === session) { setExpressions(model.expressions); setReady(true) } }).catch(err => {
      if (generation.current === session && err.name !== 'AbortError') setError(t('live2d.loadError'))
    })
    return () => {
      generation.current++
      clearTimeout(timer); node.removeEventListener('click', click)
      camera.current?.stop(); microphone.current?.stop(); camera.current = null; microphone.current = null
      player.current = null; current.dispose({ release: true })
    }
  }, [character, t, visible])

  const toggleDevice = async (kind: 'camera' | 'microphone'): Promise<void> => {
    const current = player.current
    if (!current || busy) return
    const active = kind === 'camera' ? camera.current : microphone.current
    if (active) {
      active.stop()
      if (kind === 'camera') { camera.current = null; setCameraOn(false) } else { microphone.current = null; setMicrophoneOn(false) }
      return
    }
    const session = generation.current
    setBusy(true); setError('')
    try {
      const device = kind === 'camera' ? await startFaceTracking(current) : await startLipSync(current)
      if (session !== generation.current) { device.stop(); return }
      if (kind === 'camera') { camera.current = device as FaceTracking; setCameraOn(true) } else { microphone.current = device as LipSync; setMicrophoneOn(true) }
    } catch { if (session === generation.current) setError(t('live2d.deviceError')) }
    finally { if (session === generation.current) setBusy(false) }
  }
  const canInteract = visible && ready
  const canvasElement = <canvas ref={canvas} className="xmimo-live2d-canvas" role="button"
    aria-label={t('live2d.canvas')} aria-hidden={!canInteract} tabIndex={canInteract ? 0 : -1}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        canvas.current?.click()
      }
    }} />

  if (!inSettings) return <>{canvasElement}{error ? <p role="status">{error}</p> : null}</>

  const previewStatus = !visible ? t('live2d.hidden') : ready ? '' : error || t('live2d.loading')
  return <div className="xmimo-live2d-workspace">
    <section className="xmimo-live2d-preview" aria-labelledby={`${id}-preview`}>
      <h2 id={`${id}-preview`}>{t('live2d.preview')}</h2>
      <div className="xmimo-live2d-stage" style={{ justifyContent: characterAlignment(position) }}>
        {visible ? <div className="xmimo-live2d-stage-character" style={{ '--xmimo-live2d-size-scale': size / MAX_CHARACTER_SIZE } as CSSProperties}>
          {canvasElement}
        </div> : null}
        <p className="xmimo-live2d-stage-status" role="status">{previewStatus}</p>
      </div>
      <p className="xmimo-live2d-note">{t('live2d.clickHint')}</p>
    </section>
    <div className="xmimo-live2d-tools">
      <section aria-labelledby={`${id}-performance`}>
        <h2 id={`${id}-performance`}>{t('live2d.performance')}</h2>
        <fieldset>
          <legend>{t('live2d.expressions')}</legend>
          <div className="xmimo-live2d-actions">
            <button type="button" disabled={!canInteract} onClick={() => player.current?.setExpression(null)}>{t('live2d.neutral')}</button>
            {expressions.map(expression => <button type="button" disabled={!canInteract} key={expression.id}
              onClick={() => player.current?.setExpression(expression.id)}>{expression.label}</button>)}
          </div>
        </fieldset>
        <fieldset>
          <legend>{t('live2d.motions')}</legend>
          <div className="xmimo-live2d-actions">
            {MOTIONS.map(action => <button type="button" disabled={!canInteract} key={action}
              onClick={() => player.current?.act(action)}>{t(`live2d.${action}`)}</button>)}
          </div>
        </fieldset>
      </section>
      <section className="xmimo-live2d-devices" aria-labelledby={`${id}-devices`}>
        <h2 id={`${id}-devices`}>{t('live2d.devices')}</h2>
        <div className="xmimo-live2d-actions">
          <button type="button" disabled={!canInteract || busy} aria-pressed={canInteract && cameraOn} onClick={() => { void toggleDevice('camera') }}>
            {t('live2d.camera')}<span className="xmimo-live2d-device-indicator" aria-hidden="true" />
          </button>
          <button type="button" disabled={!canInteract || busy} aria-pressed={canInteract && microphoneOn} onClick={() => { void toggleDevice('microphone') }}>
            {t('live2d.microphone')}<span className="xmimo-live2d-device-indicator" aria-hidden="true" />
          </button>
          <button type="button" disabled={!canInteract || !cameraOn} onClick={() => camera.current?.calibrate()}>{t('live2d.calibrate')}</button>
        </div>
        <div>
          <p className="xmimo-live2d-note">{t('live2d.deviceHint')}</p>
          <p className="xmimo-live2d-note xmimo-live2d-device-status" role="status">{canInteract ? error : ''}</p>
        </div>
      </section>
    </div>
  </div>
}

export function Live2dWidget({ locale }: { locale: PreviewLocale }) {
  const [settings] = useCharacterSettings()
  const t = useMemo(() => translate(locale), [locale])
  if (!settings.visible) return null
  return <div className="preview-live2d-widget" style={{ justifyContent: characterAlignment(settings.position) }}>
    <div style={{ width: settings.size, maxWidth: '60vw' }}><CharacterPlayer settings={settings} t={t} /></div>
  </div>
}

export function Live2dSettingsPage({ locale }: { locale: PreviewLocale }) {
  const [settings, update] = useCharacterSettings()
  const t = useMemo(() => translate(locale), [locale])
  const id = useId()
  const sizeLabel = `${settings.size} px`
  return <section className="xmimo-live2d-settings" aria-label={t('live2d.title')}>
    <section className="xmimo-live2d-display" aria-labelledby={`${id}-display`}>
      <div className="xmimo-live2d-display-heading">
        <h2 id={`${id}-display`}>{t('live2d.display')}</h2>
        <label className="xmimo-live2d-visibility">
          <span>{t('live2d.show')}</span>
          <Switch checked={settings.visible} label={t('live2d.show')} onChange={visible => update({ visible })} />
        </label>
      </div>
      <div className="xmimo-live2d-fields">
        <label className="xmimo-live2d-field">
          <span>{t('live2d.character')}</span>
          <select value={settings.character} onChange={event => update({ character: event.target.value as Character })}>
            <option value="p01">Kujira</option>
            <option value="p02">Kujira Q</option>
          </select>
        </label>
        <label className="xmimo-live2d-field">
          <span>{t('live2d.position')}</span>
          <select value={settings.position} onChange={event => update({ position: Number(event.target.value) })}>
            <option value="0">{t('live2d.left')}</option>
            <option value="50">{t('live2d.center')}</option>
            <option value="100">{t('live2d.right')}</option>
          </select>
        </label>
        <div className="xmimo-live2d-field xmimo-live2d-size">
          <div className="xmimo-live2d-size-heading">
            <label htmlFor={`${id}-size`}>{t('live2d.size')}</label>
            <span aria-hidden="true">{sizeLabel}</span>
          </div>
          <input id={`${id}-size`} type="range" min={MIN_CHARACTER_SIZE} max={MAX_CHARACTER_SIZE} value={settings.size}
            aria-valuetext={sizeLabel} onChange={event => update({ size: Number(event.target.value) })} />
        </div>
      </div>
    </section>
    <CharacterPlayer key={settings.character} settings={settings} t={t} inSettings />
    <footer className="xmimo-live2d-credits">
      <p>Kujira / Kujira Q: 上善无形, ZipZipPipe · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a> · AI model: LivLiv</p>
      <a href="https://github.com/livliv-dev/player/blob/main/characters/CREDITS.md" target="_blank" rel="noreferrer">{t('live2d.source')}</a>
    </footer>
  </section>
}
