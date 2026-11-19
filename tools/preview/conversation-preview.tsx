import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { resolveTtsSettings } from '../../src/shared.js'
import type { PreviewSettingsScope } from './mock-settings.js'
import { ReadingCaptionLines } from '../../src/client/conversation/reading-caption-bar.js'
import { CaptionVisual, CaptionVisualPicker } from '../../src/client/conversation/caption-visual.js'
import type { OrbState } from '../../src/client/conversation/voiceorbs/lib/orb-state.js'
import { AnimatedAudioLines } from '../../src/client/conversation/animated-audio-lines.js'
import type { SoundEffectsController } from '../../src/client/sound-effects/types.js'
import { CopyIcon, DatabaseIcon, ShareIcon, ThumbsDownIcon, ThumbsUpIcon } from './action-icons.js'
import { RiVoiceAiFill } from 'react-icons/ri'

const USER_TEXT = '你好，今天心情怎么样？'
const ASSISTANT_TEXT = '你好呀，主人～本鲸今天心情是晴朗的深海蓝，见到你以后又亮了一档。你呢，今天过得怎么样？'

interface ConversationPreviewProps {
  scope: PreviewSettingsScope
  soundEffects: SoundEffectsController
}

function ActionButton({ label, selected, onClick, children }: {
  label: string
  selected?: boolean
  onClick?: () => void
  children: React.ReactNode
}): React.ReactElement {
  return <button className="preview-conversation-action" type="button" aria-label={label} aria-pressed={selected} title={label} onClick={onClick}>
    {children}
  </button>
}

export function ConversationPreview({ scope, soundEffects }: ConversationPreviewProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [simulatedState, setSimulatedState] = useState<OrbState>('idle')
  const [captionIndex, setCaptionIndex] = useState(0)
  const captionLines = ['你好呀，主人～本鲸今天心情是晴朗的深海蓝。', '见到你以后又亮了一档。', '你呢，今天过得怎么样？']
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadTimerRef = useRef<number | null>(null)
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const settingsSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const settings = resolveTtsSettings(settingsSnapshot.value)
  const canRead = settings.enabled
  const showCaption = settings.showReadingCaptions && (isPlaying || simulatedState === 'speaking')

  const simulateState = (state: OrbState): void => {
    const recording = state === 'listening'
    if (recording !== (simulatedState === 'listening')) {
      soundEffects.update({ enabled: settings.soundEnabled, volume: settings.soundVolume,
        pack: settings.soundPack, taskSounds: settings.taskSounds, clickSounds: settings.clickSounds })
      soundEffects.playMicrophoneCue(recording)
    }
    setSimulatedState(state)
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio === null) return
    audio.volume = settings.voiceVolume
    audio.playbackRate = settings.voiceRate
    if (!canRead) {
      audio.pause()
      audio.currentTime = 0
      if (loadTimerRef.current !== null) {
        window.clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
      setIsLoading(false)
      setIsPlaying(false)
    }
  }, [canRead, settings.voiceRate, settings.voiceVolume])

  useEffect(() => () => {
    if (loadTimerRef.current !== null) window.clearTimeout(loadTimerRef.current)
  }, [])

  useEffect(() => {
    if (!isPlaying && simulatedState !== 'speaking') { setCaptionIndex(0); return }
    const timer = window.setInterval(() => setCaptionIndex(value => (value + 1) % 3), 3000)
    return () => window.clearInterval(timer)
  }, [isPlaying, simulatedState])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(ASSISTANT_TEXT)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const togglePlayback = (): void => {
    const audio = audioRef.current
    if (!canRead || audio === null || isLoading) return
    if (!audio.paused) {
      audio.pause()
      return
    }
    setIsLoading(true)
    loadTimerRef.current = window.setTimeout(() => {
      loadTimerRef.current = null
      setIsLoading(false)
      void audio.play().catch(() => { setIsPlaying(false) })
    }, 1600)
  }

  return <section className="preview-conversation" aria-label="对话效果预览">
    <div className="preview-conversation-user-row">
      <div className="preview-conversation-user-bubble">{USER_TEXT}</div>
    </div>
    <div className="preview-conversation-user-meta">08:52</div>
    <div className="preview-conversation-assistant">
      <div className="preview-conversation-status">已完成，用时 5 秒</div>
      <div className="preview-conversation-divider" />
      <p className="preview-conversation-text">{ASSISTANT_TEXT} <span aria-label="鲸鱼">🐳</span></p>
      <div className="preview-conversation-actions" role="toolbar" aria-label="消息操作">
        <ActionButton label={copied ? '已复制' : '复制'} onClick={() => { void copy() }}><CopyIcon size={17} /></ActionButton>
        <ActionButton label="点赞" selected={reaction === 'up'} onClick={() => setReaction(reaction === 'up' ? null : 'up')}><ThumbsUpIcon size={17} /></ActionButton>
        <ActionButton label="点踩" selected={reaction === 'down'} onClick={() => setReaction(reaction === 'down' ? null : 'down')}><ThumbsDownIcon size={17} /></ActionButton>
        <ActionButton label={isLoading ? '加载中' : isPlaying ? '暂停朗读' : '朗读'} selected={isPlaying} onClick={togglePlayback}>
          {isPlaying
            ? <AnimatedAudioLines size={18} />
            : <RiVoiceAiFill className={isLoading ? 'xmimo-tts-pulse' : undefined} size={18} />}
        </ActionButton>
        <ActionButton label="分享"><ShareIcon size={17} /></ActionButton>
        <span className="preview-conversation-usage"><DatabaseIcon size={17} /> 用量 5.3k tok</span>
        <span className="preview-conversation-time">08:52</span>
      </div>
      <audio
        ref={audioRef}
        preload="auto"
        src={`${import.meta.env.BASE_URL}plugins/xiaomi-mimo-tts/preview-audio/hello.mp3`}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        aria-label="对话模拟朗读音频"
      />
    </div>
    <div className="preview-orb-demo">
      <div className="preview-orb-demo-header"><strong>输入框与响应球</strong><span>模拟宿主状态</span></div>
      {settings.showAudioResponse && <CaptionVisualPicker label="响应球样式" value={settings.audioResponseStyle}
        disabled={!settingsSnapshot.writable} onChange={value => { void scope.set('audioResponseStyle', value) }} />}
      <div className="preview-orb-demo-states" role="group" aria-label="模拟宿主状态">
        {([['idle', '待机'], ['listening', '语音输入'], ['thinking', '思考'], ['speaking', '朗读'], ['error', '错误']] as const).map(([state, label]) =>
          <button type="button" key={state} aria-pressed={simulatedState === state} onClick={() => simulateState(state)}>{label}</button>)}
      </div>
      {settings.showAudioResponse || showCaption ? (
        <div className="xmimo-reading-caption-integrated">
          {settings.showAudioResponse && <CaptionVisual variant={settings.audioResponseStyle}
            state={simulatedState === 'listening' ? simulatedState : isPlaying ? 'speaking' : isLoading ? 'connecting' : simulatedState} preview hoverable
            control={{ label: simulatedState === 'listening' ? '模拟停录' : '模拟开始录音',
              onClick: () => simulateState(simulatedState === 'listening' ? 'idle' : 'listening') }} />}
          {showCaption && <div className="xmimo-caption-text">
            <ReadingCaptionLines text={captionLines[captionIndex]!} previousText={captionIndex > 0 ? captionLines[captionIndex - 1]! : ''} label="实时字幕" />
          </div>}
        </div>
      ) : null}
      <div className="preview-orb-composer">
        <textarea aria-label="模拟输入框" placeholder="输入消息…" rows={2} />
        <div className="preview-orb-composer-footer">输入框预览 <button type="button">发送</button></div>
      </div>
    </div>
  </section>
}
