import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ContextManagerRemotePresetReceipt,
  ContextManagerRemoteResult,
} from '../remote/types.js'
import type { ContextManagerClientPresetMutationRemote } from './preset-remote-port.js'
import type {
  ContextManagerClientPresetMutationController,
  ContextManagerClientPresetMutationKind,
  ContextManagerClientPresetMutationResult,
  ContextManagerClientPresetMutationSnapshot,
} from './preset-mutation-types.js'

export interface ContextManagerPresetRosterObservation {
  readonly status: 'ready' | 'stale'
  readonly ids: readonly string[]
  readonly authorable: boolean
}

export interface ContextManagerPresetMutationControllerDeps {
  readonly getRemote: () => ContextManagerClientPresetMutationRemote | undefined
  readonly getLifecycle: () => 'attached' | 'detached' | 'disposed'
  readonly getProtocolStatus: () => 'unchecked' | 'checking' | 'compatible' | 'incompatible' | 'error'
  /** Source-of-truth read observation, not a native revision or write lock. */
  readonly getRoster: () => ContextManagerPresetRosterObservation | undefined
  /** Only one authoritative *read-back*. Never dispatch another native write. */
  readonly rehydrate: () => Promise<boolean>
}

type RpcResult = RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePresetReceipt>>
type Invocation =
  | { readonly kind: 'success' }
  | {
      readonly kind: 'business'
      readonly code: string
      readonly message: string
    }
  | {
      readonly kind: 'transport'
      readonly error: { readonly kind: 'remote' | 'call-rejected'; readonly code?: string; readonly message: string }
    }

async function invoke(call: () => Promise<RpcResult>): Promise<Invocation> {
  try {
    const outer = await call()
    if (!outer.ok) return {
      kind: 'transport',
      error: { kind: 'remote', code: String(outer.error.code), message: outer.error.message },
    }
    if (!outer.value.ok) return {
      kind: 'business',
      code: outer.value.error.code,
      message: outer.value.error.message,
    }
    return { kind: 'success' }
  } catch {
    // The Host call may already have taken effect; never infer "not written".
    return { kind: 'transport', error: { kind: 'call-rejected', message: 'Native Preset call outcome unknown' } }
  }
}

/**
 * Isolated native-authoring operation lane. This is deliberately NOT a
 * settings/profile mutation controller, source-of-truth roster or fake CAS.
 */
export function createContextManagerPresetMutationController(
  deps: ContextManagerPresetMutationControllerDeps,
): {
  readonly controller: ContextManagerClientPresetMutationController
  readonly reset: () => void
} {
  const state = createSnapshotStore<ContextManagerClientPresetMutationSnapshot>({
    preset: { status: 'idle' },
  })
  let epoch = 0
  let nextId = 0
  let activeId: number | undefined

  const reset = (): void => {
    epoch += 1
    activeId = undefined
    state.set({ preset: { status: 'idle' } })
  }
  const current = (e: number, id: number): boolean => epoch === e && activeId === id
  const lifetime = (): ContextManagerClientPresetMutationResult | undefined => {
    const value = deps.getLifecycle()
    if (value === 'detached') return { status: 'detached' }
    if (value === 'disposed') return { status: 'disposed' }
    if (deps.getProtocolStatus() === 'incompatible') return { status: 'incompatible' }
    return undefined
  }
  const obsolete = (): ContextManagerClientPresetMutationResult =>
    lifetime() ?? { status: 'superseded' }
  const reject = (code: string, message: string): ContextManagerClientPresetMutationResult => ({
    status: 'rejected',
    refresh: 'not-requested',
    error: { kind: 'precondition', code, message },
  })
  const check = (
    kind: ContextManagerClientPresetMutationKind,
    args: readonly string[],
  ): ContextManagerClientPresetMutationResult | undefined => {
    const stopped = lifetime()
    if (stopped) return stopped
    if (deps.getProtocolStatus() !== 'compatible') return reject('protocol-unavailable', 'Remote v3 is not verified')
    const roster = deps.getRoster()
    if (!roster || roster.status !== 'ready') return reject('preset-roster-unavailable', 'Fresh native Preset roster required')
    if (kind === 'copy') {
      if (!roster.authorable) return reject('preset-authoring-unavailable', 'Native authoring is unavailable')
      if (args[0]?.length === 0 || args[1]?.length === 0) return reject('invalid-preset-id', 'Nonempty IDs required')
      if (!roster.ids.includes(args[0] ?? '')) return reject('preset-source-unavailable', 'Source Preset is absent')
      if (args[0] === args[1] || roster.ids.includes(args[1] ?? '')) {
        return reject('preset-target-exists', 'Target Preset already exists')
      }
    } else {
      if (args[0]?.length === 0) return reject('invalid-preset-id', 'Nonempty ID required')
      if (!roster.ids.includes(args[0] ?? '')) return reject('preset-target-unavailable', 'Target Preset is absent')
      // Trust and default flags are deliberately not local write authorization.
    }
    return undefined
  }
  const settle = (
    e: number,
    id: number,
    kind: ContextManagerClientPresetMutationKind,
    result: ContextManagerClientPresetMutationResult,
  ): ContextManagerClientPresetMutationResult => {
    if (!current(e, id)) return obsolete()
    activeId = undefined
    state.set({ preset: { status: 'settled', id, kind, result } })
    return epoch === e ? result : obsolete()
  }
  const run = async (
    kind: ContextManagerClientPresetMutationKind,
    args: readonly string[],
    invokeNative: (remote: ContextManagerClientPresetMutationRemote) => Promise<RpcResult>,
  ): Promise<ContextManagerClientPresetMutationResult> => {
    // Claim synchronously. A rejected second action must not disturb the owner.
    if (activeId !== undefined) return reject('busy', 'A native Preset mutation is already in flight')
    const firstCheck = check(kind, args)
    if (firstCheck) return firstCheck
    const remote = deps.getRemote()
    if (!remote) return { status: 'detached' }
    const id = ++nextId
    const e = epoch
    activeId = id
    state.set({ preset: { status: 'running', id, kind, phase: 'mutating' } })
    if (!current(e, id)) return obsolete()
    if (deps.getRemote() !== remote) return settle(e, id, kind, { status: 'superseded' })
    const afterClaim = check(kind, args)
    if (afterClaim) return settle(e, id, kind, afterClaim)

    // Exactly one dispatched write, with the captured exact strings.
    const result = await invoke(() => invokeNative(remote))
    if (!current(e, id)) return obsolete()
    state.set({ preset: { status: 'running', id, kind, phase: 'rehydrating' } })
    if (!current(e, id)) return obsolete()
    let fresh = false
    try {
      fresh = await deps.rehydrate()
    } catch {
      fresh = false
    }
    if (!current(e, id)) return obsolete()
    const refresh = fresh ? 'fresh' : 'degraded'
    if (result.kind === 'success') return settle(e, id, kind, { status: 'applied', refresh })
    if (result.kind === 'transport') return settle(e, id, kind, {
      status: 'unknown', error: result.error, refresh,
    })
    return settle(e, id, kind, {
      status: 'rejected', refresh,
      error: { kind: 'business', code: result.code, message: result.message },
    })
  }
  const controller: ContextManagerClientPresetMutationController = Object.freeze({
    state,
    copyPreset(from, id, name) {
      // null and '' intentionally differ. Neither IDs nor display name are normalized.
      return run('copy', [from, id, name ?? ''], remote => remote.copyPreset(from, id, name))
    },
    removePreset(id) {
      return run('remove', [id], remote => remote.removePreset(id))
    },
  })
  return Object.freeze({ controller, reset })
}
