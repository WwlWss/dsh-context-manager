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

const MAX_PROTOCOL_ATTEMPTS = 3
const MAX_STABILIZATION_ATTEMPTS = 3
const MAX_AUTHORITY_RESTARTS = 3

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

type AuthorityTransition =
  | { readonly status: 'same' }
  | {
      readonly status: 'changed'
      readonly authority: number
    }
  | { readonly status: 'superseded' }

type ProtocolGuardOutcome =
  | { readonly status: 'compatible' }
  | {
      readonly status: 'error'
      readonly error: ContextManagerClientReadError
      readonly token: number
    }
  | {
      readonly status: 'incompatible'
      readonly actual: number
      readonly token: number
    }
  | {
      readonly status: 'attachment-stale' | 'authority-stale' | 'superseded'
    }

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
  let authorityEpoch = 0
  const activeReconcileRuns = new Set<number>()
  let latestCompletedRun = 0
  let latestCompletedError: ContextManagerClientReadError | undefined
  let protocolCheckEpoch = 0

  const isAttachmentCurrent = (epoch: number): boolean => (
    !disposed && remote !== undefined && attachmentEpoch === epoch
  )

  const isAuthorityCurrent = (
    attachment: number,
    authority: number,
  ): boolean => (
    isAttachmentCurrent(attachment) && authorityEpoch === authority
  )

  const isSurfaceCurrent = (
    attachment: number,
    authority: number,
    surface: ContextManagerClientBaselineSurface,
    epoch: number,
  ): boolean => (
    isAuthorityCurrent(attachment, authority)
    && surfaceEpochs[surface] === epoch
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
    authority: number,
    run: number,
    error?: ContextManagerClientReadError,
  ): void => {
    activeReconcileRuns.delete(run)
    if (authority === authorityEpoch && run > latestCompletedRun) {
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

  const beginProtocolCheck = (
    attachment: number,
    authority: number,
  ): number => {
    protocolCheckEpoch += 1
    const token = protocolCheckEpoch
    if (isAuthorityCurrent(attachment, authority)) {
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
    authority: number,
    token: number,
    protocol: ContextManagerClientSnapshot['protocol'],
  ): void => {
    if (
      !isAttachmentCurrent(attachment)
      || authority !== authorityEpoch
      || protocolCheckEpoch !== token
    ) return
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
    authorityEpoch += 1
    latestCompletedRun = 0
    latestCompletedError = undefined
    protocolCheckEpoch += 1
    invalidateAllSurfaceEpochs()
    const current = state.getSnapshot()
    state.set({
      ...current,
      instanceId,
      changes: undefined,
      protocol: { status: 'unchecked' },
      profiles: idleSurface(),
      presets: idleSurface(),
      promptPlacement: idleSurface(),
    })
  }

  const transitionAuthority = (
    attachment: number,
    expectedAuthority: number,
    instanceId: string,
  ): AuthorityTransition => {
    if (!isAuthorityCurrent(attachment, expectedAuthority)) {
      return { status: 'superseded' }
    }

    const current = state.getSnapshot()
    if (current.instanceId === instanceId) {
      return { status: 'same' }
    }

    clearAuthority(instanceId)
    return {
      status: 'changed',
      authority: authorityEpoch,
    }
  }

  const adoptChanges = (
    attachment: number,
    authority: number,
    next: ContextManagerRemoteChangeSnapshot,
  ): boolean => {
    if (!isAuthorityCurrent(attachment, authority)) return false

    const current = state.getSnapshot()
    if (current.instanceId !== next.instanceId) return false
    if (
      current.changes !== undefined
      && current.changes.instanceId === next.instanceId
      && current.changes.generation > next.generation
    ) {
      return false
    }

    state.set({
      ...current,
      changes: next,
    })
    return true
  }

  const reserveRequestedSurfaces = (
    scopes: readonly ContextManagerClientBaselineSurface[],
  ): Partial<SurfaceEpochs> => {
    const tokens: Partial<SurfaceEpochs> = {}
    for (const surface of scopes) {
      surfaceEpochs[surface] += 1
      tokens[surface] = surfaceEpochs[surface]
    }
    return tokens
  }

  const markScopesLoading = (
    attachment: number,
    authority: number,
    scopes: readonly ContextManagerClientBaselineSurface[],
    tokens: Partial<SurfaceEpochs>,
  ): void => {
    let next = state.getSnapshot()
    let changed = false

    for (const surface of scopes) {
      const token = tokens[surface]
      if (
        token === undefined
        || !isSurfaceCurrent(attachment, authority, surface, token)
      ) continue

      next = {
        ...next,
        [surface]: loadingSurface(next[surface] as never),
      }
      changed = true
    }

    if (changed) state.set(next)
  }

  const failScopes = (
    attachment: number,
    authority: number,
    scopes: readonly ContextManagerClientBaselineSurface[],
    tokens: Partial<SurfaceEpochs>,
    error: ContextManagerClientReadError,
  ): void => {
    for (const surface of scopes) {
      const token = tokens[surface]
      if (
        token === undefined
        || !isSurfaceCurrent(attachment, authority, surface, token)
      ) continue

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

  const guardProtocol = async (
    currentRemote: ContextManagerClientReadRemote,
    attachment: number,
    authority: number,
  ): Promise<ProtocolGuardOutcome> => {
    for (let attempt = 1; attempt <= MAX_PROTOCOL_ATTEMPTS; attempt += 1) {
      if (!isAttachmentCurrent(attachment)) {
        return { status: 'attachment-stale' }
      }
      if (authority !== authorityEpoch) {
        return { status: 'authority-stale' }
      }

      const token = beginProtocolCheck(attachment, authority)
      const protocol = await invokeRead(() => currentRemote.protocol())

      if (!isAttachmentCurrent(attachment)) {
        return { status: 'attachment-stale' }
      }
      if (authority !== authorityEpoch) {
        return { status: 'authority-stale' }
      }

      const tokenIsCurrent = protocolCheckEpoch === token
      if (!protocol.ok) {
        if (!tokenIsCurrent) continue

        publishProtocol(attachment, authority, token, {
          status: 'error',
          error: protocol.error,
        })
        return {
          status: 'error',
          error: protocol.error,
          token,
        }
      }

      if (protocol.value.apiVersion !== CONTEXT_MANAGER_REMOTE_API_VERSION) {
        if (!tokenIsCurrent) continue

        return {
          status: 'incompatible',
          actual: protocol.value.apiVersion,
          token,
        }
      }

      publishProtocol(attachment, authority, token, {
        status: 'compatible',
        apiVersion: protocol.value.apiVersion,
      })
      return { status: 'compatible' }
    }

    return { status: 'superseded' }
  }

  const reconcile = async (
    requestedScopes: readonly ContextManagerClientBaselineSurface[],
  ): Promise<ContextManagerClientReconcileResult> => {
    const attempted = uniqueSurfaces(requestedScopes)
    if (disposed) return { status: 'disposed', attempted }
    if (remote === undefined) return { status: 'detached', attempted }
    if (attempted.length === 0) return { status: 'completed', attempted }

    const attachment = attachmentEpoch
    let authority = authorityEpoch
    const currentRemote = remote
    const run = beginReconcileRun(attachment)
    let tokens = reserveRequestedSurfaces(attempted)
    let authorityRestarts = 0

    const detachedResult = (): ContextManagerClientReconcileResult => (
      disposed
        ? { status: 'disposed', attempted }
        : { status: 'detached', attempted }
    )

    const completeStaleAuthority = (): ContextManagerClientReconcileResult => {
      completeReconcileRun(attachment, authority, run)
      return { status: 'completed', attempted }
    }

    const acceptAuthorityTransition = (
      transition: AuthorityTransition,
    ): 'same' | 'changed' | 'superseded' => {
      if (transition.status !== 'changed') return transition.status

      authority = transition.authority
      authorityRestarts += 1
      tokens = reserveRequestedSurfaces(attempted)
      return 'changed'
    }

    const failUnstableAuthority = (): ContextManagerClientReconcileResult => {
      const unstable: ContextManagerClientReadError = {
        kind: 'unstable-authority',
        attempts: MAX_AUTHORITY_RESTARTS,
      }
      failScopes(attachment, authority, attempted, tokens, unstable)
      completeReconcileRun(attachment, authority, run, unstable)
      return { status: 'completed', attempted }
    }

    authorityLoop:
    while (true) {
      if (!isAttachmentCurrent(attachment)) {
        completeReconcileRun(attachment, authority, run)
        return detachedResult()
      }
      if (authority !== authorityEpoch) {
        return completeStaleAuthority()
      }

      const protocol = await guardProtocol(currentRemote, attachment, authority)
      switch (protocol.status) {
        case 'attachment-stale':
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        case 'authority-stale':
        case 'superseded':
          return completeStaleAuthority()
        case 'error':
          if (
            !isAuthorityCurrent(attachment, authority)
            || protocolCheckEpoch !== protocol.token
          ) {
            continue authorityLoop
          }
          failScopes(attachment, authority, attempted, tokens, protocol.error)
          completeReconcileRun(attachment, authority, run, protocol.error)
          return { status: 'completed', attempted }
        case 'incompatible': {
          if (
            !isAuthorityCurrent(attachment, authority)
            || protocolCheckEpoch !== protocol.token
          ) {
            continue authorityLoop
          }

          clearAuthority()
          authority = authorityEpoch
          if (isAttachmentCurrent(attachment)) {
            const current = state.getSnapshot()
            state.set({
              ...current,
              protocol: {
                status: 'incompatible',
                expected: CONTEXT_MANAGER_REMOTE_API_VERSION,
                actual: protocol.actual,
              },
            })
          }
          completeReconcileRun(attachment, authority, run)
          return { status: 'incompatible', attempted }
        }
        case 'compatible':
          break
      }

      let pending = [...attempted]

      for (let attempt = 1; attempt <= MAX_STABILIZATION_ATTEMPTS; attempt += 1) {
        const before = await invokeRead(() => currentRemote.changes())
        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeStaleAuthority()
        }
        if (!before.ok) {
          failScopes(attachment, authority, pending, tokens, before.error)
          completeReconcileRun(attachment, authority, run, before.error)
          return { status: 'completed', attempted }
        }

        const beforeTransition = acceptAuthorityTransition(
          transitionAuthority(
            attachment,
            authority,
            before.value.instanceId,
          ),
        )
        if (beforeTransition === 'superseded') {
          return completeStaleAuthority()
        }
        if (beforeTransition === 'changed') {
          if (authorityRestarts >= MAX_AUTHORITY_RESTARTS) {
            return failUnstableAuthority()
          }
          continue authorityLoop
        }

        adoptChanges(attachment, authority, before.value)
        markScopesLoading(attachment, authority, pending, tokens)

        const reads = new Map<
          ContextManagerClientBaselineSurface,
          ReadOutcome<BaselineSurfaceMap[ContextManagerClientBaselineSurface]>
        >()
        await Promise.all(pending.map(async surface => {
          reads.set(surface, await readSurface(currentRemote, surface))
        }))

        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeStaleAuthority()
        }

        const after = await invokeRead(() => currentRemote.changes())
        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeStaleAuthority()
        }
        if (!after.ok) {
          failScopes(attachment, authority, pending, tokens, after.error)
          completeReconcileRun(attachment, authority, run, after.error)
          return { status: 'completed', attempted }
        }

        const afterTransition = acceptAuthorityTransition(
          transitionAuthority(
            attachment,
            authority,
            after.value.instanceId,
          ),
        )
        if (afterTransition === 'superseded') {
          return completeStaleAuthority()
        }
        if (afterTransition === 'changed') {
          if (authorityRestarts >= MAX_AUTHORITY_RESTARTS) {
            return failUnstableAuthority()
          }
          continue authorityLoop
        }

        adoptChanges(attachment, authority, after.value)

        const retry: ContextManagerClientBaselineSurface[] = []
        for (const surface of pending) {
          const token = tokens[surface]
          if (
            token === undefined
            || !isSurfaceCurrent(attachment, authority, surface, token)
          ) continue

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
          completeReconcileRun(attachment, authority, run)
          return { status: 'completed', attempted }
        }
      }

      const unstable: ContextManagerClientReadError = {
        kind: 'unstable-snapshot',
        attempts: MAX_STABILIZATION_ATTEMPTS,
      }
      failScopes(attachment, authority, pending, tokens, unstable)

      completeReconcileRun(attachment, authority, run, unstable)
      return { status: 'completed', attempted }
    }
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
