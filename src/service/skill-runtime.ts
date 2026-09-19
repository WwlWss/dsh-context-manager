import { Service, type Context } from '@deepseek-ai/cordis'
import type { SkillProviderControl } from '@deepseek-ai/dsh-skill'

import {
  attachAgentRuntimeBridge,
  type AgentRuntimeBridge,
  type RuntimeAgent,
} from '../adapters/agent-runtime.js'
import {
  inspectAgentSkillPolicy,
  installAgentSkillPolicyProvider,
} from '../adapters/skill-runtime.js'
import { resolveEffectiveProfile } from '../runtime/effective-profile.js'
import type {
  EffectiveProfileResolution,
  SkillRuntimeInspection,
} from '../runtime/types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextSkillRuntime: ContextManagerSkillRuntime
  }
}

function agentWorkspaceCwd(agent: RuntimeAgent): string | undefined {
  const raw = agent as unknown as {
    session?: {
      header?: {
        cwd?: unknown
      }
    }
  }
  const cwd = raw.session?.header?.cwd
  return typeof cwd === 'string' ? cwd : undefined
}

/**
 * M5B Agent-scoped Skill policy runtime.
 *
 * Each live Agent owns one fixed CM provider. Provider discovery/body loading
 * re-read current effective Domain state and current scope parent; only catalog
 * invalidation is cached by the native SkillRegistry.
 */
export class ContextManagerSkillRuntime extends Service {
  private readonly ownerCtx: Context
  private activeBridge?: AgentRuntimeBridge
  private readonly controls = new Set<SkillProviderControl>()

  constructor(ctx: Context) {
    super(ctx, 'dshContextSkillRuntime')
    this.ownerCtx = ctx

    ctx.inject([
      'dshContextManager',
      'dshContextSessionPresetIdentity',
      'agents',
      'skills',
    ], async (runtimeCtx) => {
      await runtimeCtx.effect(async () => {
        const stopChange = runtimeCtx.on(
          'dsh-context-manager/change',
          () => {
            this.invalidateRegistryOnce()
          },
        )

        let bridge: AgentRuntimeBridge | undefined
        try {
          bridge = await attachAgentRuntimeBridge(
            runtimeCtx,
            agent => {
              const installed = installAgentSkillPolicyProvider(
                runtimeCtx,
                agent,
                () => this.resolveProfile(runtimeCtx, agent),
                control => this.trackControl(control),
              )
              return () => installed.dispose()
            },
          )
        } catch (error) {
          stopChange()
          throw error
        }

        if (bridge !== undefined) this.activeBridge = bridge

        return async () => {
          stopChange()
          if (this.activeBridge === bridge) this.activeBridge = undefined
          await bridge?.dispose()
          this.controls.clear()
        }
      }, 'dshContextSkillRuntime.lifecycle()')
    })
  }

  async inspect(agentId: string): Promise<SkillRuntimeInspection> {
    const bridge = this.activeBridge
    if (bridge === undefined) {
      return Object.freeze({ status: 'runtime-unavailable' })
    }

    const agent = [...bridge.agents.keys()].find(candidate => candidate.id === agentId)
    if (agent === undefined) {
      return Object.freeze({ status: 'agent-not-live', agentId })
    }

    const profile = this.resolveProfile(this.ownerCtx, agent)
    if (profile.status !== 'active') {
      return Object.freeze({
        status: 'resolved',
        agentId,
        profile,
        catalogComplete: true,
        bindings: Object.freeze([]),
      })
    }

    const inspected = await inspectAgentSkillPolicy(
      this.ownerCtx,
      agent,
      profile,
      agentWorkspaceCwd(agent),
    )

    return Object.freeze({
      status: 'resolved',
      agentId,
      profile,
      catalogComplete: inspected.complete,
      bindings: inspected.bindings,
    })
  }

  private resolveProfile(
    ctx: Context,
    agent: RuntimeAgent,
  ): EffectiveProfileResolution {
    return resolveEffectiveProfile(
      ctx.dshContextManager.defaultProfileCandidate(),
      ctx.dshContextSessionPresetIdentity.snapshot(agent.id),
    )
  }

  private trackControl(control: SkillProviderControl): void {
    this.controls.add(control)
    control.signal.addEventListener(
      'abort',
      () => {
        this.controls.delete(control)
      },
      { once: true },
    )
  }

  /**
   * DSH provider invalidation is registry-wide. One CM authority edit therefore
   * selects one live registration as the coordinator instead of invalidating
   * once per Agent.
   */
  private invalidateRegistryOnce(): void {
    for (const control of this.controls) {
      if (control.signal.aborted) {
        this.controls.delete(control)
        continue
      }
      control.invalidate()
      return
    }
  }
}
