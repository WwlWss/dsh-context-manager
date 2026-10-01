import {
  createSnapshotStore,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  type ContextManagerRemoteChangeSnapshot,
  type ContextManagerRemotePresetSnapshot,
  type ContextManagerRemoteProfilesSnapshot,
  type ContextManagerRemotePromptPlacementCapability,
} from '../remote/types.js'
import type {
  ContextManagerClientBaselineSurface,
  ContextManagerClientReadError,
  ContextManagerClientReconcileResult,
  ContextManagerClientSnapshot,
  ContextManagerClientSurface,
} from './model-types.js'
import type { ContextManagerClientReadRemote } from './remote-port.js'

const MAX_STABILIZATION_ATTEMPTS = 3

export const CONTEXT_MANAGER_BASELINE_SURFACES = Object.freeze([
  'profiles',
  'presets',
  'promptPlacement',
] as const satisfies readonly ContextManagerClientBaselineSurface[])

type BaselineSurfaceMap = {
  profiles: ContextManagerRemoteProfilesSnapshot
  presets: ContextManagerRemotePresetSnapshot
  promptPlacement: ContextManagerRemotePromptPlacementCapability
}

type ReadOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ContextManagerClientReadError }

type SurfaceEpochs = Record<ContextManagerClientBaselineSurface, number>

export interface ContextManagerClientModel {
  readonly state: SnapshotStore<ContextManagerClientSnapshot>

  attach(remote: ContextManagerClientReadRemote): () => void
  refresh(): Promise<ContextManagerClientReconcileResult>
  reconcile(
    scopes: readonly ContextManagerClientBaselineSurface[],
  ): Promise<ContextManagerClientReconcileResult>
  getProfileRevision(): number | undefined
  dispose(): void
}

function idleSurface<T>(): ContextManagerClientSurface<T> {
  return {
    status: 'idle',
    stale: false,
  }
}

function initialSnapshot(): ContextManagerClientSnapshot {
  return {
    attachment: 'detached',
    protocol: { status: 'unchecked' },
    sync: { status: 'idle' },
    profiles: idleSurface(),
    presets: idleSurface(),
    promptPlacement: idleSurface(),
  }
}

function remoteFailure(error: RemoteFailure): ContextManagerClientReadError {
  return {
    kind: 'remote',
    code: String(error.code),
    message: error.message,
  }
}

function rejectedCall(error: unknown): ContextManagerClientReadError {
  return {
    kind: 'call-rejected',
    message: error instanceof Error ? error.message : 'Remote call rejected',
  }
}

async function invokeRead<T>(
  call: () => Promise<RemoteResult<T>>,
): Promise<ReadOutcome<T>> {
  try {
    const result = await call()
    return result.ok
      ? { ok: true, value: result.value }
      : { ok: false, error: remoteFailure(result.error) }
  } catch (error) {
    return {
      ok: false,
      error: rejectedCall(error),
    }
  }
}

function uniqueSurfaces(
  scopes: readonly ContextManagerClientBaselineSurface[],
): ContextManagerClientBaselineSurface[] {
  const selected = new Set(scopes)
  return CONTEXT_MANAGER_BASELINE_SURFACES.filter(surface => selected.has(surface))
}

function cursorOf(
  surface: ContextManagerClientBaselineSurface,
  changes: ContextManagerRemoteChangeSnapshot,
): number {
  switch (surface) {
    case 'profiles':
      return changes.profiles
    case 'presets':
      return changes.presets
    case 'promptPlacement':
      return changes.runtime
  }
}

function loadingSurface<T>(
  current: ContextManagerClientSurface<T>,
): ContextManagerClientSurface<T> {
  return {
    status: 'loading',
    stale: true,
    ...(current.data === undefined ? {} : { data: current.data }),
  }
}

function failedSurface<T>(
  current: ContextManagerClientSurface<T>,
  error: ContextManagerClientReadError,
): ContextManagerClientSurface<T> {
  return {
    status: 'error',
    stale: true,
    ...(current.data === undefined ? {} : { data: current.data }),
    error,
  }
}

function readySurface<T>(data: T): ContextManagerClientSurface<T> {
  return {
    status: 'ready',
    stale: false,
    data,
  }
}

function detachedSurface<T>(
  current: ContextManagerClientSurface<T>,
): ContextManagerClientSurface<T> {
  if (current.data === undefined) return idleSurface()
  if (current.status === 'error' && current.error !== undefined) {
    return {
      status: 'error',
      stale: true,
      data: current.data,
      error: current.error,
    }
  }
  return {
    status: 'ready',
    stale: true,
    data: current.data,
  }
}

export function createContextManagerClientModel(): ContextManagerClientModel {
  const state = createSnapshotStore<ContextManagerClientSnapshot>(initialSnapshot())

  let remote: ContextManagerClientReadRemote | undefined
  let disposed = false
  let attachmentEpoch = 0
  const surfaceEpochs: SurfaceEpochs = {
    profiles: 0,
    presets: 0,
    promptPlacement: 0,
  }
  let reconcileRunEpoch = 0
  const activeReconcileRuns = new Set<number>()
  let latestCompletedRun = 0
  let latestCompletedError: ContextManagerClientReadError | undefined
  let protocolCheckEpoch = 0

  const isAttachmentCurrent = (epoch: number): boolean => (
    !disposed && remote !== undefined && attachmentEpoch === epoch
  )

  const isSurfaceCurrent = (
    attachment: number,
    surface: ContextManagerClientBaselineSurface,
    epoch: number,
  ): boolean => (
    isAttachmentCurrent(attachment) && surfaceEpochs[surface] === epoch
  )

  const resetRunBookkeeping = (): void => {
    activeReconcileRuns.clear()
    latestCompletedRun = 0
    latestCompletedError = undefined
    protocolCheckEpoch += 1
  }

  const beginReconcileRun = (attachment: number): number => {
    reconcileRunEpoch += 1
    const run = reconcileRunEpoch
    activeReconcileRuns.add(run)
    if (isAttachmentCurrent(attachment)) {
      const current = state.getSnapshot()
      state.set({
        ...current,
        sync: { status: 'syncing' },
      })
    }
    return run
  }

  const completeReconcileRun = (
    attachment: number,
    run: number,
    error?: ContextManagerClientReadError,
  ): void => {
    activeReconcileRuns.delete(run)
    if (run > latestCompletedRun) {
      latestCompletedRun = run
      latestCompletedError = error
    }
    if (!isAttachmentCurrent(attachment)) return

    const current = state.getSnapshot()
    if (activeReconcileRuns.size > 0) {
      state.set({
        ...current,
        sync: { status: 'syncing' },
      })
      return
    }

    state.set({
      ...current,
      sync: latestCompletedError === undefined
        ? { status: 'idle' }
        : { status: 'error', error: latestCompletedError },
    })
  }

  const beginProtocolCheck = (attachment: number): number => {
    protocolCheckEpoch += 1
    const token = protocolCheckEpoch
    if (isAttachmentCurrent(attachment)) {
      const current = state.getSnapshot()
      state.set({
        ...current,
        protocol: { status: 'checking' },
      })
    }
    return token
  }

  const publishProtocol = (
    attachment: number,
    token: number,
    protocol: ContextManagerClientSnapshot['protocol'],
  ): void => {
    if (!isAttachmentCurrent(attachment) || protocolCheckEpoch !== token) return
    const current = state.getSnapshot()
    state.set({
      ...current,
      protocol,
    })
  }

  const replaceSurface = <Surface extends ContextManagerClientBaselineSurface>(
    surface: Surface,
    next: ContextManagerClientSurface<BaselineSurfaceMap[Surface]>,
  ): void => {
    const current = state.getSnapshot()
    state.set({
      ...current,
      [surface]: next,
    })
  }

  const invalidateAllSurfaceEpochs = (): void => {
    for (const surface of CONTEXT_MANAGER_BASELINE_SURFACES) {
      surfaceEpochs[surface] += 1
    }
  }

  const clearAuthority = (instanceId?: string): void => {
    invalidateAllSurfaceEpochs()
    const current = state.getSnapshot()
    state.set({
      ...current,
      instanceId,
      changes: undefined,
      profiles: idleSurface(),
      presets: idleSurface(),
      promptPlacement: idleSurface(),
    })
  }

  const resetForInstance = (instanceId: string): void => {
    const current = state.getSnapshot()
    if (current.instanceId === instanceId) return
    clearAuthority(instanceId)
  }

  const adoptChanges = (next: ContextManagerRemoteChangeSnapshot): void => {
    const current = state.getSnapshot()
    if (current.instanceId !== undefined && current.instanceId !== next.instanceId) return
    if (
      current.changes !== undefined
      && current.changes.instanceId === next.instanceId
      && current.changes.generation > next.generation
    ) {
      return
    }
    state.set({
      ...current,
      instanceId: next.instanceId,
      changes: next,
    })
  }

  const markRequestedLoading = (
    scopes: readonly ContextManagerClientBaselineSurface[],
  ): Partial<SurfaceEpochs> => {
    const tokens: Partial<SurfaceEpochs> = {}
    let next = state.getSnapshot()

    for (const surface of scopes) {
      surfaceEpochs[surface] += 1
      tokens[surface] = surfaceEpochs[surface]
      next = {
        ...next,
        [surface]: loadingSurface(next[surface] as never),
      }
    }

    state.set(next)
    return tokens
  }

  const retokenizeAfterReset = (
    scopes: readonly ContextManagerClientBaselineSurface[],
    tokens: Partial<SurfaceEpochs>,
  ): void => {
    const nextTokens = markRequestedLoading(scopes)
    for (const surface of scopes) tokens[surface] = nextTokens[surface]
  }

  const failScopes = (
    attachment: number,
    scopes: readonly ContextManagerClientBaselineSurface[],
    tokens: Partial<SurfaceEpochs>,
    error: ContextManagerClientReadError,
  ): void => {
    for (const surface of scopes) {
      const token = tokens[surface]
      if (token === undefined || !isSurfaceCurrent(attachment, surface, token)) continue
      const current = state.getSnapshot()[surface] as ContextManagerClientSurface<BaselineSurfaceMap[typeof surface]>
      replaceSurface(surface, failedSurface(current, error) as never)
    }
  }

  const readSurface = async <Surface extends ContextManagerClientBaselineSurface>(
    currentRemote: ContextManagerClientReadRemote,
    surface: Surface,
  ): Promise<ReadOutcome<BaselineSurfaceMap[Surface]>> => {
    switch (surface) {
      case 'profiles':
        return invokeRead(() => currentRemote.profiles()) as Promise<ReadOutcome<BaselineSurfaceMap[Surface]>>
      case 'presets':
        return invokeRead(() => currentRemote.presets()) as Promise<ReadOutcome<BaselineSurfaceMap[Surface]>>
      case 'promptPlacement':
        return invokeRead(() => currentRemote.promptPlacement()) as Promise<ReadOutcome<BaselineSurfaceMap[Surface]>>
    }
  }

  const reconcile = async (
    requestedScopes: readonly ContextManagerClientBaselineSurface[],
  ): Promise<ContextManagerClientReconcileResult> => {
    const attempted = uniqueSurfaces(requestedScopes)
    if (disposed) return { status: 'disposed', attempted }
    if (remote === undefined) return { status: 'detached', attempted }
    if (attempted.length === 0) return { status: 'completed', attempted }

    const attachment = attachmentEpoch
    const currentRemote = remote
    const run = beginReconcileRun(attachment)
    const tokens = markRequestedLoading(attempted)
    let pending = [...attempted]

    for (let attempt = 1; attempt <= MAX_STABILIZATION_ATTEMPTS; attempt += 1) {
      if (!isAttachmentCurrent(attachment)) {
        completeReconcileRun(attachment, run)
        return disposed
          ? { status: 'disposed', attempted }
          : { status: 'detached', attempted }
      }

      const protocolToken = beginProtocolCheck(attachment)
      const protocol = await invokeRead(() => currentRemote.protocol())
      if (!isAttachmentCurrent(attachment)) {
        completeReconcileRun(attachment, run)
        return disposed
          ? { status: 'disposed', attempted }
          : { status: 'detached', attempted }
      }

      if (!protocol.ok) {
        publishProtocol(attachment, protocolToken, {
          status: 'error',
          error: protocol.error,
        })
        failScopes(attachment, pending, tokens, protocol.error)
        completeReconcileRun(attachment, run, protocol.error)
        return { status: 'completed', attempted }
      }

      if (protocol.value.apiVersion !== CONTEXT_MANAGER_REMOTE_API_VERSION) {
        if (protocolCheckEpoch === protocolToken) {
          clearAuthority()
          publishProtocol(attachment, protocolToken, {
            status: 'incompatible',
            expected: CONTEXT_MANAGER_REMOTE_API_VERSION,
            actual: protocol.value.apiVersion,
          })
        }
        completeReconcileRun(attachment, run)
        return { status: 'incompatible', attempted }
      }

      publishProtocol(attachment, protocolToken, {
        status: 'compatible',
        apiVersion: protocol.value.apiVersion,
      })

      const before = await invokeRead(() => currentRemote.changes())
      if (!isAttachmentCurrent(attachment)) {
        completeReconcileRun(attachment, run)
        return disposed
          ? { status: 'disposed', attempted }
          : { status: 'detached', attempted }
      }
      if (!before.ok) {
        failScopes(attachment, pending, tokens, before.error)
        completeReconcileRun(attachment, run, before.error)
        return { status: 'completed', attempted }
      }

      if (
        state.getSnapshot().instanceId !== undefined
        && state.getSnapshot().instanceId !== before.value.instanceId
      ) {
        resetForInstance(before.value.instanceId)
        retokenizeAfterReset(attempted, tokens)
        pending = [...attempted]
      } else if (state.getSnapshot().instanceId === undefined) {
        const current = state.getSnapshot()
        state.set({
          ...current,
          instanceId: before.value.instanceId,
        })
      }
      adoptChanges(before.value)

      const reads = new Map<
        ContextManagerClientBaselineSurface,
        ReadOutcome<BaselineSurfaceMap[ContextManagerClientBaselineSurface]>
      >()
      await Promise.all(pending.map(async surface => {
        reads.set(surface, await readSurface(currentRemote, surface))
      }))

      const after = await invokeRead(() => currentRemote.changes())
      if (!isAttachmentCurrent(attachment)) {
        completeReconcileRun(attachment, run)
        return disposed
          ? { status: 'disposed', attempted }
          : { status: 'detached', attempted }
      }
      if (!after.ok) {
        failScopes(attachment, pending, tokens, after.error)
        completeReconcileRun(attachment, run, after.error)
        return { status: 'completed', attempted }
      }

      if (before.value.instanceId !== after.value.instanceId) {
        resetForInstance(after.value.instanceId)
        retokenizeAfterReset(attempted, tokens)
        pending = [...attempted]
        adoptChanges(after.value)
        continue
      }

      adoptChanges(after.value)

      const retry: ContextManagerClientBaselineSurface[] = []
      for (const surface of pending) {
        const token = tokens[surface]
        if (token === undefined || !isSurfaceCurrent(attachment, surface, token)) continue

        const read = reads.get(surface)
        if (read === undefined) continue

        if (!read.ok) {
          const current = state.getSnapshot()[surface] as ContextManagerClientSurface<BaselineSurfaceMap[typeof surface]>
          replaceSurface(surface, failedSurface(current, read.error) as never)
          continue
        }

        if (cursorOf(surface, before.value) !== cursorOf(surface, after.value)) {
          retry.push(surface)
          continue
        }

        replaceSurface(surface, readySurface(read.value) as never)
      }

      pending = retry
      if (pending.length === 0) {
        completeReconcileRun(attachment, run)
        return { status: 'completed', attempted }
      }
    }

    const unstable: ContextManagerClientReadError = {
      kind: 'unstable-snapshot',
      attempts: MAX_STABILIZATION_ATTEMPTS,
    }
    failScopes(attachment, pending, tokens, unstable)

    completeReconcileRun(attachment, run, unstable)
    return { status: 'completed', attempted }
  }

  const attach = (nextRemote: ContextManagerClientReadRemote): (() => void) => {
    if (disposed) {
      throw new Error('Context Manager Client model is disposed')
    }

    attachmentEpoch += 1
    const attachedEpoch = attachmentEpoch
    remote = nextRemote
    resetRunBookkeeping()

    {
      const current = state.getSnapshot()
      state.set({
        ...current,
        attachment: 'attached',
        protocol: { status: 'unchecked' },
        sync: { status: 'idle' },
        profiles: detachedSurface(current.profiles),
        presets: detachedSurface(current.presets),
        promptPlacement: detachedSurface(current.promptPlacement),
      })
    }

    void reconcile(CONTEXT_MANAGER_BASELINE_SURFACES)

    return () => {
      if (disposed || attachmentEpoch !== attachedEpoch || remote !== nextRemote) return
      attachmentEpoch += 1
      remote = undefined
      resetRunBookkeeping()
      invalidateAllSurfaceEpochs()
      const current = state.getSnapshot()
      state.set({
        ...current,
        attachment: 'detached',
        protocol: { status: 'unchecked' },
        sync: { status: 'idle' },
        profiles: detachedSurface(current.profiles),
        presets: detachedSurface(current.presets),
        promptPlacement: detachedSurface(current.promptPlacement),
      })
    }
  }

  const getProfileRevision = (): number | undefined => {
    const snapshot = state.getSnapshot()
    if (
      snapshot.profiles.status !== 'ready'
      || snapshot.profiles.stale
      || snapshot.profiles.data === undefined
    ) {
      return undefined
    }
    return snapshot.profiles.data.persistence.revision
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    attachmentEpoch += 1
    remote = undefined
    resetRunBookkeeping()
    invalidateAllSurfaceEpochs()
    const current = state.getSnapshot()
    state.set({
      ...current,
      attachment: 'detached',
      protocol: { status: 'unchecked' },
      sync: { status: 'idle' },
      profiles: detachedSurface(current.profiles),
      presets: detachedSurface(current.presets),
      promptPlacement: detachedSurface(current.promptPlacement),
    })
  }

  return Object.freeze({
    state,
    attach,
    refresh: () => reconcile(CONTEXT_MANAGER_BASELINE_SURFACES),
    reconcile,
    getProfileRevision,
    dispose,
  })
}
