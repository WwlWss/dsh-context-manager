import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createContextManagerPresentationStore } from '../src/client/presentation-store.js'
import type { ContextManagerClientProfileMutationBasis } from '../src/client/mutation-types.js'

const BASIS: ContextManagerClientProfileMutationBasis = Object.freeze({
  instanceId: 'm8a2-host-A', revision: 7,
})

/** Compile-time boundary for planned DSH defineStore actions; no loose any or TypeScript suppression. */
interface ExpectedPromptBindingPresentationActions {
  beginPromptBindingCreate(input: {
    profileId: string
    basis: ContextManagerClientProfileMutationBasis
  }): void
  updatePromptBindingCreate(
    field: 'bindingId' | 'resourceId' | 'enabled' | 'placement' | 'orderText',
    value: string | boolean,
  ): void
  beginPromptBindingFieldEdit(input: {
    profileId: string
    bindingId: string
    field: 'resourceId' | 'enabled' | 'placement' | 'order'
    original: string | boolean | number
    basis: ContextManagerClientProfileMutationBasis
  }): void
  updatePromptBindingField(value: string | boolean): void
  beginPromptBindingDelete(input: {
    profileId: string
    bindingId: string
    basis: ContextManagerClientProfileMutationBasis
  }): void
  blockPromptBindingDraft(token: number, reason: 'unknown' | 'conflict' | 'stale' | 'unverified'): void
}

/** Safe partial capability probe while the new actions are deliberately absent (RED). */
function proposedActions(actions: object): Partial<ExpectedPromptBindingPresentationActions> {
  return actions as Partial<ExpectedPromptBindingPresentationActions>
}

type ObservedDraft = {
  kind: string
  token: number
  basis: ContextManagerClientProfileMutationBasis
  profileId: string
  bindingId?: string
  resourceId?: string
  field?: string
  value?: string | boolean | number
  blocked?: string
}

/** The runtime assertions, rather than casts, decide whether implementation exists. */
function bindingDraft(store: ReturnType<ReturnType<typeof createContextManagerPresentationStore>['create']>): ObservedDraft {
  const candidate: unknown = store.getSnapshot().draft
  assert.ok(candidate !== null && typeof candidate === 'object')
  assert.ok('kind' in candidate && typeof candidate.kind === 'string')
  assert.ok('token' in candidate && typeof candidate.token === 'number')
  assert.ok('basis' in candidate && typeof candidate.basis === 'object')
  assert.ok('profileId' in candidate && typeof candidate.profileId === 'string')
  return candidate as ObservedDraft
}

test('M8A2 RED: one shared Profile draft slot accepts exact Binding create and preserves it on close', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = proposedActions(store.actions)
  assert.equal(typeof actions.beginPromptBindingCreate, 'function',
    'M8A2 must add a Profile-scoped Binding draft action; feature is intentionally absent at RED')
  store.actions.selectProfile('main')
  actions.beginPromptBindingCreate?.({ profileId: 'main', basis: BASIS })
  const draft = bindingDraft(store)
  assert.equal(draft.kind, 'prompt-binding-create')
  assert.deepEqual(draft.basis, BASIS)
  assert.equal(typeof actions.updatePromptBindingCreate, 'function')
  actions.updatePromptBindingCreate?.('bindingId', '  exact  ')
  actions.updatePromptBindingCreate?.('resourceId', '__proto__')
  assert.equal(bindingDraft(store).bindingId, '  exact  ')
  assert.equal(bindingDraft(store).resourceId, '__proto__')
  store.actions.close()
  store.actions.open()
  assert.equal(bindingDraft(store).token, draft.token)
  store.actions.selectProfile('other')
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().selectedProfileId, 'main')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.cancelDraft()
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'resources')
})

test('M8A2 RED: Binding leaf draft remains blocked after unknown and cannot be replaced by late actions', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = proposedActions(store.actions)
  assert.equal(typeof actions.beginPromptBindingFieldEdit, 'function')
  assert.equal(typeof actions.blockPromptBindingDraft, 'function')
  store.actions.selectProfile('main')
  actions.beginPromptBindingFieldEdit?.({
    profileId: 'main', bindingId: 'p',
    field: 'resourceId', original: 'missing-1', basis: BASIS,
  })
  const first = bindingDraft(store)
  assert.equal(first.kind, 'prompt-binding-edit-field')
  assert.equal(first.field, 'resourceId')
  assert.equal(typeof actions.updatePromptBindingField, 'function')
  actions.updatePromptBindingField?.('missing-2')
  assert.equal(bindingDraft(store).value, 'missing-2')
  actions.blockPromptBindingDraft?.(first.token, 'unknown')
  assert.equal(bindingDraft(store).blocked, 'unknown')
  actions.updatePromptBindingField?.('silent-replay')
  assert.equal(bindingDraft(store).value, 'missing-2')
  store.actions.close()
  store.actions.open()
  assert.equal(bindingDraft(store).blocked, 'unknown')
  store.actions.cancelDraft()
  store.actions.completeDraft(first.token, null)
  assert.equal(store.getSnapshot().draft, null)
})

test('M8A2 RED: Binding delete is explicit and mutually exclusive with other Profile drafts', () => {
  const store = createContextManagerPresentationStore().create()
  const actions = proposedActions(store.actions)
  assert.equal(typeof actions.beginPromptBindingDelete, 'function')
  store.actions.selectProfile('main')
  actions.beginPromptBindingDelete?.({ profileId: 'main', bindingId: 'p', basis: BASIS })
  const draft = bindingDraft(store)
  assert.equal(draft.kind, 'prompt-binding-delete')
  assert.equal(draft.bindingId, 'p')
  store.actions.beginCreate(BASIS)
  assert.equal(bindingDraft(store).token, draft.token)
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'profiles')
  store.actions.cancelDraft()
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().resourceDraft, null)
})
