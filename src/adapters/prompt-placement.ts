import type { Context } from '@deepseek-ai/cordis'

import type { PromptPlacement } from '../domain/model.js'

export type NativePromptPlacementTarget =
  | {
      readonly channel: 'section'
      readonly order: number
    }
  | {
      readonly channel: 'runtime-context'
      readonly order: number
    }

export type NativePromptPlacementCompatibility =
  | {
      readonly status: 'unavailable'
    }
  | {
      readonly status: 'available'
      readonly targets: Readonly<Record<PromptPlacement, Readonly<NativePromptPlacementTarget>>>
    }

interface HostSystemPromptCapability {
  readonly section: Function
  readonly context: Function
  readonly getSectionOrder?: Function
  readonly getContextOrder?: Function
}

const UNAVAILABLE: NativePromptPlacementCompatibility = Object.freeze({
  status: 'unavailable',
})

function unsupportedApi(detail: string): TypeError {
  return new TypeError(`dsh-context-manager: unsupported systemPrompt API; ${detail}`)
}

function requireCapability(value: unknown): HostSystemPromptCapability {
  if (typeof value !== 'object' || value === null) {
    throw unsupportedApi('service value must be an object')
  }

  const candidate = value as Record<string, unknown>
  if (typeof candidate.section !== 'function') {
    throw unsupportedApi('expected section()')
  }
  if (typeof candidate.context !== 'function') {
    throw unsupportedApi('expected context()')
  }

  return value as HostSystemPromptCapability
}

function target(
  channel: NativePromptPlacementTarget['channel'],
  order: number,
): Readonly<NativePromptPlacementTarget> {
  return Object.freeze({ channel, order }) as Readonly<NativePromptPlacementTarget>
}

function freezeTargets(
  targets: Record<PromptPlacement, Readonly<NativePromptPlacementTarget>>,
): Readonly<Record<PromptPlacement, Readonly<NativePromptPlacementTarget>>> {
  return Object.freeze(targets)
}

const EXTENSION_STEP = 0.5

const LEGACY_TARGETS = freezeTargets({
  'before-persona': target('section', -EXTENSION_STEP),
  'after-persona': target('section', EXTENSION_STEP),
  'before-tool-guidance': target('section', 100 - EXTENSION_STEP),
  'after-tool-guidance': target('section', 199 + EXTENSION_STEP),
  'runtime-context': target('runtime-context', 120 + EXTENSION_STEP),
})

function readNamedOrder(
  capability: HostSystemPromptCapability,
  method: 'getSectionOrder' | 'getContextOrder',
  name: string,
): number {
  const reader = capability[method]
  if (typeof reader !== 'function') {
    throw unsupportedApi(`expected ${method}()`)
  }

  const value = reader.call(capability, name) as unknown
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw unsupportedApi(`${method}(${JSON.stringify(name)}) must return a safe integer`)
  }
  return value
}

function namedTargets(
  capability: HostSystemPromptCapability,
): Readonly<Record<PromptPlacement, Readonly<NativePromptPlacementTarget>>> {
  const firstToolGuidance = readNamedOrder(capability, 'getSectionOrder', 'TOOL_BASH')
  const generatedToolProtocol = readNamedOrder(capability, 'getSectionOrder', 'TOOLS_SDK')
  const nativeContextTail = readNamedOrder(
    capability,
    'getContextOrder',
    'SUBAGENT_DELEGATION',
  )

  // Persona opening is order 0 on every retained public DSH generation.
  // Keep the semantic anchor adjacent to that stable public slot instead of
  // probing generation-specific DEPLOYMENT_PERSONA(_PREFIX) names.
  const beforePersona = -EXTENSION_STEP
  const afterPersona = EXTENSION_STEP
  const beforeToolGuidance = firstToolGuidance - EXTENSION_STEP
  const afterToolGuidance = generatedToolProtocol - EXTENSION_STEP
  const runtimeContext = nativeContextTail + EXTENSION_STEP

  if (beforeToolGuidance <= afterPersona) {
    throw unsupportedApi(
      'TOOL_BASH placement leaves no extension slot after persona and before tool guidance',
    )
  }
  if (afterToolGuidance <= firstToolGuidance) {
    throw unsupportedApi(
      'TOOLS_SDK placement leaves no extension slot after ordinary tool guidance',
    )
  }
  if (!Number.isFinite(runtimeContext)) {
    throw unsupportedApi(
      'SUBAGENT_DELEGATION placement leaves no finite runtime-context extension order',
    )
  }

  return freezeTargets({
    'before-persona': target('section', beforePersona),
    'after-persona': target('section', afterPersona),
    'before-tool-guidance': target('section', beforeToolGuidance),
    'after-tool-guidance': target('section', afterToolGuidance),
    'runtime-context': target('runtime-context', runtimeContext),
  })
}

/**
 * Observe the public DSH system-prompt placement contract without registering
 * any Context Manager contribution.
 *
 * The legacy supported line has section/context registration but no named-order
 * helpers. Every newer retained line exposes both helpers. A partial helper
 * surface is treated as an incompatible Host API rather than guessed from a
 * version string.
 */
export function observeNativePromptPlacementCompatibility(
  ctx: Context,
): NativePromptPlacementCompatibility {
  const raw = ctx.get('systemPrompt') as unknown
  if (raw === undefined) return UNAVAILABLE

  const capability = requireCapability(raw)
  const sectionOrders = capability.getSectionOrder
  const contextOrders = capability.getContextOrder

  if (sectionOrders === undefined && contextOrders === undefined) {
    return Object.freeze({
      status: 'available',
      targets: LEGACY_TARGETS,
    })
  }

  if (typeof sectionOrders !== 'function' || typeof contextOrders !== 'function') {
    throw unsupportedApi(
      'getSectionOrder() and getContextOrder() must either both be present or both be absent',
    )
  }

  return Object.freeze({
    status: 'available',
    targets: namedTargets(capability),
  })
}
