import { Service, type Context } from '@deepseek-ai/cordis'

import {
  attachAgentRuntimeBridge,
  type RuntimeAgent,
} from '../adapters/agent-runtime.js'
import { installAgentPromptRuntime } from '../adapters/prompt-runtime.js'
import type { PromptPlacement } from '../domain/model.js'
import { resolveEffectiveProfile } from '../runtime/effective-profile.js'
import { resolvePromptPlan } from '../runtime/prompt-plan.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPromptRuntime: ContextManagerPromptRuntime
  }
}

/**
 * M4C2 Agent-scoped Prompt Runtime.
 *
 * The service owns no cross-step resolution cache. Its native registration set
 * is fixed per Agent; every DSH assembly re-reads current Domain, Session
 * preset identity, and Prompt Library state.
 */
export class ContextManagerPromptRuntime extends Service {
  constructor(ctx: Context) {
    super(ctx, 'dshContextPromptRuntime')

    ctx.inject([
      'dshContextManager',
      'dshContextSessionPresetIdentity',
      'dshContextPromptLibrary',
      'agents',
      'systemPrompt',
    ], async (runtimeCtx) => {
      await runtimeCtx.effect(async () => {
        const bridge = await attachAgentRuntimeBridge(
          runtimeCtx,
          agent => installAgentPromptRuntime(
            agent,
            visible => this.resolveAssembly(runtimeCtx, agent, visible),
          ),
        )
        return async () => {
          await bridge?.dispose()
        }
      }, 'dshContextPromptRuntime.lifecycle()')
    })
  }

  private resolveAssembly(
    ctx: Context,
    agent: RuntimeAgent,
    visiblePlacements: ReadonlySet<PromptPlacement>,
  ) {
    const profile = resolveEffectiveProfile(
      ctx.dshContextManager.snapshot(),
      ctx.dshContextSessionPresetIdentity.snapshot(agent.id),
    )
    if (profile.status !== 'active') return Object.freeze({})

    return Object.freeze({
      plan: resolvePromptPlan(
        profile.profile,
        visiblePlacements,
        ctx.dshContextPromptLibrary,
      ),
    })
  }
}
