export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'
export type PlaybackSource = 'live' | 'complete' | null

export interface PlaybackView {
  sessionId: string | null
  messageId: string | null
  source: PlaybackSource
  status: PlaybackStatus
  error: string | null
}


export interface LiveMessageIdentity {
  messageId: string
  turn: number
  step: number
  text: string
  interrupted: boolean
}
