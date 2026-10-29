import type {
  ContextManagerRemotePromptResource,
  ContextManagerRemotePromptResourceListItem,
  ContextManagerRemotePromptResourceInput,
} from '../remote/types.js'
import type {
  ContextManagerClientPromptResourceReadStamp,
  ContextManagerClientSnapshot,
} from './model-types.js'
import type {
  ContextManagerClientResourceCreateBasis,
  ContextManagerClientResourceMutations,
  ContextManagerClientResourceMutationResult,
} from './resource-mutation-types.js'

export type ResourceDraftBlock = 'stale' | 'conflict' | 'unknown' | 'unverified'
export type ResourceNoticeCode =
  | 'resourceNoticeSaved'
  | 'resourceNoticeDegraded'
  | 'resourceNoticeConflict'
  | 'resourceNoticeStale'
  | 'resourceNoticeUnknown'
  | 'resourceNoticeBusy'
  | 'resourceNoticeUnavailable'
  | 'resourceNoticeInvalid'
  | 'resourceNoticeExists'
  | 'resourceNoticeNotEditable'
  | 'resourceNoticeFailed'
  | 'resourceNoticeDraftActive'
  | 'resourceNoticeRefreshFailed'

export interface ResourceNotice {
  readonly code: ResourceNoticeCode
  readonly kind: 'success' | 'warning' | 'error'
  readonly detail?: string
}

interface ResourceDraftBase {
  readonly token: number
  blocked?: ResourceDraftBlock
  /** Presentation-only synchronous submission claim; never Host authority. */
  submitting?: boolean
}

export type ResourceDraft =
  | (ResourceDraftBase & {
      readonly kind: 'create'
      readonly basis: ContextManagerClientResourceCreateBasis
      id: string
      name: string
      description: string
      content: string
    })
  | (ResourceDraftBase & {
      readonly kind: 'edit'
      readonly stamp: ContextManagerClientPromptResourceReadStamp
      readonly original: {
        readonly name: string
        readonly description?: string
        readonly content: string
      }
      name: string
      description: string
      content: string
      /** Explicitly setting an absent description to '' differs from keeping it absent. */
      descriptionTouched: boolean
      removeDescription: boolean
    })
  | (ResourceDraftBase & {
      readonly kind: 'delete'
      readonly stamp: ContextManagerClientPromptResourceReadStamp
      readonly resourceId: string
      readonly name: string
    })

export interface ResourceView {
  readonly rows: readonly ContextManagerRemotePromptResourceListItem[]
  readonly selectedId?: string
  readonly selected?: ContextManagerRemotePromptResourceListItem
  readonly document?: ContextManagerRemotePromptResource
  readonly canRead: boolean
  readonly listFresh: boolean
  readonly writable: boolean
  /** A detached/read-only or stale List may still show matching cached body for inspection. */
  readonly canInspectSelected: boolean
  readonly canEditSelected: boolean
}

/** UI projection only. B1-3 remains the sole owner of authoritative List/Document surfaces. */
export function deriveResourceView(
  snapshot: ContextManagerClientSnapshot,
  requestedId: string | null,
): ResourceView {
  const surface = snapshot.resources.list
  const rows = [...(surface.data ?? [])].sort((a, b) => a.id.localeCompare(b.id))
  const selectedId = requestedId !== null && rows.some(row => row.id === requestedId)
    ? requestedId
    : rows[0]?.id
  const selected = rows.find(row => row.id === selectedId)
  const documentSurface = selectedId === undefined
    ? undefined : snapshot.resources.documents.get(selectedId)
  const document = documentSurface?.data
  const listFresh = surface.status === 'ready' && !surface.stale && surface.data !== undefined
  const writable = listFresh && snapshot.attachment === 'attached'
    && snapshot.protocol.status === 'compatible'
    && snapshot.instanceId !== undefined
    && snapshot.changes?.instanceId === snapshot.instanceId
    && typeof snapshot.changes.resourceAuthorityId === 'string'
    && snapshot.changes.resourceAuthorityId.length > 0
  const canInspectSelected = selected?.status === 'usable'
    && documentSurface?.status === 'ready' && !documentSurface.stale
    && document?.id === selected.id
    && document.revision === selected.revision
    && document.incarnationId === selected.incarnationId
  const canEditSelected = writable && canInspectSelected
  return {
    rows,
    selectedId,
    selected,
    document,
    listFresh,
    canRead: surface.data !== undefined,
    writable,
    canInspectSelected,
    canEditSelected,
  }
}

export function validateResourceCreateDraft(
  draft: Extract<ResourceDraft, { kind: 'create' }>,
  reservedIds: ReadonlySet<string>,
): 'valid' | 'missing-id' | 'exists' {
  if (draft.id.trim().length === 0) return 'missing-id'
  if (reservedIds.has(draft.id)) return 'exists'
  // Host PromptLibrary IDs are not Settings-path keys: do not reject __proto__
  // or normalize id/name/content; Host remains the final input validator.
  return 'valid'
}

/** Verify fresh Resource evidence against original write basis, never Profile instanceId. */
export function isResourceDraftCurrent(
  snapshot: ContextManagerClientSnapshot,
  draft: ResourceDraft,
): boolean {
  if (snapshot.attachment !== 'attached' || snapshot.protocol.status !== 'compatible'
    || snapshot.instanceId === undefined || snapshot.changes?.instanceId !== snapshot.instanceId) {
    return false
  }
  const authority = snapshot.changes.resourceAuthorityId
  if (typeof authority !== 'string' || authority.length === 0) return false
  if (draft.kind === 'create') return authority === draft.basis.resourceAuthorityId
  const stamp = draft.stamp
  if (authority !== stamp.resourceAuthorityId) return false
  const observed = stamp.source === 'document'
    ? snapshot.resources.documents.get(stamp.resourceId)
    : snapshot.resources.list
  if (observed?.status !== 'ready' || observed.stale) return false
  const resource = stamp.source === 'document'
    ? snapshot.resources.documents.get(stamp.resourceId)?.data
    : snapshot.resources.list.data?.find(row => row.id === stamp.resourceId)
  return resource !== undefined && 'revision' in resource
    && resource.id === stamp.resourceId
    && resource.revision === stamp.revision
    && resource.incarnationId === stamp.incarnationId
}

export type ResourceEditChange = 'name' | 'description' | 'content'

export function resourceEditChanges(
  draft: Extract<ResourceDraft, { kind: 'edit' }>,
): readonly ResourceEditChange[] {
  const changed: ResourceEditChange[] = []
  if (draft.name !== draft.original.name) changed.push('name')
  if (draft.removeDescription) {
    if (draft.original.description !== undefined) changed.push('description')
  } else if (
    draft.description !== (draft.original.description ?? '')
    || (draft.descriptionTouched && draft.original.description === undefined)
  ) {
    changed.push('description')
  }
  if (draft.content !== draft.original.content) changed.push('content')
  return changed
}

export function resourceEditInput(draft: Extract<ResourceDraft, { kind: 'edit' }>): ContextManagerRemotePromptResourceInput {
  return {
    name: draft.name,
    ...((draft.removeDescription || (!draft.descriptionTouched && draft.original.description === undefined))
      ? {} : { description: draft.description }),
    content: draft.content,
  }
}

/** One explicitly triggered Save equals at most ONE Resource Host RPC. */
export function commitResourceDraft(
  draft: ResourceDraft,
  mutations: ContextManagerClientResourceMutations,
): Promise<ContextManagerClientResourceMutationResult> | undefined {
  if (draft.blocked !== undefined) return undefined
  if (draft.kind === 'create') {
    return mutations.createPromptResource(draft.basis, draft.id, {
      name: draft.name,
      ...(draft.description === '' ? {} : { description: draft.description }),
      content: draft.content,
    })
  }
  if (draft.kind === 'delete') return mutations.deletePromptResource(draft.stamp)
  const changes = resourceEditChanges(draft)
  if (changes.length === 0) return undefined
  if (changes.length > 1) {
    return mutations.replacePromptResource(draft.stamp, resourceEditInput(draft))
  }
  switch (changes[0]) {
    case 'name': return mutations.setPromptResourceName(draft.stamp, draft.name)
    case 'description':
      return mutations.setPromptResourceDescription(
        draft.stamp, draft.removeDescription ? null : draft.description,
      )
    case 'content': return mutations.setPromptResourceContent(draft.stamp, draft.content)
  }
}

export function blockForResourceMutationResult(
  result: ContextManagerClientResourceMutationResult,
): ResourceDraftBlock | undefined {
  if (result.status === 'unknown') return 'unknown'
  if (result.status === 'applied') return result.refresh === 'degraded' ? 'unverified' : undefined
  if (result.status === 'superseded' || result.status === 'detached'
    || result.status === 'disposed' || result.status === 'incompatible') return 'stale'
  if (result.status === 'rejected') {
    if (result.error.kind === 'precondition'
      && (result.error.code === 'resource-basis-stale'
        || result.error.code === 'resource-basis-unavailable'
        || result.error.code === 'resource-authority-unavailable')) return 'stale'
    if (result.error.kind === 'business' && (
      result.error.code === 'prompt-resource-conflict'
      || result.error.code === 'prompt-resource-authority-conflict'
      || result.error.code === 'prompt-resource-incarnation-conflict'
      || result.error.code === 'prompt-resource-not-found'
    )) return 'conflict'
  }
  return undefined
}

export function noticeForResourceMutationResult(
  result: ContextManagerClientResourceMutationResult,
): ResourceNotice | undefined {
  switch (result.status) {
    case 'applied':
      return result.refresh === 'fresh'
        ? { code: 'resourceNoticeSaved', kind: 'success' }
        : { code: 'resourceNoticeDegraded', kind: 'warning' }
    case 'unknown':
      return { code: 'resourceNoticeUnknown', kind: 'warning', detail: result.error.message }
    case 'superseded':
      return undefined
    case 'detached':
    case 'disposed':
    case 'incompatible':
      return { code: 'resourceNoticeUnavailable', kind: 'warning' }
    case 'rejected': {
      const err = result.error
      if (err.kind === 'precondition') {
        if (err.code === 'busy') return { code: 'resourceNoticeBusy', kind: 'warning' }
        if (err.code === 'resource-basis-stale' || err.code === 'resource-basis-unavailable') {
          return { code: 'resourceNoticeStale', kind: 'warning' }
        }
        return { code: 'resourceNoticeUnavailable', kind: 'warning', detail: err.message }
      }
      switch (err.code) {
        case 'prompt-resource-conflict':
        case 'prompt-resource-authority-conflict':
        case 'prompt-resource-incarnation-conflict':
        case 'prompt-resource-not-found':
          return { code: 'resourceNoticeConflict', kind: 'warning', detail: err.message }
        case 'prompt-resource-exists':
          return { code: 'resourceNoticeExists', kind: 'warning', detail: err.message }
        case 'invalid-prompt-resource':
          return { code: 'resourceNoticeInvalid', kind: 'error', detail: err.message }
        case 'prompt-resource-path-not-editable':
          return { code: 'resourceNoticeNotEditable', kind: 'error', detail: err.message }
        case 'prompt-library-not-ready':
          return { code: 'resourceNoticeUnavailable', kind: 'warning', detail: err.message }
        default:
          return { code: 'resourceNoticeFailed', kind: 'error', detail: err.message }
      }
    }
  }
}
