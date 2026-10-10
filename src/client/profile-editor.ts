import type {
  ContextManagerRemoteProfileInput,
} from '../remote/types.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationResult,
} from './mutation-types.js'

export type ProfileEditField = 'name' | 'description' | 'basePreset'
export type ProfileDraftBlock = 'stale' | 'conflict' | 'unknown'

interface DraftBase {
  token: number
  readonly basis: ContextManagerClientProfileMutationBasis
  blocked?: ProfileDraftBlock
}

export type ProfileDraft =
  | (DraftBase & {
      kind: 'create'
      id: string
      name: string
      description: string
      basePreset: string
    })
  | (DraftBase & {
      kind: 'edit-field'
      profileId: string
      field: ProfileEditField
      original: string | undefined
      value: string
      removeDescription: boolean
    })
  | (DraftBase & {
      kind: 'confirm-delete'
      profileId: string
    })

export type ProfileNoticeCode =
  | 'noticeSaved'
  | 'noticeSavedDegraded'
  | 'noticeConflict'
  | 'noticeDraftStale'
  | 'noticeOutcomeUnknown'
  | 'noticeBusy'
  | 'noticeUnavailable'
  | 'noticeInvalidInput'
  | 'noticeProfileExists'
  | 'noticeNotEditable'
  | 'noticeFailed'
  | 'noticeDraftActive'
  | 'noticeRefreshFailed'
  | 'noticeRefreshRequested'

export interface ProfileNotice {
  readonly code: ProfileNoticeCode
  kind: 'success' | 'warning' | 'error'
  readonly detail?: string
}

export function validateCreateDraft(
  draft: Extract<ProfileDraft, { kind: 'create' }>,
  reservedIds: ReadonlySet<string>,
): 'valid' | 'missing-id' | 'unsafe-id' | 'exists' {
  if (draft.id.trim().length === 0) return 'missing-id'
  if (draft.id === '__proto__') return 'unsafe-id'
  if (reservedIds.has(draft.id)) return 'exists'
  return 'valid'
}

export function createdProfileInput(
  draft: Extract<ProfileDraft, { kind: 'create' }>,
): ContextManagerRemoteProfileInput {
  return {
    name: draft.name,
    ...(draft.description === '' ? {} : { description: draft.description }),
    basePreset: draft.basePreset,
    skills: {},
    prompts: {},
  }
}

export function editValueChanged(
  draft: Extract<ProfileDraft, { kind: 'edit-field' }>,
): boolean {
  if (draft.field === 'description') {
    if (draft.removeDescription) return draft.original !== undefined
    // An explicit Save of an absent description as '' creates an empty string;
    // it is NOT the same operation as removing the optional field.
    if (draft.original === undefined) return true
  }
  return draft.value !== (draft.original ?? '')
}

export function blockForMutationResult(
  result: ContextManagerClientProfileMutationResult,
): ProfileDraftBlock | undefined {
  switch (result.status) {
    case 'unknown':
      return 'unknown'
    case 'superseded':
    case 'detached':
    case 'disposed':
    case 'incompatible':
      return 'stale'
    case 'rejected':
      if (
        result.error.kind === 'precondition'
        && (
          result.error.code === 'profile-basis-stale'
          || result.error.code === 'profile-basis-unavailable'
        )
      ) return 'stale'
      if (
        result.error.kind === 'business'
        && (
          result.error.code === 'profile-conflict'
          || result.error.code === 'host-instance-conflict'
        )
      ) return 'conflict'
      return undefined
    case 'applied':
      return undefined
  }
}

export function noticeForMutationResult(
  result: ContextManagerClientProfileMutationResult,
): ProfileNotice | undefined {
  switch (result.status) {
    case 'applied':
      return result.refresh === 'fresh'
        ? { code: 'noticeSaved', kind: 'success' }
        : { code: 'noticeSavedDegraded', kind: 'warning' }
    case 'unknown':
      return { code: 'noticeOutcomeUnknown', kind: 'warning', detail: result.error.message }
    case 'superseded':
      // A previous Host/Client lifetime must not publish an obsolete outcome.
      return undefined
    case 'detached':
    case 'disposed':
    case 'incompatible':
      return { code: 'noticeUnavailable', kind: 'warning' }
    case 'rejected': {
      const error = result.error
      if (error.kind === 'precondition') {
        if (error.code === 'busy') return { code: 'noticeBusy', kind: 'warning' }
        if (
          error.code === 'profile-basis-unavailable'
          || error.code === 'profile-basis-stale'
        ) return { code: 'noticeDraftStale', kind: 'warning' }
        return { code: 'noticeUnavailable', kind: 'warning' }
      }
      switch (error.code) {
        case 'profile-conflict':
        case 'host-instance-conflict':
          return { code: 'noticeConflict', kind: 'warning', detail: error.message }
        case 'profile-exists':
          return { code: 'noticeProfileExists', kind: 'warning' }
        case 'invalid-profile':
        case 'unsafe-path-key':
          return { code: 'noticeInvalidInput', kind: 'error', detail: error.message }
        case 'profile-path-not-editable':
        case 'persistence-document-invalid':
          return { code: 'noticeNotEditable', kind: 'error', detail: error.message }
        case 'persistence-read-only':
        case 'persistence-not-ready':
        case 'persistence-unavailable':
          return { code: 'noticeUnavailable', kind: 'warning', detail: error.message }
        default:
          return { code: 'noticeFailed', kind: 'error', detail: error.message }
      }
    }
  }
}
