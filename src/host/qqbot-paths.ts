import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Match QQBot's data root, including its absolute-path requirement. */
export function qqbotDataRoot(dataDir = process.env.QQBOT_DATA_DIR): string {
  if (dataDir === undefined || dataDir.trim() === '') return resolve(homedir(), '.dsh-qqbot')
  if (!isAbsolute(dataDir)) throw new Error('QQBOT_DATA_DIR must be an absolute path')
  return resolve(dataDir)
}

export function qqbotMediaRoot(): string {
  return join(qqbotDataRoot(), 'media')
}
