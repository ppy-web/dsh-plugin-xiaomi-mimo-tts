import type { Agent } from '@deepseek-ai/dsh-agent'
import { QqIdentityReader, type QqConversation } from './qqbot-identity.js'

/** A preset name or user-supplied text never grants QQ identity. */
export class WhaleConversations {
  private readonly routes = new WeakMap<Agent, QqConversation>()

  constructor(readonly identity = new QqIdentityReader(), private readonly qqAvailable: () => boolean = () => false) {}

  get(agent: Agent): QqConversation {
    return this.routes.get(agent) ?? { kind: 'unknown', reason: 'missing' }
  }

  async resolve(agent: Agent): Promise<QqConversation> {
    if (agent.session.header.origin === 'subagent') return { kind: 'unknown', reason: 'invalid' }
    let route = await this.identity.inspect(agent.id)
    // An installation with no QQ sender and no QQ mapping is a normal DSH deployment.
    if (route.kind === 'unknown' && route.reason === 'missing' && !this.qqAvailable()) route = { kind: 'dsh' }
    this.routes.set(agent, route)
    return route
  }

  release(agent: Agent): void { this.routes.delete(agent) }
}
