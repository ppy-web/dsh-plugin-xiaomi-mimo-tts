import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SPEECH_DATA_ROOT } from './speech-files.js'
import { writeAtomicJson } from './atomic-json.js'

export type SpeechMode = 'manual' | 'auto'

/** Each session owns its file; a failed write never replaces the saved mode. */
export class SpeechModeStore {
  constructor(private readonly directory = join(SPEECH_DATA_ROOT, 'sessions')) {}

  private path(sessionId: string): string {
    return join(this.directory, `${createHash('sha256').update(sessionId).digest('hex')}.json`)
  }

  async load(sessionId: string, fallback: SpeechMode): Promise<SpeechMode> {
    try {
      const value = JSON.parse(await readFile(this.path(sessionId), 'utf8')) as { mode?: unknown }
      return value?.mode === 'auto' || value?.mode === 'manual' ? value.mode : fallback
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof SyntaxError) return fallback
      throw error
    }
  }

  async save(sessionId: string, mode: SpeechMode): Promise<void> {
    await writeAtomicJson(this.directory, this.path(sessionId), { mode })
  }
}
