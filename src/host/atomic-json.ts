import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const TRANSIENT_RENAME_CODES = new Set(['EPERM', 'EBUSY'])

export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!code || !TRANSIENT_RENAME_CODES.has(code) || attempt >= 3) throw error
      await sleep(15 * (attempt + 1))
    }
  }
}

/** Replace a JSON file only after its private temporary file has been written. */
export async function writeAtomicJson(directory: string, path: string, value: unknown): Promise<void> {
  await mkdir(directory, { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: 'wx', mode: 0o600 })
    await renameWithRetry(temporary, path)
  } finally { await rm(temporary, { force: true }) }
}
