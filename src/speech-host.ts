import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './index.js'
import { readConfig } from './index.js'
import SpeechHost from './host/speech-service.js'

export { Config } from './index.js'
export const name = 'speech-synthesis'

/** Alternative entry for CLI and headless profiles; do not mount beside the Web entry. */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(SpeechHost, {
    updates: (listener: () => void) => ctx.on('loader/volatile-update', listener),
    current: () => readConfig(config),
  })
}
