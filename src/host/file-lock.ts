import { createHash } from 'node:crypto'
import { open, readFile, rm, writeFile } from 'node:fs/promises'

export async function staleFileLockOwner(lock: string, minAgeMs: number): Promise<string | undefined> {
  try {
    await using file = await open(lock, 'r')
    if (Date.now() - (await file.stat()).mtimeMs <= minAgeMs) return
    const holder = await file.readFile('utf8')
    const pid = Number(/^([1-9][0-9]*):/u.exec(holder)?.[1])
    if (Number.isSafeInteger(pid) && pid <= 0x7fffffff) {
      try { process.kill(pid, 0); return }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return }
    }
    return holder
  } catch (error) {
    if (!['ENOENT', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
}

/** Serialize removals of an old generation and recheck it before removing the lock. */
export async function releaseFileLock(lock: string, holder: string): Promise<boolean> {
  const guard = `${lock}.${createHash('sha256').update(holder).digest('hex')}.release`
  try { await writeFile(guard, '', { flag: 'wx', mode: 0o600 }) }
  catch (error) {
    if (['EEXIST', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
    throw error
  }
  try {
    const current = await readFile(lock, 'utf8').catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    })
    if (current !== holder) return false
    await rm(lock, { force: true })
    return true
  } finally { await rm(guard, { force: true }) }
}
