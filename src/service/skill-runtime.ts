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

interface ActiveSkillRuntime {
  readonly ctx: Context
  readonly bridge: AgentRuntimeBridge
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

function trackControl(
  controls: Set<SkillProviderControl>,
  control: SkillProviderControl,
): void {
  controls.add(control)
  control.signal.addEventListener(
    'abort',
    () => {
      controls.delete(control)
    },
    { once: true },
  )
}

/**
 * DSH provider invalidation is registry-wide. One CM authority edit therefore
 * selects one live registration as the coordinator instead of invalidating
 * once per Agent.
 */
function invalidateRegistryOnce(controls: Set<SkillProviderControl>): void {
  for (const control of controls) {
    if (control.signal.aborted) {
      controls.delete(control)
      continue
    }
    control.invalidate()
    return
  }
}

/**
 * M5B Agent-scoped Skill policy runtime.
 *
 * Each live Agent owns one fixed CM provider. Provider discovery/body loading
 * re-read current effective Domain state and current scope parent; only catalog
 * invalidation is cached by the native SkillRegistry.
 */
export class ContextManagerSkillRuntime extends Service {
  private active?: ActiveSkillRuntime

  constructor(ctx: Context) {
    super(ctx, 'dshContextSkillRuntime')

    ctx.inject([
      'dshContextManager',
      'dshContextSessionPresetIdentity',
      'agents',
      'skills',
    ], async (runtimeCtx) => {
      await runtimeCtx.effect(async () => {
        // Controls belong to this exact dependency activation. A later
        // reactivation must not share invalidation state with an older bridge
        // that is still unwinding.
        const controls = new Set<SkillProviderControl>()
        const stopChange = runtimeCtx.on(
          'dsh-context-manager/change',
          () => {
            invalidateRegistryOnce(controls)
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
                control => trackControl(controls, control),
              )
              return () => installed.dispose()
            },
          )
        } catch (error) {
          stopChange()
          controls.clear()
          throw error
        }

        if (bridge !== undefined) {
          this.active = Object.freeze({
            ctx: runtimeCtx,
            bridge,
          })
        }

        return async () => {
          stopChange()
          if (this.active?.bridge === bridge) this.active = undefined
          await bridge?.dispose()
          controls.clear()
        }
      }, 'dshContextSkillRuntime.lifecycle()')
    })
  }

  async inspect(agentId: string): Promise<SkillRuntimeInspection> {
    const active = this.active
    if (active === undefined) {
      return Object.freeze({ status: 'runtime-unavailable' })
    }

    const agent = [...active.bridge.agents.keys()]
      .find(candidate => candidate.id === agentId)
    if (agent === undefined) {
      return Object.freeze({ status: 'agent-not-live', agentId })
    }

    const profile = this.resolveProfile(active.ctx, agent)
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
      active.ctx,
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
}
