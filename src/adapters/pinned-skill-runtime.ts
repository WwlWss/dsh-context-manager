import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { renderSkillContent, type SkillSummary } from '@deepseek-ai/dsh-skill'

import type { RuntimeAgent } from './agent-runtime.js'
import type { HostPromptAssembly, NativePromptPlacementTargets } from './prompt-runtime.js'
import { CONTEXT_MANAGER_SKILL_PROVIDER } from './skill-runtime.js'
import {
  agentWorkspaceCwd,
  combineSkillSignals,
  parentSkillViewOptions,
  requireSkillRegistry,
} from './skill-view.js'
import { sortedProfileSkillBindings } from '../runtime/skill-policy.js'
import type {
  EffectiveProfileResolution,
  PinnedSkillBindingInspection,
} from '../runtime/types.js'

export const PINNED_SKILL_SLOT_NAME = 'dsh-context-manager:slot:pinned-skills'
export const PINNED_SKILL_BUNDLE_VARIABLE = 'dsh_context_manager_pinned_skill_bundle'
export const PINNED_SKILL_SLOT_TEXT = `{{${PINNED_SKILL_BUNDLE_VARIABLE}}}`

interface HostPromptSectionRegistration {
  readonly name: string
  readonly order: number
  readonly text: string
}

interface HostSystemPromptRuntime {
  section(section: HostPromptSectionRegistration): () => void
  variable(name: string, provider: (context: unknown) => string | undefined): () => void
  assemble?(context?: unknown): Promise<HostPromptAssembly>
}

interface PinnedPromptAssembly extends HostPromptAssembly {
  variables: Record<string, string | undefined>
}

interface PromptAssemblyEventContext {
  on(
    event: 'system-prompt/assemble',
    listener: (
      assembly: PinnedPromptAssembly,
      context: unknown,
      next: () => Promise<PinnedPromptAssembly>,
    ) => Promise<PinnedPromptAssembly> | PinnedPromptAssembly,
  ): () => void
}

export interface PinnedSkillBundleResolution {
  readonly profile: EffectiveProfileResolution
  readonly catalogComplete: boolean
  readonly bindings: readonly PinnedSkillBindingInspection[]
  /** Internal model-facing bundle; never expose this through public inspection. */
  readonly text: string
}

export type PinnedEffectiveProfileReader = () => EffectiveProfileResolution

function unsupportedRuntimeApi(detail: string): TypeError {
  return new TypeError(`dsh-context-manager: unsupported pinned-skill prompt API; ${detail}`)
}

function requireRuntime(ctx: Context): HostSystemPromptRuntime {
  const raw = ctx.get('systemPrompt') as unknown
  if (typeof raw !== 'object' || raw === null) {
    throw unsupportedRuntimeApi('expected systemPrompt service')
  }
  const candidate = raw as Record<string, unknown>
  if (
    typeof candidate.section !== 'function'
    || typeof candidate.variable !== 'function'
  ) {
    throw unsupportedRuntimeApi('expected section() and variable()')
  }
  return raw as HostSystemPromptRuntime
}

function requirePinnedAssembly(assembly: HostPromptAssembly): PinnedPromptAssembly {
  if (
    typeof assembly !== 'object'
    || assembly === null
    || !Array.isArray(assembly.sections)
    || !Array.isArray(assembly.contexts)
  ) {
    throw unsupportedRuntimeApi('assembly must expose sections[] and contexts[]')
  }
  const variables = (assembly as Record<string, unknown>).variables
  if (
    typeof variables !== 'object'
    || variables === null
    || Array.isArray(variables)
  ) {
    throw unsupportedRuntimeApi('assembly must expose variables{}')
  }
  return assembly as PinnedPromptAssembly
}

function requestSignal(context: unknown): AbortSignal | undefined {
  if (typeof context !== 'object' || context === null) return undefined
  const signal = (context as Record<string, unknown>).signal
  return signal instanceof AbortSignal ? signal : undefined
}

function pinnedSkillNames(profile: Extract<EffectiveProfileResolution, { status: 'active' }>): readonly string[] {
  return Object.freeze(
    sortedProfileSkillBindings(profile.profile)
      .filter(([, mode]) => mode === 'pinned')
      .map(([name]) => name),
  )
}

function nativeByName(skills: readonly SkillSummary[]): ReadonlyMap<string, SkillSummary> {
  return new Map(skills.map(skill => [skill.name, skill]))
}

/**
 * Resolve one current pinned bundle from the Agent's dynamic parent Skill view.
 *
 * A partial catalog is never mixed with loaded bodies: M5C either observes one
 * complete native winner set or contributes no pinned instructions for that
 * assembly.
 */
export async function resolvePinnedSkillBundle(
  rootCtx: Context,
  agent: RuntimeAgent,
  profile: EffectiveProfileResolution,
  signal?: AbortSignal,
  lifecycle?: AbortSignal,
): Promise<PinnedSkillBundleResolution> {
  if (profile.status !== 'active') {
    return Object.freeze({
      profile,
      catalogComplete: true,
      bindings: Object.freeze([]),
      text: '',
    })
  }

  const names = pinnedSkillNames(profile)
  if (names.length === 0) {
    return Object.freeze({
      profile,
      catalogComplete: true,
      bindings: Object.freeze([]),
      text: '',
    })
  }

  const skills = requireSkillRegistry(rootCtx)
  const cwd = agentWorkspaceCwd(agent)
  const baseOptions = {
    ...(cwd === undefined ? {} : { cwd }),
    ...(signal === undefined ? {} : { signal }),
  }
  const lookup = parentSkillViewOptions(agent, baseOptions, lifecycle)
  const parentSnapshot = await skills.snapshot(lookup)
  const agentSnapshot = await skills.snapshot({
    ...baseOptions,
    ...(lifecycle === undefined
      ? {}
      : { signal: combineSkillSignals(signal, lifecycle) }),
    scope: agent,
  })

  if (!parentSnapshot.complete || !agentSnapshot.complete) {
    return Object.freeze({
      profile,
      catalogComplete: false,
      bindings: Object.freeze(names.map(skillName => Object.freeze({
        state: 'catalog-incomplete' as const,
        skillName,
      }))),
      text: '',
    })
  }

  const summaries = nativeByName(parentSnapshot.skills)
  const agentWinners = nativeByName(agentSnapshot.skills)
  const bindings: PinnedSkillBindingInspection[] = []
  const rendered: string[] = []

  for (const skillName of names) {
    const summary = summaries.get(skillName)
    if (summary === undefined) {
      bindings.push(Object.freeze({
        state: 'missing-native-skill',
        skillName,
      }))
      continue
    }

    const winner = agentWinners.get(skillName)
    if (
      winner?.provider !== CONTEXT_MANAGER_SKILL_PROVIDER
      || winner.invocation.modelInvocable
      || winner.invocation.userInvocable
    ) {
      bindings.push(Object.freeze({
        state: 'policy-not-effective',
        skillName,
        nativeProvider: summary.provider,
        ...(winner === undefined ? {} : { winnerProvider: winner.provider }),
      }))
      continue
    }

    const definition = await skills.get(skillName, lookup)
    if (definition === undefined) {
      bindings.push(Object.freeze({
        state: 'definition-unavailable',
        skillName,
        nativeProvider: summary.provider,
      }))
      continue
    }

    bindings.push(Object.freeze({
      state: 'loaded',
      skillName,
      nativeProvider: definition.provider,
    }))
    rendered.push(renderSkillContent(definition))
  }

  return Object.freeze({
    profile,
    catalogComplete: true,
    bindings: Object.freeze(bindings),
    text: rendered.join('\n\n'),
  })
}

/**
 * Derive a distinct M5C section position inside M4C1's already-audited
 * after-tool-guidance extension gap.
 */
export function pinnedSkillSectionOrder(targets: NativePromptPlacementTargets): number {
  const target = targets['after-tool-guidance']
  if (target.channel !== 'section') {
    throw unsupportedRuntimeApi('after-tool-guidance must resolve to a system-prompt section')
  }
  const order = target.order + 0.25
  if (!Number.isFinite(order)) {
    throw unsupportedRuntimeApi('pinned Skill section order must remain finite')
  }
  return order
}

const INSPECTION_CAPTURE = Symbol('dsh-context-manager.pinned-skill-runtime.inspection')

interface InspectionCapture {
  resolution?: PinnedSkillBundleResolution
}

function inspectionCapture(context: unknown): InspectionCapture | undefined {
  if (typeof context !== 'object' || context === null) return undefined
  return (context as Record<PropertyKey, unknown>)[INSPECTION_CAPTURE] as InspectionCapture | undefined
}

interface FinalPinnedContribution {
  readonly signature: string
  readonly present: boolean
}

function finalPinnedContribution(assembly: PinnedPromptAssembly): FinalPinnedContribution {
  const sections = assembly.sections
    .filter(section => section.name === PINNED_SKILL_SLOT_NAME)
    .map(section => section.text)
  // A downstream complete prompt can remove the CM slot while leaving the
  // private variable in the assembly. That variable is then model-inert and
  // must not trigger request-series churn when its body changes.
  const variable = sections.length === 0
    ? null
    : (assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE] ?? null)
  return Object.freeze({
    signature: createHash('sha256')
      .update(JSON.stringify({ sections, variable }))
      .digest('hex'),
    present: sections.length > 0,
  })
}


export interface AgentPinnedSkillRuntimeInspection {
  readonly resolution?: PinnedSkillBundleResolution
  readonly nativeState: 'empty' | 'present' | 'native-suppressed' | 'transformed'
}

/** Run one fresh native assembly and compare its final CM-owned slot to the resolved bundle. */
export async function inspectAgentPinnedSkillRuntime(
  agent: RuntimeAgent,
): Promise<AgentPinnedSkillRuntimeInspection> {
  const runtime = requireRuntime(agent.ctx)
  if (typeof runtime.assemble !== 'function') {
    throw unsupportedRuntimeApi('expected assemble() for runtime inspection')
  }

  const capture: InspectionCapture = {}
  const assembly = requirePinnedAssembly(await runtime.assemble({
    scope: agent,
    agent,
    [INSPECTION_CAPTURE]: capture,
  }))
  const resolution = capture.resolution
  if (resolution === undefined || resolution.text.length === 0) {
    return Object.freeze({
      ...(resolution === undefined ? {} : { resolution }),
      nativeState: 'empty',
    })
  }

  const sections = assembly.sections.filter(item => item.name === PINNED_SKILL_SLOT_NAME)
  if (sections.length === 0) {
    return Object.freeze({
      resolution,
      nativeState: 'native-suppressed',
    })
  }

  const currentVariable = assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE]
  return Object.freeze({
    resolution,
    nativeState:
      sections.length === 1
      && sections[0]?.text === PINNED_SKILL_SLOT_TEXT
      && currentVariable === resolution.text
        ? 'present'
        : 'transformed',
  })
}

export interface AgentPinnedSkillRuntime {
  /**
   * Capture the final pinned contribution observed for the current real request.
   *
   * This is proposal state only. The admitted baseline is not advanced until
   * commitRequestSeries() observes DSH's durable request/header publication.
   */
  prepareRequestSeries(): boolean
  /** Promote the prepared contribution after native request admission commits. */
  commitRequestSeries(): void
  /**
   * Whether teardown must leave a later reconciliation fence. Pending real
   * request state is included because a contribution may retire after pre-step
   * but before request/header.
   */
  retireRequestSeries(): boolean
  dispose(): void
}

/**
 * Install one fixed Agent-scoped pinned instruction slot and its async
 * replacement waterfall.
 */
export function installAgentPinnedSkillRuntime(
  rootCtx: Context,
  agent: RuntimeAgent,
  targets: NativePromptPlacementTargets,
  readProfile: PinnedEffectiveProfileReader,
): AgentPinnedSkillRuntime {
  const runtime = requireRuntime(agent.ctx)
  const lifecycle = new AbortController()
  const disposers: Array<() => void> = []
  let observedRequestSignature: string | undefined
  let observedRequestContributionPresent = false
  let pendingRequestSignature: string | undefined
  let pendingRequestContributionPresent = false
  let admittedRequestSignature: string | undefined
  let admittedContributionPresent = false

  try {
    disposers.push(runtime.variable(PINNED_SKILL_BUNDLE_VARIABLE, () => ''))
    disposers.push(runtime.section({
      name: PINNED_SKILL_SLOT_NAME,
      order: pinnedSkillSectionOrder(targets),
      text: PINNED_SKILL_SLOT_TEXT,
    }))

    const stopAssembly = (agent.ctx as unknown as PromptAssemblyEventContext).on(
      'system-prompt/assemble',
      async (rawAssembly, context, next) => {
        const assembly = requirePinnedAssembly(rawAssembly)
        const resolution = await resolvePinnedSkillBundle(
          rootCtx,
          agent,
          readProfile(),
          requestSignal(context),
          lifecycle.signal,
        )

        const capture = inspectionCapture(context)
        if (capture !== undefined) capture.resolution = resolution

        assembly.variables[PINNED_SKILL_BUNDLE_VARIABLE] = resolution.text
        const slot = assembly.sections.findIndex(section => section.name === PINNED_SKILL_SLOT_NAME)
        if (slot >= 0) {
          if (resolution.text.length === 0) {
            assembly.sections.splice(slot, 1)
          } else {
            assembly.sections[slot] = {
              name: PINNED_SKILL_SLOT_NAME,
              text: PINNED_SKILL_SLOT_TEXT,
            }
          }
        }

        const result = requirePinnedAssembly(await next())
        // assembleContextFor(agent, signal) supplies a request signal. Diagnostic
        // assemblies intentionally do not advance request-series state.
        if (requestSignal(context) !== undefined) {
          const contribution = finalPinnedContribution(result)
          observedRequestSignature = contribution.signature
          observedRequestContributionPresent = contribution.present
        }
        return result
      },
    )
    disposers.push(stopAssembly)

  } catch (error) {
    lifecycle.abort(error)
    for (const dispose of [...disposers].reverse()) dispose()
    throw error
  }

  let disposed = false
  return Object.freeze({
    prepareRequestSeries(): boolean {
      if (disposed) return false
      const signature = observedRequestSignature
      if (signature === undefined) {
        pendingRequestSignature = undefined
        pendingRequestContributionPresent = false
        return false
      }

      pendingRequestSignature = signature
      pendingRequestContributionPresent = observedRequestContributionPresent
      return admittedRequestSignature !== undefined
        && admittedRequestSignature !== signature
    },
    commitRequestSeries(): void {
      const signature = pendingRequestSignature
      if (signature === undefined) return

      admittedRequestSignature = signature
      admittedContributionPresent = pendingRequestContributionPresent
      pendingRequestSignature = undefined
      pendingRequestContributionPresent = false
    },
    retireRequestSeries(): boolean {
      // Assembly-only observation is not admission. A contribution needs a
      // cleanup fence only after it reached a non-empty pre-step proposal or
      // was already acknowledged by native request/header.
      return admittedContributionPresent
        || pendingRequestContributionPresent
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      lifecycle.abort(new Error('Context Manager pinned Skill runtime disposed'))
      const errors: unknown[] = []
      for (const dispose of [...disposers].reverse()) {
        try {
          dispose()
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length > 1) {
        throw new AggregateError(errors, 'failed to dispose Context Manager pinned Skill runtime')
      }
    },
  })
}
