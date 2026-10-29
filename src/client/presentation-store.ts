import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ContextManagerClientProfileMutationBasis } from './mutation-types.js'
import type { ContextManagerClientPromptResourceReadStamp } from './model-types.js'
import type { ContextManagerClientResourceCreateBasis } from './resource-mutation-types.js'
import type { ContextManagerRemotePromptResource, ContextManagerRemotePromptPlacement } from '../remote/types.js'
import type { ResourceDraft, ResourceDraftBlock, ResourceNotice } from './resource-editor.js'
import type {
  ProfileDraft,
  ProfileEditField,
  ProfileDraftBlock,
  ProfileNotice,
} from './profile-editor.js'

export interface ContextManagerPresentationState {
  open: boolean
  pane: 'profiles' | 'resources'
  selectedProfileId: string | null
  selectedResourceId: string | null
  resourceDraft: ResourceDraft | null
  nextResourceDraftToken: number
  resourceNotice: ResourceNotice | null
  draft: ProfileDraft | null
  nextDraftToken: number
  notice: ProfileNotice | null
}

/** View-only state. All authoritative Profile and mutation state remains in B1/B2. */
export function createContextManagerPresentationStore() {
  return defineStore({
    init: (): ContextManagerPresentationState => ({
      open: false,
      pane: 'profiles',
      selectedProfileId: null,
      selectedResourceId: null,
      resourceDraft: null,
      nextResourceDraftToken: 0,
      resourceNotice: null,
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
      selectPane(state, pane: 'profiles' | 'resources') {
        if (state.pane === pane) return
        if (state.draft !== null || state.resourceDraft !== null) {
          if (state.pane === 'profiles') {
            state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          } else {
            state.resourceNotice = { code: 'resourceNoticeDraftActive', kind: 'warning' }
          }
          return
        }
        state.pane = pane
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
      beginPromptBindingCreate(state, input: {
        profileId: string
        basis: ContextManagerClientProfileMutationBasis
      }) {
        if (state.draft !== null || state.resourceDraft !== null || state.pane !== 'profiles') {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.nextDraftToken += 1
        state.selectedProfileId = input.profileId
        state.draft = {
          kind: 'prompt-binding-create', token: state.nextDraftToken,
          basis: Object.freeze({ ...input.basis }), profileId: input.profileId,
          bindingId: '', resourceId: '', enabled: true,
          placement: 'before-persona', orderText: '0',
        }
        state.notice = null
      },
      updatePromptBindingCreate(state,
        field: 'bindingId' | 'resourceId' | 'enabled' | 'placement' | 'orderText',
        value: string | boolean,
      ) {
        const draft = state.draft
        if (draft?.kind !== 'prompt-binding-create' || draft.blocked) return
        if (field === 'enabled' && typeof value === 'boolean') draft.enabled = value
        else if (field === 'placement' && typeof value === 'string'
          && (['before-persona', 'after-persona', 'before-tool-guidance',
            'after-tool-guidance', 'runtime-context'] as string[]).includes(value)) {
          draft.placement = value as ContextManagerRemotePromptPlacement
        } else if (field !== 'enabled' && field !== 'placement' && typeof value === 'string') {
          draft[field] = value
        } else return
        state.notice = null
      },
      beginPromptBindingFieldEdit(state, input: {
        profileId: string
        bindingId: string
        basis: ContextManagerClientProfileMutationBasis
      } & (
        | { field: 'resourceId'; original: string }
        | { field: 'enabled'; original: boolean }
        | { field: 'placement'; original: ContextManagerRemotePromptPlacement }
        | { field: 'order'; original: number }
      )) {
        if (state.draft !== null || state.resourceDraft !== null || state.pane !== 'profiles') {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.nextDraftToken += 1
        state.selectedProfileId = input.profileId
        const base = {
          kind: 'prompt-binding-edit-field' as const, token: state.nextDraftToken,
          basis: Object.freeze({ ...input.basis }), profileId: input.profileId,
          bindingId: input.bindingId,
        }
        switch (input.field) {
          case 'resourceId':
            state.draft = { ...base, field: 'resourceId',
              original: input.original, value: input.original }
            break
          case 'enabled':
            state.draft = { ...base, field: 'enabled',
              original: input.original, value: input.original }
            break
          case 'placement':
            state.draft = { ...base, field: 'placement',
              original: input.original, value: input.original }
            break
          case 'order':
            state.draft = { ...base, field: 'order',
              original: input.original, value: String(input.original) }
            break
        }
        state.notice = null
      },
      updatePromptBindingField(state, value: string | boolean) {
        const draft = state.draft
        if (draft?.kind !== 'prompt-binding-edit-field' || draft.blocked) return
        if (draft.field === 'enabled') {
          if (typeof value !== 'boolean') return
          draft.value = value
        } else {
          if (typeof value !== 'string') return
          if (draft.field === 'placement') {
            if (!(['before-persona', 'after-persona', 'before-tool-guidance',
              'after-tool-guidance', 'runtime-context'] as string[]).includes(value)) return
            draft.value = value as ContextManagerRemotePromptPlacement
          } else draft.value = value
        }
        state.notice = null
      },
      beginPromptBindingDelete(state, input: {
        profileId: string
        bindingId: string
        basis: ContextManagerClientProfileMutationBasis
      }) {
        if (state.draft !== null || state.resourceDraft !== null || state.pane !== 'profiles') {
          state.notice = { code: 'noticeDraftActive', kind: 'warning' }
          return
        }
        state.nextDraftToken += 1
        state.selectedProfileId = input.profileId
        state.draft = {
          kind: 'prompt-binding-delete', token: state.nextDraftToken,
          basis: Object.freeze({ ...input.basis }),
          profileId: input.profileId, bindingId: input.bindingId,
        }
        state.notice = null
      },
      setPromptBindingNotice(state, token: number, notice: ProfileNotice) {
        if (state.draft?.token !== token || !state.draft.kind.startsWith('prompt-binding-')) return
        state.notice = notice
      },
      blockPromptBindingDraft(state, token: number,
        reason: 'unknown' | 'conflict' | 'stale' | 'unverified',
      ) {
        if (state.draft?.token !== token || !state.draft.kind.startsWith('prompt-binding-')) return
        state.draft.blocked = reason
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
      selectResource(state, id: string | null) {
        if (state.resourceDraft !== null) {
          state.resourceNotice = { code: 'resourceNoticeDraftActive', kind: 'warning' }
          return
        }
        state.selectedResourceId = id
        state.resourceNotice = null
      },
      beginResourceCreate(state, basis: ContextManagerClientResourceCreateBasis) {
        if (state.resourceDraft !== null || state.draft !== null) {
          state.resourceNotice = { code: 'resourceNoticeDraftActive', kind: 'warning' }
          return
        }
        state.nextResourceDraftToken += 1
        state.resourceDraft = {
          kind: 'create', token: state.nextResourceDraftToken,
          basis: Object.freeze({ ...basis }), id: '', name: '', description: '', content: '',
        }
        state.resourceNotice = null
      },
      beginResourceEdit(state, document: ContextManagerRemotePromptResource, stamp: ContextManagerClientPromptResourceReadStamp) {
        if (state.resourceDraft !== null || state.draft !== null) {
          state.resourceNotice = { code: 'resourceNoticeDraftActive', kind: 'warning' }
          return
        }
        state.nextResourceDraftToken += 1
        state.selectedResourceId = document.id
        state.resourceDraft = {
          kind: 'edit', token: state.nextResourceDraftToken,
          stamp: Object.freeze({ ...stamp }),
          original: Object.freeze({
            name: document.name, description: document.description, content: document.content,
          }),
          name: document.name,
          description: document.description ?? '',
          content: document.content,
          removeDescription: false,
          descriptionTouched: false,
        }
        state.resourceNotice = null
      },
      beginResourceDelete(state, id: string, name: string, stamp: ContextManagerClientPromptResourceReadStamp) {
        if (state.resourceDraft !== null || state.draft !== null) {
          state.resourceNotice = { code: 'resourceNoticeDraftActive', kind: 'warning' }
          return
        }
        state.nextResourceDraftToken += 1
        state.selectedResourceId = id
        state.resourceDraft = {
          kind: 'delete', token: state.nextResourceDraftToken,
          stamp: Object.freeze({ ...stamp }), resourceId: id, name,
        }
        state.resourceNotice = null
      },
      updateResourceCreate(state, field: 'id' | 'name' | 'description' | 'content', value: string) {
        if (state.resourceDraft?.kind !== 'create' || state.resourceDraft.blocked) return
        state.resourceDraft[field] = value
        state.resourceNotice = null
      },
      updateResourceEdit(state, field: 'name' | 'description' | 'content', value: string) {
        if (state.resourceDraft?.kind !== 'edit' || state.resourceDraft.blocked) return
        state.resourceDraft[field] = value
        if (field === 'description') {
          state.resourceDraft.descriptionTouched = true
          state.resourceDraft.removeDescription = false
        }
        state.resourceNotice = null
      },
      markResourceDescriptionRemoved(state) {
        if (state.resourceDraft?.kind !== 'edit' || state.resourceDraft.blocked) return
        state.resourceDraft.removeDescription = true
        state.resourceDraft.descriptionTouched = true
        state.resourceNotice = null
      },
      markResourceDescriptionEmpty(state) {
        if (state.resourceDraft?.kind !== 'edit' || state.resourceDraft.blocked) return
        state.resourceDraft.description = ''
        state.resourceDraft.removeDescription = false
        state.resourceDraft.descriptionTouched = true
        state.resourceNotice = null
      },
      blockResourceDraft(state, token: number, reason: ResourceDraftBlock, notice: ResourceNotice | null) {
        if (state.resourceDraft?.token !== token) return
        state.resourceDraft.blocked = reason
        state.resourceNotice = notice
      },
      completeResourceDraft(state, token: number, notice: ResourceNotice | null, selectId?: string | null) {
        if (state.resourceDraft?.token !== token) return
        state.resourceDraft = null
        if (selectId !== undefined) state.selectedResourceId = selectId
        state.resourceNotice = notice
      },
      cancelResourceDraft(state) {
        state.resourceDraft = null
        state.resourceNotice = null
      },
      setResourceNotice(state, notice: ResourceNotice | null) {
        state.resourceNotice = notice
      },
      setNotice(state, notice: ProfileNotice | null) {
        state.notice = notice
      },
    },
  })
}

export type ContextManagerPresentationStoreHandle = ReturnType<typeof createContextManagerPresentationStore>
