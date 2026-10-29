import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SpeechArtifact, SpeechAudio } from '../host-api.js'

export const SPEECH_DATA_ROOT = join(homedir(), '.dsh-xiaomi-tts')
export const SPEECH_AUDIO_ROOT = join(SPEECH_DATA_ROOT, 'audio')
export const SPEECH_FILE_PREFIX = 'dsh-speech-'
export const SPEECH_FILE_TTL_MS = 24 * 60 * 60 * 1000

/** The directory comes from trusted plugin code, never model arguments. */
export async function writeSpeechArtifact(audio: SpeechAudio, directory = SPEECH_AUDIO_ROOT): Promise<SpeechArtifact> {
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${SPEECH_FILE_PREFIX}${randomUUID()}.${audio.format}`)
  await writeFile(path, audio.data, { flag: 'wx', mode: 0o600 })
  return {
    path, size: audio.data.length, format: audio.format, contentType: audio.contentType,
    ...(audio.durationMs === undefined ? {} : { durationMs: audio.durationMs }),
    remove: () => rm(path, { force: true }),
  }
}

/** Clean only files owned by this plugin, including when sharing a media root. */
export async function cleanupSpeechArtifacts(directory = SPEECH_AUDIO_ROOT, now = Date.now()): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  await Promise.all(entries.filter(entry => entry.isFile() && /^dsh-speech-[a-f0-9-]+\.(?:mp3|wav|silk)$/u.test(entry.name)).map(async entry => {
    const path = join(directory, entry.name)
    try {
      const info = await stat(path)
      if (now - info.mtimeMs > SPEECH_FILE_TTL_MS) await rm(path, { force: true })
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }))
}
