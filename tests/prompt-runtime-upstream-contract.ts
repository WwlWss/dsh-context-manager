import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'

function consumePublicM4C2Contract(ctx: Context, agent: Agent): void {
  const listed: readonly Agent[] = ctx.agents.list()
  void listed

  const found = ctx.agents.get(agent.id)
  void found

  const stopCreated = ctx.on('agent/created', ({ agent: created }) => {
    const scoped: Context = created.ctx
    void scoped
  })

  const stopSection = agent.ctx.systemPrompt.section({
    name: 'contract:section',
    order: 0.5,
    text: '',
  })
  const stopContext = agent.ctx.systemPrompt.context({
    name: 'contract:context',
    order: 120.5,
    text: '',
  })

  void agent.ctx.systemPrompt.assemble({
    scope: agent,
    agent,
  })

  stopContext()
  stopSection()
  stopCreated()
}

void consumePublicM4C2Contract
