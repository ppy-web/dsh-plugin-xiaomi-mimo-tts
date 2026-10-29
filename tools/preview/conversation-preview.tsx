import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { resolveTtsSettings } from '../../src/shared.js'
import type { PreviewSettingsScope } from './mock-settings.js'
import { AnimatedAudioLines } from '../../src/client/conversation/animated-audio-lines.js'
import { CopyIcon, DatabaseIcon, ShareIcon, ThumbsDownIcon, ThumbsUpIcon } from './action-icons.js'
import { RiVoiceAiFill } from 'react-icons/ri'

const USER_TEXT = '你好，今天心情怎么样？'
const ASSISTANT_TEXT = '你好呀，主人～本鲸今天心情是晴朗的深海蓝，见到你以后又亮了一档。你呢，今天过得怎么样？'

interface ConversationPreviewProps {
  scope: PreviewSettingsScope
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

export function ConversationPreview({ scope }: ConversationPreviewProps): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const [reaction, setReaction] = useState<'up' | 'down' | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loadTimerRef = useRef<number | null>(null)
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  const settingsSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const settings = resolveTtsSettings(settingsSnapshot.value)
  const canRead = settings.enabled

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
  </section>
}
