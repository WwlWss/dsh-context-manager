import type {
  ContextManagerRemoteProfile,
  ContextManagerRemotePromptBinding,
  ContextManagerRemotePromptPlacement,
} from '../remote/types.js'
import type { ContextManagerClientSnapshot } from './model-types.js'
import type {
  ContextManagerClientProfileMutationResult,
  ContextManagerClientProfileMutations,
} from './mutation-types.js'
import type { ProfileDraft, ProfileNotice, PromptBindingDraft } from './profile-editor.js'
import { noticeForMutationResult } from './profile-editor.js'

export function isPromptBindingDraft(draft: ProfileDraft | null): draft is PromptBindingDraft {
  return draft !== null && (
    draft.kind === 'prompt-binding-create'
    || draft.kind === 'prompt-binding-edit-field'
    || draft.kind === 'prompt-binding-delete'
  )
}

/** No String.trim(), rounding or native sort locale dependence in an authored ID. */
export function sortedPromptBindings(profile: ContextManagerRemoteProfile) {
  return Object.entries(profile.prompts).sort(([aId, a], [bId, b]) =>
    a.order - b.order || (aId < bId ? -1 : aId > bId ? 1 : 0)
  )
}

/** Settings accepts signed decimal safe integers, not coercions such as Number('') === 0. */
export function parsePromptBindingOrder(text: string): number | undefined {
  if (!/^[+-]?[0-9]+$/.test(text)) return undefined
  const parsed = Number(text)
  // DSH Settings persists JSON numbers: -0 and 0 have the same stored value.
  return Number.isSafeInteger(parsed) ? (parsed === 0 ? 0 : parsed) : undefined
}

export type BindingCreateValidity = 'valid' | 'unsafe-id' | 'exists' | 'invalid-order'
export function validatePromptBindingCreate(
  draft: Extract<PromptBindingDraft, { kind: 'prompt-binding-create' }>,
  existingIds: ReadonlySet<string>,
): BindingCreateValidity {
  if (draft.bindingId === '__proto__') return 'unsafe-id'
  if (existingIds.has(draft.bindingId)) return 'exists'
  if (parsePromptBindingOrder(draft.orderText) === undefined) return 'invalid-order'
  return 'valid'
}

export function createdPromptBindingInput(
  draft: Extract<PromptBindingDraft, { kind: 'prompt-binding-create' }>,
): ContextManagerRemotePromptBinding | undefined {
  const order = parsePromptBindingOrder(draft.orderText)
  if (order === undefined) return undefined
  return {
    resourceId: draft.resourceId,
    enabled: draft.enabled,
    placement: draft.placement,
    order,
  }
}

export function promptBindingEditChanged(
  draft: Extract<PromptBindingDraft, { kind: 'prompt-binding-edit-field' }>,
): boolean {
  if (draft.field === 'order') {
    const parsed = parsePromptBindingOrder(draft.value)
    return parsed !== undefined && parsed !== draft.original
  }
  return draft.value !== draft.original
}

export type BindingResourceHealth = 'usable' | 'invalid' | 'missing' | 'unverified'
export function promptBindingResourceHealth(
  snapshot: ContextManagerClientSnapshot,
  resourceId: string,
): BindingResourceHealth {
  const surface = snapshot.resources.list
  if (snapshot.attachment !== 'attached'
    || snapshot.protocol.status !== 'compatible'
    || surface.status !== 'ready' || surface.stale || surface.data === undefined) {
    return 'unverified'
  }
  const row = surface.data.find(item => item.id === resourceId)
  return row === undefined ? 'missing' : row.status
}

export type BindingPlacementHealth = 'available' | 'unavailable' | 'unverified'
export function promptBindingPlacementHealth(
  snapshot: ContextManagerClientSnapshot,
  placement: ContextManagerRemotePromptPlacement,
): BindingPlacementHealth {
  const surface = snapshot.promptPlacement
  if (snapshot.attachment !== 'attached'
    || snapshot.protocol.status !== 'compatible'
    || surface.status !== 'ready' || surface.stale || surface.data === undefined) {
    return 'unverified'
  }
  if (surface.data.status !== 'available') return 'unavailable'
  return Object.hasOwn(surface.data.placements, placement) ? 'available' : 'unavailable'
}

export function blockForPromptBindingResult(
  result: ContextManagerClientProfileMutationResult,
): PromptBindingDraft['blocked'] {
  switch (result.status) {
    case 'applied': return result.refresh === 'degraded' ? 'unverified' : undefined
    case 'unknown': return 'unknown'
    case 'detached':
    case 'disposed':
    case 'incompatible':
    case 'superseded': return 'stale'
    case 'rejected':
      if (result.error.kind === 'precondition') {
        return result.error.code === 'profile-basis-unavailable'
          || result.error.code === 'profile-basis-stale' ? 'stale' : undefined
      }
      if (result.error.code === 'profile-conflict'
        || result.error.code === 'host-instance-conflict') return 'conflict'
      if (result.error.code === 'profile-not-found'
        || result.error.code === 'prompt-binding-not-found'
        || result.error.code === 'profile-path-not-editable'
        || result.error.code === 'persistence-document-invalid') return 'stale'
      return undefined
  }
}

export function noticeForPromptBindingResult(
  result: ContextManagerClientProfileMutationResult,
): ProfileNotice | undefined {
  if (result.status === 'rejected' && result.error.kind === 'business') {
    if (result.error.code === 'prompt-binding-exists') {
      return { code: 'noticeBindingExists', kind: 'warning', detail: result.error.message }
    }
    if (result.error.code === 'prompt-binding-not-found' || result.error.code === 'profile-not-found') {
      return { code: 'noticeBindingMissing', kind: 'warning', detail: result.error.message }
    }
    if (result.error.code === 'invalid-prompt-order'
      || result.error.code === 'invalid-prompt-placement'
      || result.error.code === 'invalid-prompt-binding'
      || result.error.code === 'unsafe-path-key') {
      return { code: 'noticeInvalidInput', kind: 'error', detail: result.error.message }
    }
  }
  return noticeForMutationResult(result)
}

/** Exactly one existing Profile RPC per explicit Save, never a multi-leaf sequence. */
export function commitPromptBindingDraft(
  draft: PromptBindingDraft,
  api: ContextManagerClientProfileMutations,
): Promise<ContextManagerClientProfileMutationResult> | undefined {
  switch (draft.kind) {
    case 'prompt-binding-create': {
      const input = createdPromptBindingInput(draft)
      if (input === undefined) return undefined
      return api.addPromptBinding(draft.basis, draft.profileId, draft.bindingId, input)
    }
    case 'prompt-binding-delete':
      return api.removePromptBinding(draft.basis, draft.profileId, draft.bindingId)
    case 'prompt-binding-edit-field':
      if (!promptBindingEditChanged(draft)) return undefined
      switch (draft.field) {
        case 'resourceId':
          return api.setPromptBindingResourceId(draft.basis, draft.profileId, draft.bindingId, draft.value)
        case 'enabled':
          return api.setPromptBindingEnabled(draft.basis, draft.profileId, draft.bindingId, draft.value)
        case 'placement':
          return api.setPromptBindingPlacement(draft.basis, draft.profileId, draft.bindingId, draft.value)
        case 'order': {
          const order = parsePromptBindingOrder(draft.value)
          return order === undefined ? undefined
            : api.setPromptBindingOrder(draft.basis, draft.profileId, draft.bindingId, order)
        }
      }
  }
}
