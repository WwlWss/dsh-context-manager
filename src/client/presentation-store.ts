import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ContextManagerClientProfileMutationBasis } from './mutation-types.js'
import type { ContextManagerClientPromptResourceReadStamp } from './model-types.js'
import type { ContextManagerClientResourceCreateBasis } from './resource-mutation-types.js'
import type { ContextManagerRemotePromptResource, ContextManagerRemotePromptPlacement, ContextManagerRemoteSkillMode } from '../remote/types.js'
import type { ResourceDraft, ResourceDraftBlock, ResourceNotice } from './resource-editor.js'
import { isPromptBindingDraft } from './prompt-binding-editor.js'
import type {
  ProfileDraft,
  ProfileEditField,
  ProfileDraftBlock,
  ProfileNotice,
} from './profile-editor.js'

export interface ContextManagerPresentationState {
  open: boolean
  /** Monotonic UI-only session, not a Profile/Resource Host authority or CAS. */
  openSessionEpoch: number
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

/** The published DSH Renderer passes StoreInstance.actions by identity to
 * each root slot. Resolve that exact instance (not a parallel presentation
 * cache) synchronously when a stale React callback attempts a write.
 * A WeakMap permits independent plugin instances; teardown explicitly revokes
 * even callbacks that retain the old actions object. */
const publishedStoreForActions = new WeakMap<object, { getSnapshot(): ContextManagerPresentationState }>()

export function readLivePresentationForActions(
  actions: object,
): ContextManagerPresentationState | undefined {
  return publishedStoreForActions.get(actions)?.getSnapshot()
}

/** The first terminal receipt is presentation-only and belongs to its exact
 * Profile draft token (legacy M7C or Binding). Ordinary UI notices must not
 * reinterpret Unknown, Conflict or any confirmed/degraded Binding outcome. */
export function terminalProfileNotice(
  state: Pick<ContextManagerPresentationState, 'draft'>,
): ProfileNotice | undefined {
  return state.draft?.terminalNotice
}

/** Resource terminal results have the same first-receipt priority as Profile
 * Binding results: later read failures and disabled UI callbacks cannot
 * reinterpret a known Host outcome. */
export function terminalResourceNotice(
  state: Pick<ContextManagerPresentationState, 'resourceDraft'>,
): ResourceNotice | undefined {
  return state.resourceDraft?.terminalNotice
}

function notifyOccupiedProfileDraft(state: ContextManagerPresentationState): void {
  // An obsolete Begin after Drawer Close must not leave a phantom warning on Reopen.
  if (!state.open || terminalProfileNotice(state) !== undefined) return
  state.notice = { code: 'noticeDraftActive', kind: 'warning' }
}

function canBeginProfileDraft(state: ContextManagerPresentationState): boolean {
  return state.open && state.pane === 'profiles' && state.draft === null && state.resourceDraft === null
}

function canBeginResourceDraft(state: ContextManagerPresentationState): boolean {
  return state.open && state.pane === 'resources' && state.resourceDraft === null && state.draft === null
}

function notifyOccupiedResourceDraft(state: ContextManagerPresentationState): void {
  if (!state.open || state.resourceDraft?.blocked !== undefined) return
  state.resourceNotice = { code: 'resourceNoticeDraftActive', kind: 'warning' }
}

/** Never use the previous render's draft flag to authorize a Host RPC. Both
 * selectors read from the existing root DSH Store instance, not a shadow
 * state machine. React rerenders may lag one synchronous Store action. */
/** A retained React handler must belong to this exact Drawer opening. Closing
 * preserves an active draft, but Close -> Reopen revokes pre-Close handlers.
 * Use together with the existing object-identity/token/Host CAS fences. */
export function isLiveDrawerOpenSession(
  current: ContextManagerPresentationState | undefined,
  renderedOpenSessionEpoch: number,
): boolean {
  return current !== undefined
    && current.open
    && current.openSessionEpoch === renderedOpenSessionEpoch
}

export function mayDispatchImmediateProfileWrite(
  current: ContextManagerPresentationState | undefined,
  selectedProfileId: string | null,
): boolean {
  return current !== undefined
    && current.open
    && current.pane === 'profiles'
    && current.selectedProfileId === selectedProfileId
    && current.draft === null
    && current.resourceDraft === null
}

export function ownsLiveProfileDraft(
  current: ContextManagerPresentationState | undefined,
  original: ProfileDraft,
): boolean {
  return current !== undefined
    && current.open
    && current.pane === 'profiles'
    && current.resourceDraft === null
    && current.draft === original
    && original.blocked === undefined
    && original.submitting !== true
}

export function ownsLiveResourceDraft(
  current: ContextManagerPresentationState | undefined,
  original: ResourceDraft,
): boolean {
  return current !== undefined
    && current.open
    && current.pane === 'resources'
    && current.draft === null
    && current.resourceDraft === original
    && original.blocked === undefined
    && original.submitting !== true
}

/** View-only state. All authoritative Profile and mutation state remains in B1/B2. */
export function createContextManagerPresentationStore() {
  const handle = defineStore({
    init: (): ContextManagerPresentationState => ({
      open: false,
      openSessionEpoch: 0,
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
        if (!state.open) {
          state.openSessionEpoch += 1
          state.open = true
        }
      },
      close(state) {
        // Closing does not silently discard a pending draft.
        state.open = false
      },
      toggle(state) {
        if (!state.open) state.openSessionEpoch += 1
        state.open = !state.open
      },
      selectPane(state, pane: 'profiles' | 'resources') {
        if (state.pane === pane) return
        if (state.draft !== null || state.resourceDraft !== null) {
          if (state.pane === 'profiles') notifyOccupiedProfileDraft(state)
          else notifyOccupiedResourceDraft(state)
          return
        }
        state.pane = pane
      },
      selectProfile(state, id: string | null) {
        if (state.draft !== null) {
          notifyOccupiedProfileDraft(state)
          return
        }
        state.selectedProfileId = id
        state.notice = null
      },
      beginCreate(state, basis: ContextManagerClientProfileMutationBasis) {
        if (!canBeginProfileDraft(state)) {
          notifyOccupiedProfileDraft(state)
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
        if (!canBeginProfileDraft(state)) {
          notifyOccupiedProfileDraft(state)
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
        if (!canBeginProfileDraft(state)) {
          notifyOccupiedProfileDraft(state)
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
      /** B1-2b RED-only typed action seams. Deliberately inert until B2 GREEN.
       * Old M7C/M8A2/M8A1 behavior is unchanged. Neither Host nor UI calls
       * can be accidentally dispatched through these placeholders. */
      beginSkillModeCreate(_state, _input: {
        profileId: string
        basis: ContextManagerClientProfileMutationBasis
        observedSkillNames: readonly string[]
      }) {},
      updateSkillCreateName(_state, _token: number, _value: string) {},
      beginSkillModeEdit(_state, _input: {
        profileId: string
        skillName: string
        originalMode: ContextManagerRemoteSkillMode
        basis: ContextManagerClientProfileMutationBasis
      }) {},
      updateSkillMode(_state, _token: number, _mode: ContextManagerRemoteSkillMode) {},
      beginSkillBindingDelete(_state, _input: {
        profileId: string
        skillName: string
        originalMode: ContextManagerRemoteSkillMode
        basis: ContextManagerClientProfileMutationBasis
      }) {},
      setSkillDraftNotice(_state, _token: number, _notice: ProfileNotice) {},
      beginPromptBindingCreate(state, input: {
        profileId: string
        basis: ContextManagerClientProfileMutationBasis
      }) {
        if (!canBeginProfileDraft(state)) {
          notifyOccupiedProfileDraft(state)
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
      updatePromptBindingCreate(state, token: number,
        field: 'bindingId' | 'resourceId' | 'enabled' | 'placement' | 'orderText',
        value: string | boolean,
      ) {
        const draft = state.draft
        if (draft?.kind !== 'prompt-binding-create' || draft.token !== token
          || draft.blocked !== undefined || draft.submitting) return
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
        if (!canBeginProfileDraft(state)) {
          notifyOccupiedProfileDraft(state)
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
      updatePromptBindingField(state, token: number, value: string | boolean) {
        const draft = state.draft
        if (draft?.kind !== 'prompt-binding-edit-field' || draft.token !== token
          || draft.blocked !== undefined || draft.submitting) return
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
        if (!canBeginProfileDraft(state)) {
          notifyOccupiedProfileDraft(state)
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
        if (!isPromptBindingDraft(state.draft) || state.draft.token !== token
          || state.draft.terminalNotice !== undefined) return
        state.notice = notice
      },
      blockPromptBindingDraft(state, token: number,
        reason: 'unknown' | 'conflict' | 'stale' | 'unverified',
      ) {
        if (state.draft?.token !== token || !state.draft.kind.startsWith('prompt-binding-')) return
        state.draft.blocked = reason
        state.draft.submitting = false
      },
      updateCreate(state, token: number, field: 'id' | 'name' | 'description' | 'basePreset', value: string) {
        if (state.draft?.kind !== 'create' || state.draft.token !== token
          || state.draft.blocked !== undefined || state.draft.submitting) return
        state.draft[field] = value
        state.notice = null
      },
      updateField(state, token: number, value: string) {
        if (state.draft?.kind !== 'edit-field' || state.draft.token !== token
          || state.draft.blocked !== undefined || state.draft.submitting) return
        state.draft.value = value
        state.draft.removeDescription = false
        state.notice = null
      },
      markDescriptionRemoved(state, token: number) {
        if (
          state.draft?.kind !== 'edit-field'
          || state.draft.field !== 'description'
          || state.draft.token !== token
          || state.draft.blocked !== undefined || state.draft.submitting
        ) return
        state.draft.removeDescription = true
        state.notice = null
      },
      /** Presentation claim only: performed synchronously before the Host RPC.
       * The Controller still owns Profile global single-flight and CAS. */
      beginProfileSubmission(state, token: number) {
        if (state.pane !== 'profiles' || state.resourceDraft !== null
          || state.draft?.token !== token
          || state.draft.blocked !== undefined || state.draft.submitting) return
        state.draft.submitting = true
      },
      finishProfileSubmission(state, token: number) {
        if (state.draft?.token === token) state.draft.submitting = false
      },
      blockDraft(state, token: number, reason: ProfileDraftBlock, notice: ProfileNotice | null) {
        if (state.draft?.token !== token || state.draft.blocked !== undefined) return
        state.draft.blocked = reason
        state.draft.submitting = false
        if (notice !== null) state.draft.terminalNotice = { ...notice }
        state.notice = notice
      },
      completeDraft(state, token: number, notice: ProfileNotice | null, selectId?: string) {
        // A delayed success must never erase a first terminal receipt for
        // this exact draft, just as the Resource lane already guarantees.
        if (state.draft?.token !== token || state.draft.blocked !== undefined) return
        state.draft = null
        if (selectId !== undefined) state.selectedProfileId = selectId
        state.notice = notice
      },
      /** Ordinary Cancel belongs to the original editing token only. A
       * submitted or terminal-unknown draft cannot be silently discarded. */
      cancelDraft(state, token: number) {
        if (state.draft?.token !== token
          || state.draft.submitting || state.draft.blocked !== undefined) return
        state.draft = null
        state.notice = null
      },
      /** Discard is an explicit confirmation from a blocked result, not the
       * obsolete Cancel callback created before an uncertain Host operation. */
      discardBlockedDraft(state, token: number) {
        if (state.draft?.token !== token
          || state.draft.submitting || state.draft.blocked === undefined) return
        state.draft = null
        state.notice = null
      },
      selectResource(state, id: string | null) {
        if (state.resourceDraft !== null) {
          notifyOccupiedResourceDraft(state)
          return
        }
        state.selectedResourceId = id
        state.resourceNotice = null
      },
      beginResourceCreate(state, basis: ContextManagerClientResourceCreateBasis) {
        if (!canBeginResourceDraft(state)) {
          notifyOccupiedResourceDraft(state)
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
        if (!canBeginResourceDraft(state)) {
          notifyOccupiedResourceDraft(state)
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
        if (!canBeginResourceDraft(state)) {
          notifyOccupiedResourceDraft(state)
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
      updateResourceCreate(state, token: number, field: 'id' | 'name' | 'description' | 'content', value: string) {
        if (state.resourceDraft?.kind !== 'create' || state.resourceDraft.token !== token
          || state.resourceDraft.blocked !== undefined || state.resourceDraft.submitting) return
        state.resourceDraft[field] = value
        state.resourceNotice = null
      },
      updateResourceEdit(state, token: number, field: 'name' | 'description' | 'content', value: string) {
        if (state.resourceDraft?.kind !== 'edit' || state.resourceDraft.token !== token
          || state.resourceDraft.blocked !== undefined || state.resourceDraft.submitting) return
        state.resourceDraft[field] = value
        if (field === 'description') {
          state.resourceDraft.descriptionTouched = true
          state.resourceDraft.removeDescription = false
        }
        state.resourceNotice = null
      },
      markResourceDescriptionRemoved(state, token: number) {
        if (state.resourceDraft?.kind !== 'edit' || state.resourceDraft.token !== token
          || state.resourceDraft.blocked !== undefined || state.resourceDraft.submitting) return
        state.resourceDraft.removeDescription = true
        state.resourceDraft.descriptionTouched = true
        state.resourceNotice = null
      },
      markResourceDescriptionEmpty(state, token: number) {
        if (state.resourceDraft?.kind !== 'edit' || state.resourceDraft.token !== token
          || state.resourceDraft.blocked !== undefined || state.resourceDraft.submitting) return
        state.resourceDraft.description = ''
        state.resourceDraft.removeDescription = false
        state.resourceDraft.descriptionTouched = true
        state.resourceNotice = null
      },
      beginResourceSubmission(state, token: number) {
        if (state.pane !== 'resources' || state.draft !== null
          || state.resourceDraft?.token !== token
          || state.resourceDraft.blocked !== undefined || state.resourceDraft.submitting) return
        state.resourceDraft.submitting = true
      },
      finishResourceSubmission(state, token: number) {
        if (state.resourceDraft?.token === token) state.resourceDraft.submitting = false
      },
      blockResourceDraft(state, token: number, reason: ResourceDraftBlock, notice: ResourceNotice | null) {
        if (state.resourceDraft?.token !== token
          || state.resourceDraft.blocked !== undefined) return
        state.resourceDraft.blocked = reason
        state.resourceDraft.submitting = false
        if (notice !== null) state.resourceDraft.terminalNotice = { ...notice }
        state.resourceNotice = notice
      },
      completeResourceDraft(state, token: number, notice: ResourceNotice | null, selectId?: string | null) {
        if (state.resourceDraft?.token !== token
          || state.resourceDraft.blocked !== undefined) return
        state.resourceDraft = null
        if (selectId !== undefined) state.selectedResourceId = selectId
        state.resourceNotice = notice
      },
      cancelResourceDraft(state, token: number) {
        if (state.resourceDraft?.token !== token
          || state.resourceDraft.submitting || state.resourceDraft.blocked !== undefined) return
        state.resourceDraft = null
        state.resourceNotice = null
      },
      discardBlockedResourceDraft(state, token: number) {
        if (state.resourceDraft?.token !== token
          || state.resourceDraft.submitting || state.resourceDraft.blocked === undefined) return
        state.resourceDraft = null
        state.resourceNotice = null
      },
      setResourceNotice(state, notice: ResourceNotice | null) {
        if (terminalResourceNotice(state) !== undefined) return
        state.resourceNotice = notice
      },
      setNotice(state, notice: ProfileNotice | null) {
        // The first terminal M7C/Binding result wins over ordinary UI events.
        if (terminalProfileNotice(state) !== undefined) return
        state.notice = notice
      },
    },
  })

  // The Renderer resolves the same root StoreHandle once for the sidebar and
  // overlay. Preserve its public spec/create contract; retain only the actual
  // StoreInstance, whose getSnapshot is synchronous and authoritative for
  // presentation ownership. No second store, clone, or shadow draft.
  let rootInstance: ReturnType<typeof handle.create> | undefined
  let revoked = false
  return {
    ...handle,
    create(scopeKey?: string) {
      const instance = handle.create(scopeKey)
      if (scopeKey === undefined && !revoked) {
        // A root remount must revoke the previous actions identity as well,
        // so obsolete callbacks cannot authorize writes into a new root.
        if (rootInstance !== undefined) publishedStoreForActions.delete(rootInstance.actions)
        rootInstance = instance
        publishedStoreForActions.set(instance.actions, instance)
      }
      return instance
    },
    readLiveSnapshot(): ContextManagerPresentationState | undefined {
      return revoked ? undefined : rootInstance?.getSnapshot()
    },
    revokeSnapshotReader() {
      revoked = true
      if (rootInstance !== undefined) publishedStoreForActions.delete(rootInstance.actions)
      rootInstance = undefined
    },
  }
}

export type ContextManagerPresentationStoreHandle = ReturnType<typeof createContextManagerPresentationStore>
