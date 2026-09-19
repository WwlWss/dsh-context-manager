import type { Context } from '@deepseek-ai/cordis'

import {
  observeNativePromptPlacementCompatibility,
  type NativePromptPlacementTarget,
} from './prompt-placement.js'
import type { RuntimeAgent } from './agent-runtime.js'
import type { PromptPlacement } from '../domain/model.js'
import type { PromptPlan } from '../runtime/types.js'

export const PROMPT_RUNTIME_SLOT_NAMES = Object.freeze({
  'before-persona': 'dsh-context-manager:slot:before-persona',
  'after-persona': 'dsh-context-manager:slot:after-persona',
  'before-tool-guidance': 'dsh-context-manager:slot:before-tool-guidance',
  'after-tool-guidance': 'dsh-context-manager:slot:after-tool-guidance',
  'runtime-context': 'dsh-context-manager:slot:runtime-context',
} satisfies Record<PromptPlacement, string>)

interface HostPromptSectionRegistration {
  readonly name: string
  readonly order: number
  readonly text: string
}

interface HostSystemPromptRuntime {
  section(section: HostPromptSectionRegistration): () => void
  context(context: HostPromptSectionRegistration): () => void
  assemble?(context?: unknown): Promise<HostPromptAssembly>
}

interface HostAssembledSection {
  readonly name: string
  text: string
  readonly interpolate?: boolean
}

interface HostAssembledContext {
  readonly name: string
  text: string
}

export interface HostPromptAssembly {
  sections: HostAssembledSection[]
  contexts: HostAssembledContext[]
  readonly [key: string]: unknown
}

interface PromptAssemblyEventContext {
  on(
    event: 'system-prompt/assemble',
    listener: (
      assembly: HostPromptAssembly,
      context: unknown,
      next: () => Promise<HostPromptAssembly>,
    ) => Promise<HostPromptAssembly> | HostPromptAssembly,
  ): () => void
}

export interface PromptRuntimeAssemblyResolution {
  readonly profile: import('../runtime/types.js').EffectiveProfileResolution
  readonly plan?: PromptPlan
}

export type PromptRuntimeResolver = (
  visiblePlacements: ReadonlySet<PromptPlacement>,
) => PromptRuntimeAssemblyResolution

function unsupportedRuntimeApi(detail: string): TypeError {
  return new TypeError(`dsh-context-manager: unsupported systemPrompt runtime API; ${detail}`)
}

function requireRuntime(ctx: Context): HostSystemPromptRuntime {
  const raw = ctx.get('systemPrompt') as unknown
  if (typeof raw !== 'object' || raw === null) {
    throw unsupportedRuntimeApi('expected systemPrompt service')
  }
  const candidate = raw as Record<string, unknown>
  if (typeof candidate.section !== 'function' || typeof candidate.context !== 'function') {
    throw unsupportedRuntimeApi('expected section() and context()')
  }
  return raw as HostSystemPromptRuntime
}

function validateAssembly(assembly: HostPromptAssembly): void {
  if (
    typeof assembly !== 'object'
    || assembly === null
    || !Array.isArray(assembly.sections)
    || !Array.isArray(assembly.contexts)
  ) {
    throw unsupportedRuntimeApi('assembly must expose sections[] and contexts[]')
  }
}

function contributionName(bindingId: string): string {
  let encoded = ''
  for (let index = 0; index < bindingId.length; index += 1) {
    encoded += bindingId.charCodeAt(index).toString(16).padStart(4, '0')
  }
  return `dsh-context-manager:binding:${encoded}`
}

export function promptBindingContributionName(bindingId: string): string {
  return contributionName(bindingId)
}

function placementOfSlot(name: string): PromptPlacement | undefined {
  for (const [placement, slot] of Object.entries(PROMPT_RUNTIME_SLOT_NAMES)) {
    if (slot === name) return placement as PromptPlacement
  }
  return undefined
}

export function promptRuntimeVisiblePlacements(
  assembly: HostPromptAssembly,
): ReadonlySet<PromptPlacement> {
  const placements = new Set<PromptPlacement>()
  for (const section of assembly.sections) {
    const placement = placementOfSlot(section.name)
    if (placement !== undefined && placement !== 'runtime-context') placements.add(placement)
  }
  if (assembly.contexts.some(context =>
    context.name === PROMPT_RUNTIME_SLOT_NAMES['runtime-context'])) {
    placements.add('runtime-context')
  }
  return placements
}

function replaceSlot<T extends { readonly name: string }>(
  entries: T[],
  slotName: string,
  replacements: readonly T[],
): void {
  const index = entries.findIndex(entry => entry.name === slotName)
  if (index < 0) return
  entries.splice(index, 1, ...replacements)
}

function expandPlan(assembly: HostPromptAssembly, plan: PromptPlan | undefined): void {
  const byPlacement = new Map<PromptPlacement, HostAssembledSection[] | HostAssembledContext[]>()
  if (plan !== undefined) {
    for (const binding of plan.eligible) {
      const row = {
        name: contributionName(binding.bindingId),
        text: binding.content,
      }
      const current = byPlacement.get(binding.placement)
      if (current === undefined) {
        byPlacement.set(binding.placement, [row])
      } else {
        current.push(row)
      }
    }
  }

  for (const placement of [
    'before-persona',
    'after-persona',
    'before-tool-guidance',
    'after-tool-guidance',
  ] as const) {
    replaceSlot(
      assembly.sections,
      PROMPT_RUNTIME_SLOT_NAMES[placement],
      (byPlacement.get(placement) ?? []) as HostAssembledSection[],
    )
  }

  replaceSlot(
    assembly.contexts,
    PROMPT_RUNTIME_SLOT_NAMES['runtime-context'],
    (byPlacement.get('runtime-context') ?? []) as HostAssembledContext[],
  )
}


const INSPECTION_CAPTURE = Symbol('dsh-context-manager.prompt-runtime.inspection')

interface InspectionCapture {
  visiblePlacements?: readonly PromptPlacement[]
  resolution?: PromptRuntimeAssemblyResolution
}

function inspectionCapture(context: unknown): InspectionCapture | undefined {
  if (typeof context !== 'object' || context === null) return undefined
  return (context as Record<PropertyKey, unknown>)[INSPECTION_CAPTURE] as InspectionCapture | undefined
}

export interface AgentPromptRuntimeInspectionAssembly {
  readonly assembly: HostPromptAssembly
  readonly visiblePlacements?: readonly PromptPlacement[]
  readonly resolution?: PromptRuntimeAssemblyResolution
}

/**
 * Run a fresh native assembly for one already-attached Agent. The private
 * capture token exists only for this call and does not become cross-step state.
 */
export async function inspectAgentPromptRuntime(
  agent: RuntimeAgent,
): Promise<AgentPromptRuntimeInspectionAssembly> {
  const runtime = requireRuntime(agent.ctx)
  if (typeof runtime.assemble !== 'function') {
    throw unsupportedRuntimeApi('expected assemble() for runtime inspection')
  }

  const capture: InspectionCapture = {}
  const assembly = await runtime.assemble({
    scope: agent,
    agent,
    [INSPECTION_CAPTURE]: capture,
  })
  validateAssembly(assembly)

  return Object.freeze({
    assembly,
    ...(capture.visiblePlacements === undefined
      ? {}
      : { visiblePlacements: capture.visiblePlacements }),
    ...(capture.resolution === undefined
      ? {}
      : { resolution: capture.resolution }),
  })
}

function registerSlot(
  runtime: HostSystemPromptRuntime,
  target: NativePromptPlacementTarget,
  placement: PromptPlacement,
): () => void {
  const input = {
    name: PROMPT_RUNTIME_SLOT_NAMES[placement],
    order: target.order,
    text: '',
  }
  return target.channel === 'section'
    ? runtime.section(input)
    : runtime.context(input)
}

function disposeReverse(disposers: readonly (() => void)[]): void {
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
    throw new AggregateError(errors, 'failed to dispose Context Manager prompt runtime')
  }
}

/**
 * Install M4C2's fixed native registration set for one Agent.
 */
export function installAgentPromptRuntime(
  agent: RuntimeAgent,
  resolve: PromptRuntimeResolver,
): () => void {
  const compatibility = observeNativePromptPlacementCompatibility(agent.ctx)
  if (compatibility.status !== 'available') {
    throw unsupportedRuntimeApi('systemPrompt capability disappeared from Agent scope')
  }

  const runtime = requireRuntime(agent.ctx)
  const disposers: Array<() => void> = []

  try {
    for (const placement of [
      'before-persona',
      'after-persona',
      'before-tool-guidance',
      'after-tool-guidance',
      'runtime-context',
    ] as const) {
      disposers.push(registerSlot(runtime, compatibility.targets[placement], placement))
    }

    const stopAssembly = (agent.ctx as unknown as PromptAssemblyEventContext).on(
      'system-prompt/assemble',
      async (assembly, _context, next) => {
        validateAssembly(assembly)
        const visible = promptRuntimeVisiblePlacements(assembly)
        const resolved = resolve(visible)
        const inspection = inspectionCapture(_context)
        if (inspection !== undefined) {
          inspection.visiblePlacements = Object.freeze([...visible])
          inspection.resolution = resolved
        }
        expandPlan(assembly, resolved.plan)
        return await next()
      },
    )
    disposers.push(stopAssembly)
  } catch (error) {
    disposeReverse(disposers)
    throw error
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    disposeReverse(disposers)
  }
}
