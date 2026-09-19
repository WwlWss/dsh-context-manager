import { Service, type Context } from '@deepseek-ai/cordis'

import {
  attachAgentRuntimeBridge,
  type AgentRuntimeBridge,
  type RuntimeAgent,
} from '../adapters/agent-runtime.js'
import {
  inspectAgentPromptRuntime,
  installAgentPromptRuntime,
  promptBindingContributionName,
} from '../adapters/prompt-runtime.js'
import { observeNativePromptPlacementCompatibility } from '../adapters/prompt-placement.js'
import type { PromptPlacement } from '../domain/model.js'
import { resolveEffectiveProfile } from '../runtime/effective-profile.js'
import { resolvePromptPlan } from '../runtime/prompt-plan.js'
import type {
  PromptRuntimeBindingInspection,
  PromptRuntimeInspection,
} from '../runtime/types.js'

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
  private activeBridge?: AgentRuntimeBridge

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
          agent => {
            const placement = observeNativePromptPlacementCompatibility(agent.ctx)
            if (placement.status !== 'available') {
              throw new TypeError(
                'dsh-context-manager: systemPrompt placement capability disappeared from Agent scope',
              )
            }
            return installAgentPromptRuntime(
              agent,
              placement.targets,
              visible => this.resolveAssembly(runtimeCtx, agent, visible),
            )
          },
        )
        if (bridge !== undefined) this.activeBridge = bridge
        return async () => {
          if (this.activeBridge === bridge) this.activeBridge = undefined
          await bridge?.dispose()
        }
      }, 'dshContextPromptRuntime.lifecycle()')
    })
  }

  async inspect(agentId: string): Promise<PromptRuntimeInspection> {
    const bridge = this.activeBridge
    if (bridge === undefined) {
      return Object.freeze({ status: 'runtime-unavailable' })
    }

    const agent = [...bridge.agents.keys()].find(candidate => candidate.id === agentId)
    if (agent === undefined) {
      return Object.freeze({ status: 'agent-not-live', agentId })
    }

    const inspected = await inspectAgentPromptRuntime(agent)
    const resolution = inspected.resolution
    if (resolution === undefined) {
      return Object.freeze({ status: 'assembly-bypassed', agentId })
    }

    const profile = resolution.profile
    if (profile.status !== 'active') {
      return Object.freeze({
        status: 'resolved',
        agentId,
        profile,
        bindings: Object.freeze([]),
      })
    }

    const visible = new Set(inspected.visiblePlacements ?? [])
    const planned = new Map(
      (resolution.plan?.bindings ?? []).map(binding => [binding.bindingId, binding]),
    )
    const bindings: PromptRuntimeBindingInspection[] = []
    const sectionByName = new Map(
      inspected.assembly.sections.map(section => [section.name, section]),
    )
    const contextByName = new Map(
      inspected.assembly.contexts.map(context => [context.name, context]),
    )

    const sorted = Object.entries(profile.profile.prompts).sort(([leftId, left], [rightId, right]) => {
      if (left.order < right.order) return -1
      if (left.order > right.order) return 1
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
    })

    for (const [bindingId, binding] of sorted) {
      const existing = planned.get(bindingId)
      if (existing !== undefined && existing.state !== 'eligible') {
        bindings.push(existing)
        continue
      }

      if (!binding.enabled) {
        bindings.push(Object.freeze({
          state: 'disabled',
          bindingId,
          resourceId: binding.resourceId,
          placement: binding.placement,
          order: binding.order,
        }))
        continue
      }

      if (!visible.has(binding.placement)) {
        bindings.push(Object.freeze({
          state: 'native-suppressed',
          bindingId,
          resourceId: binding.resourceId,
          placement: binding.placement,
          order: binding.order,
        }))
        continue
      }

      if (existing === undefined || existing.state !== 'eligible') continue

      const name = promptBindingContributionName(bindingId)
      const final = binding.placement === 'runtime-context'
        ? contextByName.get(name)
        : sectionByName.get(name)
      const nativeState = final === undefined
        ? 'suppressed'
        : final.text === existing.content
          ? 'present'
          : 'transformed'

      bindings.push(Object.freeze({
        state: 'eligible',
        bindingId: existing.bindingId,
        resourceId: existing.resourceId,
        placement: existing.placement,
        order: existing.order,
        resourceRevision: existing.resourceRevision,
        nativeState,
      }))
    }

    return Object.freeze({
      status: 'resolved',
      agentId,
      profile,
      bindings: Object.freeze(bindings),
    })
  }

  private resolveAssembly(
    ctx: Context,
    agent: RuntimeAgent,
    visiblePlacements: ReadonlySet<PromptPlacement>,
  ) {
    const profile = resolveEffectiveProfile(
      ctx.dshContextManager.defaultProfileCandidate(),
      ctx.dshContextSessionPresetIdentity.snapshot(agent.id),
    )
    if (profile.status !== 'active') return Object.freeze({ profile })

    return Object.freeze({
      profile,
      plan: resolvePromptPlan(
        profile.profile,
        visiblePlacements,
        ctx.dshContextPromptLibrary,
      ),
    })
  }
}
