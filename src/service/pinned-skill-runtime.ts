import { Service, type Context } from '@deepseek-ai/cordis'

import {
  attachAgentRuntimeBridge,
  type AgentRuntimeBridge,
  type RuntimeAgent,
} from '../adapters/agent-runtime.js'
import {
  inspectAgentPinnedSkillRuntime,
  installAgentPinnedSkillRuntime,
} from '../adapters/pinned-skill-runtime.js'
import { observeNativePromptPlacementCompatibility } from '../adapters/prompt-placement.js'
import { resolveEffectiveProfile } from '../runtime/effective-profile.js'
import type {
  EffectiveProfileResolution,
  PinnedSkillRuntimeInspection,
} from '../runtime/types.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshContextPinnedSkillRuntime: ContextManagerPinnedSkillRuntime
  }
}

/**
 * M5C Agent-scoped Pinned Skill full-instruction runtime.
 *
 * One fixed prompt slot per live Agent is recomputed on every native system
 * prompt assembly. No resolved Skill body survives to the next step.
 */
export class ContextManagerPinnedSkillRuntime extends Service {
  private activeBridge?: AgentRuntimeBridge
  private activeCtx?: Context

  constructor(ctx: Context) {
    super(ctx, 'dshContextPinnedSkillRuntime')

    ctx.inject([
      'dshContextManager',
      'dshContextSessionPresetIdentity',
      'dshContextSkillRuntime',
      'dshContextRequestSeries',
      'agents',
      'skills',
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

            const installed = installAgentPinnedSkillRuntime(
              runtimeCtx,
              agent,
              placement.targets,
              () => this.resolveProfile(runtimeCtx, agent),
            )
            let stopSeries: (() => void) | undefined
            try {
              stopSeries = runtimeCtx.dshContextRequestSeries.register(
                agent,
                () => installed.admitRequestSeries(),
                () => installed.admittedContributionPresent,
              )
            } catch (error) {
              installed.dispose()
              throw error
            }

            return () => {
              const errors: unknown[] = []
              try {
                installed.dispose()
              } catch (error) {
                errors.push(error)
              }
              try {
                stopSeries?.()
              } catch (error) {
                errors.push(error)
              }
              if (errors.length === 1) throw errors[0]
              if (errors.length > 1) {
                throw new AggregateError(
                  errors,
                  'failed to dispose Context Manager pinned Skill Agent runtime',
                )
              }
            }
          },
        )

        if (bridge !== undefined) {
          this.activeBridge = bridge
          this.activeCtx = runtimeCtx
        }

        return async () => {
          if (this.activeBridge === bridge) {
            this.activeBridge = undefined
            this.activeCtx = undefined
          }
          await bridge?.dispose()
        }
      }, 'dshContextPinnedSkillRuntime.lifecycle()')
    })
  }

  async inspect(agentId: string): Promise<PinnedSkillRuntimeInspection> {
    const bridge = this.activeBridge
    const activeCtx = this.activeCtx
    if (bridge === undefined || activeCtx === undefined) {
      return Object.freeze({ status: 'runtime-unavailable' })
    }

    const agent = [...bridge.agents.keys()].find(candidate => candidate.id === agentId)
    if (agent === undefined) {
      return Object.freeze({ status: 'agent-not-live', agentId })
    }

    const inspected = await inspectAgentPinnedSkillRuntime(agent)
    const resolution = inspected.resolution
    if (resolution === undefined) {
      return Object.freeze({ status: 'assembly-bypassed', agentId })
    }

    return Object.freeze({
      status: 'resolved',
      agentId,
      profile: resolution.profile,
      catalogComplete: resolution.catalogComplete,
      nativeState: inspected.nativeState,
      bindings: resolution.bindings,
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
