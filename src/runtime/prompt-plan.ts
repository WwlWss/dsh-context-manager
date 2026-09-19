import type {
  ContextProfile,
  PromptPlacement,
} from '../domain/model.js'
import type { PromptResourceSnapshot } from '../library/prompt-library.js'
import type {
  PromptBindingPlanState,
  PromptPlan,
} from './types.js'

export interface PromptResourceReader {
  get(id: string): PromptResourceSnapshot
}

function compareCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function freezeBinding<T extends PromptBindingPlanState>(binding: T): Readonly<T> {
  return Object.freeze(binding)
}

function resourceFailure(
  error: unknown,
): { state: 'missing-resource' | 'invalid-resource'; message: string } | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { code?: unknown; message?: unknown }
  const message = typeof candidate.message === 'string' ? candidate.message : String(error)
  if (candidate.code === 'prompt-resource-not-found') {
    return { state: 'missing-resource', message }
  }
  if (candidate.code === 'invalid-prompt-resource') {
    return { state: 'invalid-resource', message }
  }
  return undefined
}

/**
 * Resolve PromptBindings for the semantic placements that survived native
 * assembly into the Context Manager waterfall.
 *
 * Resource reads are deduplicated only inside this call. No state survives to
 * the next DSH assembly.
 */
export function resolvePromptPlan(
  profile: ContextProfile,
  visiblePlacements: ReadonlySet<PromptPlacement>,
  resources: PromptResourceReader,
): PromptPlan {
  const sorted = Object.entries(profile.prompts).sort(([leftId, left], [rightId, right]) => {
    if (left.order < right.order) return -1
    if (left.order > right.order) return 1
    return compareCodeUnit(leftId, rightId)
  })

  const resourceCache = new Map<
    string,
    | { status: 'usable'; snapshot: PromptResourceSnapshot }
    | { status: 'missing-resource' | 'invalid-resource'; message: string }
  >()
  const bindings: Array<Readonly<PromptBindingPlanState>> = []
  const eligible: Array<Readonly<Extract<PromptBindingPlanState, { state: 'eligible' }>>> = []

  for (const [bindingId, binding] of sorted) {
    if (!binding.enabled) {
      bindings.push(freezeBinding({
        state: 'disabled',
        bindingId,
        resourceId: binding.resourceId,
        placement: binding.placement,
        order: binding.order,
      }))
      continue
    }

    // A missing native placeholder means this placement is suppressed before
    // Context Manager resolution (notably runtime-context suppression). Do not
    // read resources that cannot participate in this assembly.
    if (!visiblePlacements.has(binding.placement)) continue

    let resource = resourceCache.get(binding.resourceId)
    if (resource === undefined) {
      try {
        resource = {
          status: 'usable',
          snapshot: resources.get(binding.resourceId),
        }
      } catch (error) {
        const failure = resourceFailure(error)
        if (failure === undefined) throw error
        resource = {
          status: failure.state,
          message: failure.message,
        }
      }
      resourceCache.set(binding.resourceId, resource)
    }

    if (resource.status !== 'usable') {
      bindings.push(freezeBinding({
        state: resource.status,
        bindingId,
        resourceId: binding.resourceId,
        placement: binding.placement,
        order: binding.order,
        message: resource.message,
      }))
      continue
    }

    const { content, revision } = resource.snapshot.resource
    if (content === '') {
      bindings.push(freezeBinding({
        state: 'empty-content',
        bindingId,
        resourceId: binding.resourceId,
        placement: binding.placement,
        order: binding.order,
      }))
      continue
    }

    const resolved = freezeBinding({
      state: 'eligible',
      bindingId,
      resourceId: binding.resourceId,
      placement: binding.placement,
      order: binding.order,
      content,
      resourceRevision: revision,
    } satisfies Extract<PromptBindingPlanState, { state: 'eligible' }>)
    bindings.push(resolved)
    eligible.push(resolved)
  }

  return Object.freeze({
    bindings: Object.freeze(bindings),
    eligible: Object.freeze(eligible),
  })
}
