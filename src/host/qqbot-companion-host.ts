import type { Context } from '@deepseek-ai/cordis'
import { QqCompanion } from './qqbot-companion.js'
import type { WhaleSettings } from '../types/whale.js'
import { QqIdentityReader, qqCompanionNamespace } from './qqbot-identity.js'
import { QqMemoryStore } from './qqbot-memory.js'

export function createQqCompanion(ctx: Context, current: () => WhaleSettings): QqCompanion {
  return new QqCompanion(new QqMemoryStore(qqCompanionNamespace(ctx, 'speech-delivery-qqbot')), new QqIdentityReader(), current)
}
