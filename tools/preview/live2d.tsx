import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Player } from '@livliv-dev/player'
import { startLipSync } from '@livliv-dev/player/voice'
import { startFaceTracking } from '@livliv-dev/player/tracking'
import type { FaceTracking } from '@livliv-dev/player/tracking'
import type { LipSync } from '@livliv-dev/player/voice'
import type { PreviewLocale } from './preview-copy.js'

const copy = {
  zh: { title: 'Live2D 设置', description: '选择角色并调整预览中的显示。', canvas: '角色画布，点击切换表情', show: '显示角色', character: '角色', size: '大小', position: '位置', left: '左下', center: '底部居中', right: '右下', clickHint: '点击角色随机切换表情，5 秒后恢复。摄像头和麦克风仅在本页开启，离开时关闭。', camera: '摄像头', microphone: '麦克风', calibrate: '校准面部', neutral: '自然', nod: '点头', tilt: '歪头', shake: '摇头', hop: '跳跃', shy: '害羞', unsupported: '浏览器不支持 WebGL2。', loadError: '角色加载失败，请检查网络后重新打开页面。', deviceError: '设备启动失败，请检查权限、网络和设备。', source: '角色来源与署名' },
  en: { title: 'Live2D settings', description: 'Choose a character and adjust its placement in the preview.', canvas: 'Character canvas, click to change expression', show: 'Show character', character: 'Character', size: 'Size', position: 'Position', left: 'Bottom left', center: 'Bottom center', right: 'Bottom right', clickHint: 'Click the character for a random expression; it resets after 5 seconds. Camera and microphone stop when you leave this page.', camera: 'Camera', microphone: 'Microphone', calibrate: 'Calibrate face', neutral: 'Neutral', nod: 'Nod', tilt: 'Tilt', shake: 'Shake', hop: 'Hop', shy: 'Shy', unsupported: 'This browser does not support WebGL2.', loadError: 'Character loading failed. Check your connection and reopen the page.', deviceError: 'Could not start the device. Check permissions, connection, and device.', source: 'Character source and credits' },
} as const
type CopyKey = keyof typeof copy.en
type Translate = (key: `live2d.${CopyKey}`) => string
const translate = (locale: PreviewLocale): Translate => key => copy[locale === 'zh' ? 'zh' : 'en'][key.slice(7) as CopyKey]

type Character = 'p01' | 'p02'
type Settings = { character: Character; size: number; position: number; visible: boolean }
const STORAGE_KEY = 'dsh-xiaomi-tts.live2d.v1'
const DEFAULTS: Settings = { character: 'p01', size: 220, position: 100, visible: true }
const modelUrl = (id: Character): string => `https://livliv-dev.github.io/player/characters/${id}.livliv`

function readSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<Settings>
    return { character: value.character === 'p02' ? 'p02' : 'p01',
      size: typeof value.size === 'number' && Number.isFinite(value.size) ? Math.max(120, Math.min(360, value.size)) : DEFAULTS.size,
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

function CharacterCanvas({ character, t, controlsTarget }: { character: Character; t: Translate; controlsTarget?: HTMLElement | null }) {
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
    setReady(false); setCameraOn(false); setMicrophoneOn(false); setBusy(false); setError(''); setExpressions([])
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
  }, [character, t])

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
  return <>
    <canvas ref={canvas} className="xmimo-live2d-canvas" aria-label={t('live2d.canvas')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); canvas.current?.click() } }} tabIndex={0} />
    {error ? <p role="status">{error}</p> : null}
    {controlsTarget ? createPortal(<div className="xmimo-live2d-actions">
      <button type="button" disabled={!ready || busy} aria-pressed={cameraOn} onClick={() => { void toggleDevice('camera') }}>{t('live2d.camera')} {cameraOn ? '●' : '○'}</button>
      <button type="button" disabled={!ready || busy} aria-pressed={microphoneOn} onClick={() => { void toggleDevice('microphone') }}>{t('live2d.microphone')} {microphoneOn ? '●' : '○'}</button>
      <button type="button" disabled={!cameraOn} onClick={() => camera.current?.calibrate()}>{t('live2d.calibrate')}</button>
      <button type="button" disabled={!ready} onClick={() => player.current?.setExpression(null)}>{t('live2d.neutral')}</button>
      {expressions.map(expression => <button type="button" key={expression.id} onClick={() => player.current?.setExpression(expression.id)}>{expression.label}</button>)}
      {(['nod', 'tilt', 'shake', 'hop', 'shy'] as const).map(action => <button type="button" disabled={!ready} key={action} onClick={() => player.current?.act(action)}>{t(`live2d.${action}`)}</button>)}
    </div>, controlsTarget) : null}
  </>
}

export function Live2dWidget({ locale }: { locale: PreviewLocale }) {
  const [settings] = useCharacterSettings()
  const t = useMemo(() => translate(locale), [locale])
  if (!settings.visible) return null
  return <div className="preview-live2d-widget" style={{ justifyContent: settings.position < 34 ? 'flex-start' : settings.position > 66 ? 'flex-end' : 'center' }}>
    <div style={{ width: settings.size, maxWidth: '60vw' }}><CharacterCanvas character={settings.character} t={t} /></div>
  </div>
}

export function Live2dSettingsPage({ locale }: { locale: PreviewLocale }) {
  const [settings, update] = useCharacterSettings()
  const [controlsTarget, setControlsTarget] = useState<HTMLDivElement | null>(null)
  const t = useMemo(() => translate(locale), [locale])
  return <section className="xmimo-ui-scope xmimo-tts-settings-page" aria-label={t('live2d.title')}>
    <div className="xmimo-tts-settings-page-content xmimo-live2d-settings">
      <div ref={setControlsTarget} />
      <label><input type="checkbox" checked={settings.visible} onChange={e => update({ visible: e.target.checked })} /> {t('live2d.show')}</label>
      <label>{t('live2d.character')} <select value={settings.character} onChange={e => update({ character: e.target.value as Character })}><option value="p01">Kujira</option><option value="p02">Kujira Q</option></select></label>
      <label>{t('live2d.size')} <input type="range" min="120" max="360" value={settings.size} onChange={e => update({ size: Number(e.target.value) })} /> {settings.size}px</label>
      <label>{t('live2d.position')} <select value={settings.position} onChange={e => update({ position: Number(e.target.value) })}><option value="0">{t('live2d.left')}</option><option value="50">{t('live2d.center')}</option><option value="100">{t('live2d.right')}</option></select></label>
      <p>{t('live2d.clickHint')}</p>
      <p>Kujira / Kujira Q: 上善无形, ZipZipPipe · <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noreferrer">CC BY-NC-SA 4.0</a> · AI model: LivLiv</p>
      <p><a href="https://github.com/livliv-dev/player/blob/main/characters/CREDITS.md" target="_blank" rel="noreferrer">{t('live2d.source')}</a></p>
    </div>
    {settings.visible ? <div className="preview-live2d-widget" style={{ justifyContent: settings.position < 34 ? 'flex-start' : settings.position > 66 ? 'flex-end' : 'center' }}>
      <div style={{ width: settings.size, maxWidth: '60vw' }}><CharacterCanvas key={settings.character} character={settings.character} t={t} controlsTarget={controlsTarget} /></div>
    </div> : null}
  </section>
}
