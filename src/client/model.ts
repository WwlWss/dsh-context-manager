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
  type ContextManagerRemoteResult,
  type ContextManagerRemotePromptResource,
  type ContextManagerRemotePromptResourceListItem,
  type ContextManagerRemoteSessionPresetIdentity,
  type ContextManagerRemotePromptRuntimeInspection,
  type ContextManagerRemoteSkillRuntimeInspection,
  type ContextManagerRemotePinnedSkillInspection,
} from '../remote/types.js'
import type {
  ContextManagerClientBaselineSurface,
  ContextManagerClientReadError,
  ContextManagerClientReconcileResult,
  ContextManagerClientSnapshot,
  ContextManagerClientSurface,
  ContextManagerClientLazyReadResult,
  ContextManagerClientPromptResourceReadStamp,
} from './model-types.js'
import {
  createContextManagerProfileMutationController,
  type ContextManagerClientMutationController,
} from './mutation-controller.js'
import type { ContextManagerClientProfileMutationBasis } from './mutation-types.js'
import { mapSurfaces, setBoundedEntry } from './keyed-cache.js'
import type {
  ContextManagerClientBusinessRemote,
  ContextManagerClientReadRemote,
} from './remote-port.js'

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
type SurfaceRuns = Record<ContextManagerClientBaselineSurface, number>

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
    }
  | {
      readonly status: 'incompatible'
      readonly actual: number
    }
  | {
      readonly status: 'attachment-stale' | 'authority-stale' | 'superseded'
    }

export interface ContextManagerClientModel {
  readonly state: SnapshotStore<ContextManagerClientSnapshot>
  readonly mutations: ContextManagerClientMutationController
  loadPromptResourceList(): Promise<ContextManagerClientLazyReadResult>
  loadPromptResource(id: string): Promise<ContextManagerClientLazyReadResult>
  loadSessionPreset(id: string): Promise<ContextManagerClientLazyReadResult>
  loadAgentPromptRuntime(id: string): Promise<ContextManagerClientLazyReadResult>
  loadAgentSkillRuntime(id: string): Promise<ContextManagerClientLazyReadResult>
  loadAgentPinnedRuntime(id: string): Promise<ContextManagerClientLazyReadResult>
  capturePromptResourceReadStamp(id: string, source: 'list' | 'document'): ContextManagerClientPromptResourceReadStamp | undefined

  attach(remote: ContextManagerClientBusinessRemote): () => void
  refresh(): Promise<ContextManagerClientReconcileResult>
  reconcile(
    scopes: readonly ContextManagerClientBaselineSurface[],
  ): Promise<ContextManagerClientReconcileResult>
  getProfileRevision(): number | undefined
  captureProfileMutationBasis(): ContextManagerClientProfileMutationBasis | undefined
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
    resources: { list: idleSurface(), documents: new Map() },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
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

function markSurfaceStale<T>(
  current: ContextManagerClientSurface<T>,
): ContextManagerClientSurface<T> {
  if (current.stale || current.data === undefined) return current
  return {
    ...current,
    stale: true,
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

type KeyedKind = 'document' | 'session' | 'prompt' | 'skill' | 'pinned'
type KeyedValue = ContextManagerRemotePromptResource
  | ContextManagerRemoteSessionPresetIdentity
  | ContextManagerRemotePromptRuntimeInspection
  | ContextManagerRemoteSkillRuntimeInspection
  | ContextManagerRemotePinnedSkillInspection

function staleMap<T>(
  entries: ReadonlyMap<string, ContextManagerClientSurface<T>>,
): ReadonlyMap<string, ContextManagerClientSurface<T>> {
  return mapSurfaces(entries, markSurfaceStale)
}

function detachMap<T>(
  entries: ReadonlyMap<string, ContextManagerClientSurface<T>>,
): ReadonlyMap<string, ContextManagerClientSurface<T>> {
  return mapSurfaces(entries, detachedSurface)
}

async function invokeBusinessRead<T>(
  call: () => Promise<RemoteResult<ContextManagerRemoteResult<T>>>,
): Promise<ReadOutcome<T>> {
  const transport = await invokeRead(call)
  if (!transport.ok) return transport
  if (transport.value.ok) return { ok: true, value: transport.value.value }
  return {
    ok: false,
    error: {
      kind: 'business',
      code: transport.value.error.code,
      message: transport.value.error.message,
    },
  }
}

export function createContextManagerClientModel(): ContextManagerClientModel {
  const state = createSnapshotStore<ContextManagerClientSnapshot>(initialSnapshot())

  let remote: ContextManagerClientBusinessRemote | undefined
  let disposed = false
  let resetMutationController = (): void => {}
  let attachmentEpoch = 0
  const surfaceEpochs: SurfaceEpochs = {
    profiles: 0,
    presets: 0,
    promptPlacement: 0,
  }
  const surfaceOwnerRuns: SurfaceRuns = {
    profiles: 0,
    presets: 0,
    promptPlacement: 0,
  }
  let reconcileRunEpoch = 0
  let authorityEpoch = 0
  const activeReconcileRuns = new Set<number>()
  let latestCompletedRun = 0
  let latestCompletedError: ContextManagerClientReadError | undefined
  let protocolOwnerRun = 0
  let keyedRequestSequence = 0
  const keyedOwners = new Map<string, number>()
  let baselineRecoveryScheduled = false

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
    protocolOwnerRun = 0
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

  const isProtocolOwner = (
    attachment: number,
    authority: number,
    run: number,
  ): boolean => (
    isAuthorityCurrent(attachment, authority)
    && protocolOwnerRun === run
  )

  const beginProtocolCheck = (
    attachment: number,
    authority: number,
    run: number,
  ): void => {
    if (!isAuthorityCurrent(attachment, authority)) return
    if (run < protocolOwnerRun) return

    protocolOwnerRun = run
    const current = state.getSnapshot()
    state.set({
      ...current,
      protocol: { status: 'checking' },
    })
  }

  const publishProtocol = (
    attachment: number,
    authority: number,
    run: number,
    protocol: ContextManagerClientSnapshot['protocol'],
  ): void => {
    if (!isProtocolOwner(attachment, authority, run)) return

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

  const resetSurfaceOwnership = (): void => {
    for (const surface of CONTEXT_MANAGER_BASELINE_SURFACES) {
      surfaceOwnerRuns[surface] = 0
      surfaceEpochs[surface] += 1
    }
  }

  const clearAuthority = (
    instanceId?: string,
    protocol: ContextManagerClientSnapshot['protocol'] = { status: 'unchecked' },
  ): void => {
    authorityEpoch += 1
    latestCompletedRun = 0
    latestCompletedError = undefined
    protocolOwnerRun = 0
    resetSurfaceOwnership()
    keyedOwners.clear()
    const current = state.getSnapshot()
    state.set({
      ...current,
      instanceId,
      changes: undefined,
      protocol,
      profiles: idleSurface(),
      presets: idleSurface(),
      promptPlacement: idleSurface(),
      resources: { list: idleSurface(), documents: new Map() },
      diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
    })
    resetMutationController()
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
  ): void => {
    if (!isAuthorityCurrent(attachment, authority)) return

    const current = state.getSnapshot()
    if (current.instanceId !== next.instanceId) return

    const previous = current.changes
    if (
      previous !== undefined
      && previous.instanceId === next.instanceId
      && previous.generation > next.generation
    ) {
      return
    }

    const sameInstance = previous?.instanceId === next.instanceId
    state.set({
      ...current,
      changes: next,
      profiles: sameInstance && previous.profiles !== next.profiles
        ? markSurfaceStale(current.profiles)
        : current.profiles,
      presets: sameInstance && previous.presets !== next.presets
        ? markSurfaceStale(current.presets)
        : current.presets,
      promptPlacement: sameInstance && previous.runtime !== next.runtime
        ? markSurfaceStale(current.promptPlacement)
        : current.promptPlacement,
      resources: sameInstance && previous.promptResources !== next.promptResources
        ? { list: markSurfaceStale(current.resources.list), documents: staleMap(current.resources.documents) }
        : current.resources,
      diagnostics: sameInstance && previous.runtime !== next.runtime
        ? {
            sessions: staleMap(current.diagnostics.sessions),
            prompts: staleMap(current.diagnostics.prompts),
            skills: staleMap(current.diagnostics.skills),
            pinned: staleMap(current.diagnostics.pinned),
          }
        : current.diagnostics,
    })
  }

  const isSurfaceCursorCurrent = (
    surface: ContextManagerClientBaselineSurface,
    bracket: ContextManagerRemoteChangeSnapshot,
  ): boolean => {
    const latest = state.getSnapshot().changes
    return (
      latest !== undefined
      && latest.instanceId === bracket.instanceId
      && cursorOf(surface, latest) === cursorOf(surface, bracket)
    )
  }

  const claimRequestedSurfaces = (
    scopes: readonly ContextManagerClientBaselineSurface[],
    run: number,
  ): Partial<SurfaceEpochs> => {
    const tokens: Partial<SurfaceEpochs> = {}
    for (const surface of scopes) {
      const owner = surfaceOwnerRuns[surface]
      if (run < owner) continue

      if (run > owner) {
        surfaceOwnerRuns[surface] = run
        surfaceEpochs[surface] += 1
      }

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
    run: number,
  ): Promise<ProtocolGuardOutcome> => {
    for (let attempt = 1; attempt <= MAX_PROTOCOL_ATTEMPTS; attempt += 1) {
      if (!isAttachmentCurrent(attachment)) {
        return { status: 'attachment-stale' }
      }
      if (authority !== authorityEpoch) {
        return { status: 'authority-stale' }
      }

      beginProtocolCheck(attachment, authority, run)
      const protocol = await invokeRead(() => currentRemote.protocol())

      if (!isAttachmentCurrent(attachment)) {
        return { status: 'attachment-stale' }
      }
      if (authority !== authorityEpoch) {
        return { status: 'authority-stale' }
      }

      const ownsPublication = isProtocolOwner(attachment, authority, run)
      if (!protocol.ok) {
        if (!ownsPublication) continue

        publishProtocol(attachment, authority, run, {
          status: 'error',
          error: protocol.error,
        })
        return {
          status: 'error',
          error: protocol.error,
        }
      }

      if (protocol.value.apiVersion !== CONTEXT_MANAGER_REMOTE_API_VERSION) {
        if (!ownsPublication) continue

        return {
          status: 'incompatible',
          actual: protocol.value.apiVersion,
        }
      }

      publishProtocol(attachment, authority, run, {
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
    let tokens: Partial<SurfaceEpochs> = {}
    let authorityRestarts = 0

    const detachedResult = (): ContextManagerClientReconcileResult => (
      disposed
        ? { status: 'disposed', attempted }
        : { status: 'detached', attempted }
    )

    const completeSupersededRun = (): ContextManagerClientReconcileResult => {
      completeReconcileRun(attachment, authority, run)
      return { status: 'completed', attempted }
    }

    const acceptAuthorityTransition = (
      transition: AuthorityTransition,
    ): 'same' | 'changed' | 'superseded' => {
      if (transition.status !== 'changed') return transition.status

      authority = transition.authority
      authorityRestarts += 1
      tokens = {}
      return 'changed'
    }

    const failUnstableAuthority = (): ContextManagerClientReconcileResult => {
      const unstable: ContextManagerClientReadError = {
        kind: 'unstable-authority',
        attempts: MAX_AUTHORITY_RESTARTS,
      }
      const failureTokens = claimRequestedSurfaces(attempted, run)
      failScopes(attachment, authority, attempted, failureTokens, unstable)
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
        return completeSupersededRun()
      }

      const protocol = await guardProtocol(
        currentRemote,
        attachment,
        authority,
        run,
      )
      switch (protocol.status) {
        case 'attachment-stale':
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        case 'authority-stale':
        case 'superseded':
          return completeSupersededRun()
        case 'error':
          if (!isProtocolOwner(attachment, authority, run)) {
            return completeSupersededRun()
          }
          tokens = claimRequestedSurfaces(attempted, run)
          failScopes(attachment, authority, attempted, tokens, protocol.error)
          completeReconcileRun(attachment, authority, run, protocol.error)
          return { status: 'completed', attempted }
        case 'incompatible': {
          if (!isProtocolOwner(attachment, authority, run)) {
            return completeSupersededRun()
          }

          clearAuthority(undefined, {
            status: 'incompatible',
            expected: CONTEXT_MANAGER_REMOTE_API_VERSION,
            actual: protocol.actual,
          })
          authority = authorityEpoch
          completeReconcileRun(attachment, authority, run)
          return { status: 'incompatible', attempted }
        }
        case 'compatible':
          break
      }

      let pending: ContextManagerClientBaselineSurface[] | undefined

      for (let attempt = 1; attempt <= MAX_STABILIZATION_ATTEMPTS; attempt += 1) {
        const before = await invokeRead(() => currentRemote.changes())
        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeSupersededRun()
        }
        if (!before.ok) {
          const failureTokens = claimRequestedSurfaces(attempted, run)
          failScopes(attachment, authority, attempted, failureTokens, before.error)
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
          return completeSupersededRun()
        }
        if (beforeTransition === 'changed') {
          if (authorityRestarts >= MAX_AUTHORITY_RESTARTS) {
            return failUnstableAuthority()
          }
          continue authorityLoop
        }

        adoptChanges(attachment, authority, before.value)

        if (pending === undefined) {
          tokens = claimRequestedSurfaces(attempted, run)
          pending = attempted.filter(surface => tokens[surface] !== undefined)
          if (pending.length === 0) {
            return completeSupersededRun()
          }
        }

        markScopesLoading(attachment, authority, pending, tokens)

        // SnapshotStore publishes synchronously by default. A loading-state
        // subscriber may detach, dispose, replace the attachment, or otherwise
        // invalidate this run before control returns here. Re-check all
        // lifecycle/publication guards before starting any Remote surface RPC.
        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeSupersededRun()
        }

        const activePending = pending.filter(surface => {
          const token = tokens[surface]
          return token !== undefined
            && isSurfaceCurrent(attachment, authority, surface, token)
        })
        if (activePending.length === 0) {
          return completeSupersededRun()
        }

        const reads = new Map<
          ContextManagerClientBaselineSurface,
          ReadOutcome<BaselineSurfaceMap[ContextManagerClientBaselineSurface]>
        >()
        await Promise.all(activePending.map(async surface => {
          reads.set(surface, await readSurface(currentRemote, surface))
        }))

        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeSupersededRun()
        }

        const after = await invokeRead(() => currentRemote.changes())
        if (!isAttachmentCurrent(attachment)) {
          completeReconcileRun(attachment, authority, run)
          return detachedResult()
        }
        if (authority !== authorityEpoch) {
          return completeSupersededRun()
        }
        if (!after.ok) {
          failScopes(attachment, authority, activePending, tokens, after.error)
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
          return completeSupersededRun()
        }
        if (afterTransition === 'changed') {
          if (authorityRestarts >= MAX_AUTHORITY_RESTARTS) {
            return failUnstableAuthority()
          }
          continue authorityLoop
        }

        adoptChanges(attachment, authority, after.value)

        const retry: ContextManagerClientBaselineSurface[] = []
        for (const surface of activePending) {
          const token = tokens[surface]
          if (
            token === undefined
            || !isSurfaceCurrent(attachment, authority, surface, token)
          ) continue

          const read = reads.get(surface)
          if (read === undefined) continue

          if (
            cursorOf(surface, before.value) !== cursorOf(surface, after.value)
            || !isSurfaceCursorCurrent(surface, after.value)
          ) {
            retry.push(surface)
            continue
          }

          if (!read.ok) {
            const current = state.getSnapshot()[surface] as ContextManagerClientSurface<BaselineSurfaceMap[typeof surface]>
            replaceSurface(surface, failedSurface(current, read.error) as never)
            continue
          }

          replaceSurface(surface, readySurface(read.value) as never)
        }

        pending = retry
        if (retry.length === 0) {
          completeReconcileRun(attachment, authority, run)
          return { status: 'completed', attempted }
        }
      }

      const unstable: ContextManagerClientReadError = {
        kind: 'unstable-snapshot',
        attempts: MAX_STABILIZATION_ATTEMPTS,
      }
      failScopes(attachment, authority, pending ?? [], tokens, unstable)

      completeReconcileRun(attachment, authority, run, unstable)
      return { status: 'completed', attempted }
    }
  }

  // Lazy reads use B1-1's attachment/authority and change-hint source but do not
  // take ownership of baseline reconcile runs or the global sync indicator.
  const lazyResult = (status: ContextManagerClientLazyReadResult['status']): ContextManagerClientLazyReadResult => ({ status })
  const keyOf = (kind: string, id: string): string => JSON.stringify([kind, id])
  const cursorForKind = (kind: 'list' | KeyedKind, c: ContextManagerRemoteChangeSnapshot): number => (
    kind === 'list' || kind === 'document' ? c.promptResources : c.runtime
  )

  const publishList = (surface: ContextManagerClientSurface<readonly ContextManagerRemotePromptResourceListItem[]>): void => {
    const current = state.getSnapshot()
    state.set({ ...current, resources: { ...current.resources, list: surface } })
  }

  const publishKeyed = (
    kind: KeyedKind,
    id: string,
    surface: ContextManagerClientSurface<KeyedValue>,
  ): void => {
    const current = state.getSnapshot()
    if (kind === 'document') {
      state.set({
        ...current,
        resources: {
          ...current.resources,
          documents: setBoundedEntry(current.resources.documents, id, surface as ContextManagerClientSurface<ContextManagerRemotePromptResource>, 32),
        },
      })
      return
    }
    const family = kind === 'session' ? 'sessions'
      : kind === 'prompt' ? 'prompts'
      : kind === 'skill' ? 'skills' : 'pinned'
    state.set({
      ...current,
      diagnostics: {
        ...current.diagnostics,
        [family]: setBoundedEntry(current.diagnostics[family], id, surface as never, 64),
      },
    })
  }

  const getKeyed = (kind: KeyedKind, id: string): ContextManagerClientSurface<KeyedValue> | undefined => {
    const snapshot = state.getSnapshot()
    switch (kind) {
      case 'document': return snapshot.resources.documents.get(id)
      case 'session': return snapshot.diagnostics.sessions.get(id)
      case 'prompt': return snapshot.diagnostics.prompts.get(id)
      case 'skill': return snapshot.diagnostics.skills.get(id)
      case 'pinned': return snapshot.diagnostics.pinned.get(id)
    }
  }

  const runLazy = async (kind: 'list' | KeyedKind, id: string): Promise<ContextManagerClientLazyReadResult> => {
    if (disposed) return lazyResult('disposed')
    if (remote === undefined) return lazyResult('detached')
    const attachment = attachmentEpoch
    let authority = authorityEpoch
    const currentRemote = remote
    const key = keyOf(kind, id)
    const request = ++keyedRequestSequence
    keyedOwners.set(key, request)
    const currentOwner = (): boolean => (
      isAuthorityCurrent(attachment, authority) && keyedOwners.get(key) === request
    )
    const staleResult = (): ContextManagerClientLazyReadResult => (
      disposed ? lazyResult('disposed') : !isAttachmentCurrent(attachment) ? lazyResult('detached') : lazyResult('superseded')
    )
    for (let restart = 0; restart < MAX_AUTHORITY_RESTARTS; restart += 1) {
      if (!currentOwner()) return staleResult()
      const protocol = await invokeRead(() => currentRemote.protocol())
      if (!currentOwner()) return staleResult()
      if (!protocol.ok) {
        const surface = failedSurface(kind === 'list' ? state.getSnapshot().resources.list : getKeyed(kind, id) ?? idleSurface(), protocol.error)
        if (kind === 'list') publishList(surface as ContextManagerClientSurface<readonly ContextManagerRemotePromptResourceListItem[]>)
        else publishKeyed(kind, id, surface as ContextManagerClientSurface<KeyedValue>)
        return lazyResult('completed')
      }
      if (protocol.value.apiVersion !== CONTEXT_MANAGER_REMOTE_API_VERSION) {
        return lazyResult('incompatible')
      }
      let needsAuthorityRestart = false
      for (let attempt = 0; attempt < MAX_STABILIZATION_ATTEMPTS; attempt += 1) {
        if (!currentOwner()) return staleResult()
        const before = await invokeRead(() => currentRemote.changes())
        if (!currentOwner()) return staleResult()
        if (!before.ok) {
          const surface = failedSurface(kind === 'list' ? state.getSnapshot().resources.list : getKeyed(kind, id) ?? idleSurface(), before.error)
          if (kind === 'list') publishList(surface as ContextManagerClientSurface<readonly ContextManagerRemotePromptResourceListItem[]>)
          else publishKeyed(kind, id, surface as ContextManagerClientSurface<KeyedValue>)
          return lazyResult('completed')
        }
        const transition = transitionAuthority(attachment, authority, before.value.instanceId)
        if (transition.status === 'superseded') return staleResult()
        if (transition.status === 'changed') {
          authority = transition.authority
          keyedOwners.set(key, request)
          needsAuthorityRestart = true
          if (!baselineRecoveryScheduled) {
            baselineRecoveryScheduled = true
            void Promise.resolve().then(async () => {
              baselineRecoveryScheduled = false
              if (isAttachmentCurrent(attachment)) await reconcile(CONTEXT_MANAGER_BASELINE_SURFACES)
            })
          }
          break
        }
        adoptChanges(attachment, authority, before.value)
        if (!currentOwner()) return staleResult()
        if (kind === 'list') publishList(loadingSurface(state.getSnapshot().resources.list))
        else publishKeyed(kind, id, loadingSurface(getKeyed(kind, id) ?? idleSurface()))
        if (!currentOwner()) return staleResult()
        const read: ReadOutcome<unknown> = await (kind === 'list'
          ? invokeBusinessRead(() => currentRemote.listPromptResources())
          : kind === 'document' ? invokeBusinessRead(() => currentRemote.getPromptResource(id))
          : kind === 'session' ? invokeRead(() => currentRemote.sessionPreset(id))
          : kind === 'prompt' ? invokeRead(() => currentRemote.inspectPromptRuntime(id))
          : kind === 'skill' ? invokeRead(() => currentRemote.inspectSkillRuntime(id))
          : invokeRead(() => currentRemote.inspectPinnedSkillRuntime(id)))
        if (!currentOwner()) return staleResult()
        const after = await invokeRead(() => currentRemote.changes())
        if (!currentOwner()) return staleResult()
        if (!after.ok) {
          const surface = failedSurface(kind === 'list' ? state.getSnapshot().resources.list : getKeyed(kind, id) ?? idleSurface(), after.error)
          if (kind === 'list') publishList(surface as ContextManagerClientSurface<readonly ContextManagerRemotePromptResourceListItem[]>)
          else publishKeyed(kind, id, surface as ContextManagerClientSurface<KeyedValue>)
          return lazyResult('completed')
        }
        const afterTransition = transitionAuthority(attachment, authority, after.value.instanceId)
        if (afterTransition.status === 'superseded') return staleResult()
        if (afterTransition.status === 'changed') {
          authority = afterTransition.authority
          keyedOwners.set(key, request)
          needsAuthorityRestart = true
          if (!baselineRecoveryScheduled) {
            baselineRecoveryScheduled = true
            void Promise.resolve().then(async () => {
              baselineRecoveryScheduled = false
              if (isAttachmentCurrent(attachment)) await reconcile(CONTEXT_MANAGER_BASELINE_SURFACES)
            })
          }
          break
        }
        adoptChanges(attachment, authority, after.value)
        if (!currentOwner()) return staleResult()
        const latest = state.getSnapshot().changes
        if (
          cursorForKind(kind, before.value) !== cursorForKind(kind, after.value)
          || latest?.instanceId !== after.value.instanceId
          || latest === undefined
          || cursorForKind(kind, latest) !== cursorForKind(kind, after.value)
        ) continue
        const surface = read.ok
          ? readySurface(read.value)
          : failedSurface(kind === 'list' ? state.getSnapshot().resources.list : getKeyed(kind, id) ?? idleSurface(), read.error)
        if (kind === 'list') {
          publishList(surface as ContextManagerClientSurface<readonly ContextManagerRemotePromptResourceListItem[]>)
          if (read.ok) {
            const entries = read.value as readonly ContextManagerRemotePromptResourceListItem[]
            const revisions = new Map(entries.filter(x => x.status === 'usable').map(x => [x.id, x.revision]))
            const snapshot = state.getSnapshot()
            state.set({
              ...snapshot,
              resources: {
                ...snapshot.resources,
                documents: mapSurfaces(snapshot.resources.documents, document => {
                  const record = document.data
                  return record !== undefined && revisions.get(record.id) !== record.revision
                    ? markSurfaceStale(document) : document
                }),
              },
            })
          }
        } else publishKeyed(kind, id, surface as ContextManagerClientSurface<KeyedValue>)
        return lazyResult('completed')
      }
      if (needsAuthorityRestart) continue
      const error: ContextManagerClientReadError = { kind: 'unstable-snapshot', attempts: MAX_STABILIZATION_ATTEMPTS }
      if (kind === 'list') publishList(failedSurface(state.getSnapshot().resources.list, error))
      else publishKeyed(kind, id, failedSurface(getKeyed(kind, id) ?? idleSurface(), error))
      return lazyResult('completed')
    }
    if (!currentOwner()) return staleResult()
    const error: ContextManagerClientReadError = { kind: 'unstable-authority', attempts: MAX_AUTHORITY_RESTARTS }
    if (kind === 'list') publishList(failedSurface(state.getSnapshot().resources.list, error))
    else publishKeyed(kind, id, failedSurface(getKeyed(kind, id) ?? idleSurface(), error))
    return lazyResult('completed')
  }

  const capturePromptResourceReadStamp = (
    id: string,
    source: 'list' | 'document',
  ): ContextManagerClientPromptResourceReadStamp | undefined => {
    const snapshot = state.getSnapshot()
    if (snapshot.attachment !== 'attached' || snapshot.protocol.status !== 'compatible'
      || snapshot.instanceId === undefined || snapshot.changes?.instanceId !== snapshot.instanceId) return undefined
    let revision: number | undefined
    if (source === 'document') {
      const surface = snapshot.resources.documents.get(id)
      if (surface?.status === 'ready' && !surface.stale && surface.data?.id === id) revision = surface.data.revision
    } else {
      const surface = snapshot.resources.list
      if (surface.status === 'ready' && !surface.stale) {
        const row = surface.data?.find(item => item.id === id)
        if (row?.status === 'usable') revision = row.revision
      }
    }
    if (revision === undefined || !Number.isSafeInteger(revision) || revision < 1) return undefined
    return Object.freeze({ instanceId: snapshot.instanceId, resourceId: id, revision, source })
  }

  const attach = (nextRemote: ContextManagerClientBusinessRemote): (() => void) => {
    if (disposed) {
      throw new Error('Context Manager Client model is disposed')
    }

    attachmentEpoch += 1
    const attachedEpoch = attachmentEpoch
    remote = nextRemote
    resetRunBookkeeping()
    resetSurfaceOwnership()
    keyedOwners.clear()

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
        resources: { list: detachedSurface(current.resources.list), documents: detachMap(current.resources.documents) },
        diagnostics: { sessions: detachMap(current.diagnostics.sessions), prompts: detachMap(current.diagnostics.prompts), skills: detachMap(current.diagnostics.skills), pinned: detachMap(current.diagnostics.pinned) },
      })
    }
    resetMutationController()

    void reconcile(CONTEXT_MANAGER_BASELINE_SURFACES)

    return () => {
      if (disposed || attachmentEpoch !== attachedEpoch || remote !== nextRemote) return
      attachmentEpoch += 1
      remote = undefined
      resetRunBookkeeping()
      resetSurfaceOwnership()
      keyedOwners.clear()
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
      resetMutationController()
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

  const captureProfileMutationBasis = (): ContextManagerClientProfileMutationBasis | undefined => {
    const snapshot = state.getSnapshot()
    const revision = getProfileRevision()
    if (
      snapshot.attachment !== 'attached'
      || snapshot.protocol.status !== 'compatible'
      || snapshot.instanceId === undefined
      || snapshot.changes?.instanceId !== snapshot.instanceId
      || revision === undefined
    ) {
      return undefined
    }
    return Object.freeze({
      instanceId: snapshot.instanceId,
      revision,
    })
  }

  const mutationHandle = createContextManagerProfileMutationController({
    getRemote: () => remote,
    getLifecycle: () => (
      disposed ? 'disposed' : remote === undefined ? 'detached' : 'attached'
    ),
    getProtocolStatus: () => state.getSnapshot().protocol.status,
    getCurrentProfileMutationBasis: captureProfileMutationBasis,
    rehydrate: async () => {
      const result = await reconcile(CONTEXT_MANAGER_BASELINE_SURFACES)
      if (result.status !== 'completed') return false
      const snapshot = state.getSnapshot()
      return (
        snapshot.attachment === 'attached'
        && snapshot.protocol.status === 'compatible'
        && snapshot.sync.status === 'idle'
        && snapshot.profiles.status === 'ready'
        && !snapshot.profiles.stale
        && snapshot.presets.status === 'ready'
        && !snapshot.presets.stale
        && snapshot.promptPlacement.status === 'ready'
        && !snapshot.promptPlacement.stale
      )
    },
  })
  const mutations = mutationHandle.controller
  resetMutationController = mutationHandle.reset

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    attachmentEpoch += 1
    remote = undefined
    resetRunBookkeeping()
    resetSurfaceOwnership()
    keyedOwners.clear()
    const current = state.getSnapshot()
    state.set({
      ...current,
      attachment: 'detached',
      resources: { list: idleSurface(), documents: new Map() },
      diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
      protocol: { status: 'unchecked' },
      sync: { status: 'idle' },
      profiles: detachedSurface(current.profiles),
      presets: detachedSurface(current.presets),
      promptPlacement: detachedSurface(current.promptPlacement),
    })
    resetMutationController()
  }

  return Object.freeze({
    state,
    mutations,
    loadPromptResourceList: () => runLazy('list', ''),
    loadPromptResource: (id: string) => runLazy('document', id),
    loadSessionPreset: (id: string) => runLazy('session', id),
    loadAgentPromptRuntime: (id: string) => runLazy('prompt', id),
    loadAgentSkillRuntime: (id: string) => runLazy('skill', id),
    loadAgentPinnedRuntime: (id: string) => runLazy('pinned', id),
    capturePromptResourceReadStamp,
    attach,
    refresh: () => reconcile(CONTEXT_MANAGER_BASELINE_SURFACES),
    reconcile,
    getProfileRevision,
    captureProfileMutationBasis,
    dispose,
  })
}
