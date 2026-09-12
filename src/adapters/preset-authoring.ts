import type { Context } from '@deepseek-ai/cordis'

import { ContextManagerError } from '../domain/errors.js'

interface NativePresetReadCapability {
  read(id: string): Promise<unknown>
}

interface NativePresetCopyCapability {
  copy(from: string, id: string, name?: string): Promise<unknown>
}

interface NativePresetRemoveCapability {
  remove(id: string): Promise<unknown>
}

function unsupportedApi(message: string): Error {
  return new Error(`dsh-context-manager: unsupported agentPresets authoring API; ${message}`)
}

function unavailable(): ContextManagerError {
  return new ContextManagerError(
    'preset-authoring-unavailable',
    'native AgentPreset authoring is unavailable because the agentPresets Host service is not composed',
  )
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`dsh-context-manager: ${label} must be a string`)
  }
}

function getNativeAgentPresets(ctx: Context): Record<string, unknown> | undefined {
  const capability = ctx.get('agentPresets') as unknown
  if (capability === undefined) return undefined
  if (typeof capability !== 'object' || capability === null) {
    throw unsupportedApi('service value must be an object')
  }
  return capability as Record<string, unknown>
}

function getReadCapability(ctx: Context): NativePresetReadCapability {
  const capability = getNativeAgentPresets(ctx)
  if (capability === undefined) throw unavailable()
  if (typeof capability.read !== 'function') {
    throw unsupportedApi('expected read()')
  }
  return capability as unknown as NativePresetReadCapability
}

function getCopyCapability(ctx: Context): NativePresetCopyCapability {
  const capability = getNativeAgentPresets(ctx)
  if (capability === undefined) throw unavailable()
  if (typeof capability.copy !== 'function') {
    throw unsupportedApi('expected copy()')
  }
  return capability as unknown as NativePresetCopyCapability
}

function getRemoveCapability(ctx: Context): NativePresetRemoveCapability {
  const capability = getNativeAgentPresets(ctx)
  if (capability === undefined) throw unavailable()
  if (typeof capability.remove !== 'function') {
    throw unsupportedApi('expected remove()')
  }
  return capability as unknown as NativePresetRemoveCapability
}

/** Read one native AgentPreset composition exactly as DSH stores it. */
export async function readNativePresetComposition(ctx: Context, id: string): Promise<string> {
  assertString(id, 'preset id')
  const content = await getReadCapability(ctx).read(id)
  if (typeof content !== 'string') {
    throw unsupportedApi('read() must resolve to a string')
  }
  return content
}

/**
 * Ask DSH to copy one native AgentPreset into its configured writable user root.
 *
 * The bridge deliberately does not preflight the roster, normalize ids/names,
 * or touch files itself. AgentPresets.copy() owns collision checks, containment,
 * whole-directory copying, metadata rewriting, standing-mount invalidation, and
 * all native refusal semantics.
 */
export async function copyNativePreset(
  ctx: Context,
  from: string,
  id: string,
  name?: string,
): Promise<void> {
  assertString(from, 'source preset id')
  assertString(id, 'target preset id')
  if (name !== undefined) assertString(name, 'preset display name')
  await getCopyCapability(ctx).copy(from, id, name)
}

/**
 * Ask DSH to remove one locally authored native AgentPreset.
 *
 * DSH remains the authority for writability, root ownership, native-default
 * cleanup, and standing-mount lifecycle. Context Manager never cascades this
 * mutation into stored profile references or live Session identity.
 */
export async function removeNativePreset(ctx: Context, id: string): Promise<void> {
  assertString(id, 'preset id')
  await getRemoveCapability(ctx).remove(id)
}
