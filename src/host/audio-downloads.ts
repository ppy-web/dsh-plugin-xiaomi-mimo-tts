import { randomBytes } from 'node:crypto'
import type { SpeechArtifact, SpeechDownload } from '../host-api.js'
import { SPEECH_FILE_TTL_MS } from './speech-files.js'
import { TtsProviderError } from './provider-error.js'

/** Only explicitly published artifacts can be downloaded; IDs never resolve filesystem paths. */
export class AudioDownloads {
  private readonly entries = new Map<string, { artifact: SpeechArtifact; expiresAt: number }>()
  private closed = false

  constructor(private readonly now: () => number = Date.now) {}

  async publish(artifact: SpeechArtifact): Promise<SpeechDownload> {
    if (this.closed) {
      await artifact.remove()
      throw new TtsProviderError('speech-service-disposed', 'Speech service stopped.', 503)
    }
    const audioId = randomBytes(32).toString('hex')
    const expiresAt = this.now() + SPEECH_FILE_TTL_MS
    this.entries.set(audioId, { artifact, expiresAt })
    return {
      audioId, url: `audio/${audioId}`, expiresAt: new Date(expiresAt).toISOString(),
      size: artifact.size, format: artifact.format, contentType: artifact.contentType,
      ...(artifact.durationMs === undefined ? {} : { durationMs: artifact.durationMs }),
    }
  }

  async get(audioId: string): Promise<SpeechArtifact | undefined> {
    const entry = this.entries.get(audioId)
    if (!entry) return
    if (entry.expiresAt > this.now()) return entry.artifact
    this.entries.delete(audioId)
    await entry.artifact.remove()
  }

  async revoke(audioId: string): Promise<void> {
    const entry = this.entries.get(audioId)
    this.entries.delete(audioId)
    await entry?.artifact.remove()
  }

  async sweep(): Promise<void> {
    const removals: Promise<void>[] = []
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt > this.now()) continue
      this.entries.delete(id)
      removals.push(entry.artifact.remove())
    }
    await Promise.all(removals)
  }

  async dispose(): Promise<void> {
    this.closed = true
    const entries = [...this.entries.values()]
    this.entries.clear()
    await Promise.all(entries.map(entry => entry.artifact.remove()))
  }
}
