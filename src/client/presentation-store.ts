import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ContextManagerClientProfileMutationBasis } from './mutation-types.js'
import type {
  ProfileDraft,
  ProfileEditField,
  ProfileDraftBlock,
  ProfileNotice,
} from './profile-editor.js'

export interface ContextManagerPresentationState {
  open: boolean
  selectedProfileId: string | null
  draft: ProfileDraft | null
  nextDraftToken: number
  notice: ProfileNotice | null
}

/** View-only state. All authoritative Profile and mutation state remains in B1/B2. */
export function createContextManagerPresentationStore() {
  return defineStore({
    init: (): ContextManagerPresentationState => ({
      open: false,
      selectedProfileId: null,
      draft: null,
      nextDraftToken: 0,
      notice: null,
    }),
    actions: {
      open(state) {
        state.open = true
      },
      close(state) {
        // Closing does not silently discard a pending draft.
        state.open = false
      },
      toggle(state) {
        state.open = !state.open
      },
      selectProfile(state, id: string | null) {
        if (state.draft !== null) {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.selectedProfileId = id
        state.notice = null
      },
      beginCreate(state, basis: ContextManagerClientProfileMutationBasis) {
        if (state.draft !== null) {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.nextDraftToken += 1
        state.draft = {
          kind: 'create',
          token: state.nextDraftToken,
          basis,
          id: '',
          name: '',
          description: '',
          basePreset: '',
        }
        state.notice = null
      },
      beginFieldEdit(state, input: {
        profileId: string
        field: ProfileEditField
        original: string | undefined
        basis: ContextManagerClientProfileMutationBasis
      }) {
        if (state.draft !== null) {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.nextDraftToken += 1
        state.selectedProfileId = input.profileId
        state.draft = {
          kind: 'edit-field',
          token: state.nextDraftToken,
          basis: input.basis,
          profileId: input.profileId,
          field: input.field,
          original: input.original,
          value: input.original ?? '',
          removeDescription: false,
        }
        state.notice = null
      },
      beginDelete(state, profileId: string, basis: ContextManagerClientProfileMutationBasis) {
        if (state.draft !== null) {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.nextDraftToken += 1
        state.selectedProfileId = profileId
        state.draft = {
          kind: 'confirm-delete',
          token: state.nextDraftToken,
          basis,
          profileId,
        }
        state.notice = null
      },
      updateCreate(state, field: 'id' | 'name' | 'description' | 'basePreset', value: string) {
        if (state.draft?.kind !== 'create' || state.draft.blocked) return
        state.draft[field] = value
        state.notice = null
      },
      updateField(state, value: string) {
        if (state.draft?.kind !== 'edit-field' || state.draft.blocked) return
        state.draft.value = value
        state.draft.removeDescription = false
        state.notice = null
      },
      markDescriptionRemoved(state) {
        if (
          state.draft?.kind !== 'edit-field'
          || state.draft.field !== 'description'
          || state.draft.blocked
        ) return
        state.draft.removeDescription = true
        state.notice = null
      },
      blockDraft(state, token: number, reason: ProfileDraftBlock, notice: ProfileNotice | null) {
        if (state.draft?.token !== token) return
        state.draft.blocked = reason
        state.notice = notice
      },
      completeDraft(state, token: number, notice: ProfileNotice | null, selectId?: string) {
        if (state.draft?.token !== token) return
        state.draft = null
        if (selectId !== undefined) state.selectedProfileId = selectId
        state.notice = notice
      },
      cancelDraft(state) {
        state.draft = null
        state.notice = null
      },
      setNotice(state, notice: ProfileNotice | null) {
        state.notice = notice
      },
    },
  })
}

export type ContextManagerPresentationStoreHandle = ReturnType<typeof createContextManagerPresentationStore>
