import type { Context } from '@deepseek-ai/cordis'
import type {
  SkillCandidate,
  SkillDefinition,
  SkillInvocationPolicy,
  SkillProvider,
  SkillProviderControl,
  SkillProviderObservation,
  SkillSummary,
} from '@deepseek-ai/dsh-skill'

import type { RuntimeAgent } from './agent-runtime.js'
import {
  parentSkillViewOptions,
  requireSkillRegistry,
} from './skill-view.js'
import {
  managedSkillInvocationPolicy,
  profileSkillMode,
  sortedProfileSkillBindings,
} from '../runtime/skill-policy.js'
import type {
  EffectiveProfileResolution,
  SkillRuntimeBindingInspection,
  SkillRuntimeInvocation,
} from '../runtime/types.js'

export const CONTEXT_MANAGER_SKILL_PROVIDER = 'dsh-context-manager-policy'

export interface ContextManagerSkillLocator {
  readonly kind: 'dsh-context-manager-policy'
  readonly name: string
  readonly nativeProvider: string
}

export interface AgentSkillPolicyProvider {
  readonly control: SkillProviderControl
  dispose(): void
}

export type EffectiveProfileReader = () => EffectiveProfileResolution

function proxyCandidate(
  native: SkillSummary,
  invocation: SkillInvocationPolicy,
): SkillCandidate {
  const locator: ContextManagerSkillLocator = Object.freeze({
    kind: 'dsh-context-manager-policy',
    name: native.name,
    nativeProvider: native.provider,
  })

  return Object.freeze({
    // Preserve every summary field exposed by this DSH generation (including
    // forward-added metadata such as 0.1.6's optional path) and override only
    // the fields owned by the policy proxy.
    ...native,
    invocation,
    provider: CONTEXT_MANAGER_SKILL_PROVIDER,
    rank: Number.MAX_VALUE,
    locator,
  })
}

/**
 * Install one fixed Context Manager provider into one live Agent layer.
 *
 * The provider never caches parent identity or effective Domain state. DSH may
 * re-parent the same Agent to another standing preset without recreating it.
 */
export function installAgentSkillPolicyProvider(
  rootCtx: Context,
  agent: RuntimeAgent,
  readProfile: EffectiveProfileReader,
  onControl?: (control: SkillProviderControl) => void,
): AgentSkillPolicyProvider {
  const rootSkills = requireSkillRegistry(rootCtx)
  const scopedSkills = requireSkillRegistry(agent.ctx)
  let borrowed: SkillProviderControl | undefined

  const stop = scopedSkills.registerProvider((control) => {
    borrowed = control
    onControl?.(control)

    const provider: SkillProvider = {
      name: CONTEXT_MANAGER_SKILL_PROVIDER,

      async list(options): Promise<readonly SkillCandidate[] | SkillProviderObservation> {
        const resolution = readProfile()
        if (resolution.status !== 'active') return Object.freeze([])

        const managed = sortedProfileSkillBindings(resolution.profile)
          .filter(([, mode]) => mode !== 'auto')
        if (managed.length === 0) return Object.freeze([])

        const snapshot = await rootSkills.snapshot(parentSkillViewOptions(agent, options, control.signal))
        const nativeByName = new Map(snapshot.skills.map(skill => [skill.name, skill]))
        const candidates: SkillCandidate[] = []

        for (const [name, mode] of managed) {
          const native = nativeByName.get(name)
          if (native === undefined) continue
          const invocation = managedSkillInvocationPolicy(mode)
          if (invocation === undefined) continue
          candidates.push(proxyCandidate(native, invocation))
        }

        const frozen = Object.freeze(candidates)
        return snapshot.complete
          ? frozen
          : Object.freeze({ candidates: frozen, complete: false })
      },

      async get(candidate, options): Promise<SkillDefinition | undefined> {
        const native = await rootSkills.get(
          candidate.name,
          parentSkillViewOptions(agent, options, control.signal),
        )
        if (native === undefined) return undefined

        const resolution = readProfile()
        if (resolution.status !== 'active') return native

        const mode = profileSkillMode(resolution.profile, candidate.name)
        const invocation = managedSkillInvocationPolicy(mode)
        if (invocation === undefined) return native

        return Object.freeze({
          ...native,
          invocation,
        })
      },
    }

    return provider
  })

  if (borrowed === undefined) {
    stop()
    throw new TypeError('dsh-context-manager: SkillRegistry did not provide provider control')
  }

  return Object.freeze({
    control: borrowed,
    dispose(): void {
      stop()
    },
  })
}


function inspectionInvocation(
  invocation: SkillInvocationPolicy,
): SkillRuntimeInvocation {
  return Object.freeze({
    modelInvocable: invocation.modelInvocable,
    userInvocable: invocation.userInvocable,
  })
}

function sameInvocation(
  left: SkillInvocationPolicy,
  right: SkillInvocationPolicy,
): boolean {
  return left.modelInvocable === right.modelInvocable
    && left.userInvocable === right.userInvocable
}

export interface AgentSkillPolicyInspection {
  readonly complete: boolean
  readonly bindings: readonly SkillRuntimeBindingInspection[]
}

/**
 * Inspect policy effectiveness without loading any SkillDefinition body.
 */
export async function inspectAgentSkillPolicy(
  rootCtx: Context,
  agent: RuntimeAgent,
  resolution: EffectiveProfileResolution,
  cwd?: string,
): Promise<AgentSkillPolicyInspection> {
  if (resolution.status !== 'active') {
    return Object.freeze({
      complete: true,
      bindings: Object.freeze([]),
    })
  }

  const rootSkills = requireSkillRegistry(rootCtx)
  // Resolve the parent first. The Agent-view snapshot invokes this CM
  // provider, which reads the same parent view; sequencing lets SkillRegistry
  // reuse the completed parent catalog instead of concurrently discovering the
  // same native providers twice.
  const parentSnapshot = await rootSkills.snapshot(parentSkillViewOptions(agent, cwd === undefined ? {} : { cwd }))
  const agentSnapshot = await rootSkills.snapshot({
    ...(cwd === undefined ? {} : { cwd }),
    scope: agent,
  })

  const complete = parentSnapshot.complete && agentSnapshot.complete
  const parentByName = new Map(parentSnapshot.skills.map(skill => [skill.name, skill]))
  const agentByName = new Map(agentSnapshot.skills.map(skill => [skill.name, skill]))
  const bindings: SkillRuntimeBindingInspection[] = []

  for (const [skillName, mode] of sortedProfileSkillBindings(resolution.profile)) {
    if (!complete) {
      bindings.push(Object.freeze({
        state: 'catalog-incomplete',
        skillName,
        mode,
      }))
      continue
    }

    if (mode === 'auto') {
      const winner = agentByName.get(skillName)
      if (winner === undefined) {
        bindings.push(Object.freeze({
          state: 'missing-native-skill',
          skillName,
          mode,
        }))
        continue
      }

      bindings.push(Object.freeze({
        state: 'native-pass-through',
        skillName,
        mode,
        winner: Object.freeze({
          provider: winner.provider,
          invocation: inspectionInvocation(winner.invocation),
        }),
      }))
      continue
    }

    const native = parentByName.get(skillName)
    const expected = managedSkillInvocationPolicy(mode)
    if (expected === undefined) continue
    const winner = agentByName.get(skillName)

    if (native === undefined && winner === undefined) {
      bindings.push(Object.freeze({
        state: 'missing-native-skill',
        skillName,
        mode,
      }))
      continue
    }

    if (
      native !== undefined
      && winner?.provider === CONTEXT_MANAGER_SKILL_PROVIDER
      && sameInvocation(winner.invocation, expected)
    ) {
      bindings.push(Object.freeze({
        state: 'policy-applied',
        skillName,
        mode,
        nativeProvider: native.provider,
        expectedInvocation: inspectionInvocation(expected),
      }))
      continue
    }

    bindings.push(Object.freeze({
      state: 'policy-not-effective',
      skillName,
      mode,
      ...(native === undefined ? {} : { nativeProvider: native.provider }),
      expectedInvocation: inspectionInvocation(expected),
      ...(winner === undefined
        ? {}
        : {
            winner: Object.freeze({
              provider: winner.provider,
              invocation: inspectionInvocation(winner.invocation),
            }),
          }),
    }))
  }

  return Object.freeze({
    complete,
    bindings: Object.freeze(bindings),
  })
}
