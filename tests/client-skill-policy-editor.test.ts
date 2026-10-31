import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createContextManagerPresentationStore, ownsLiveProfileDraft,
  readLivePresentationForActions, terminalProfileNotice,
} from '../src/client/presentation-store.js'
import {
  isSkillDraft, sortedSkillBindings, isWritableSkillPath,
  isSkillBeginCurrent, validateSkillCreate, skillModeEditChanged,
  commitSkillDraft, blockForSkillResult, noticeForSkillResult,
} from '../src/client/skill-policy-editor.js'
import type { SkillDraft } from '../src/client/profile-editor.js'
import type {
  ContextManagerRemoteProfile, ContextManagerRemoteSkillBinding,
  ContextManagerRemoteSkillMode,
} from '../src/remote/types.js'
import type { ContextManagerClientSnapshot } from '../src/client/model-types.js'
import type {
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationResult,
  ContextManagerClientProfileMutations,
} from '../src/client/mutation-types.js'

/**
 * M8B Skill Policy Editor executable behavioral regression contracts.
 * Historical RED->GREEN evidence is recorded in docs/m8b-plan.md; these
 * assertions now exercise the implemented shared Profile Store and helper.
 * Importable typed seams exist on purpose; missing exports, TS errors, and
 * a synthetic test Store do not qualify as RED. Every Store assertion uses
 * actual DSH StoreInstance.actions + getSnapshot. The B2 GREEN implementation
 * must satisfy ALL assertions without weakening M7C/M8A1/M8A2 controls.
 */
const BASIS: ContextManagerClientProfileMutationBasis = Object.freeze({
  instanceId: 'm8b-settings-host-A', revision: 7,
})
const MODES: readonly ContextManagerRemoteSkillMode[] = ['auto', 'manual', 'off', 'pinned']
type Store = ReturnType<ReturnType<typeof createContextManagerPresentationStore>['create']>

function newStore(selected: string | null = 'main'): Store {
  const store = createContextManagerPresentationStore().create()
  store.actions.open()
  if (selected !== null) store.actions.selectProfile(selected)
  return store
}

function requireSkillDraft<K extends SkillDraft['kind']>(
  store: Store, kind: K,
): Extract<SkillDraft, { kind: K }> {
  const current = store.getSnapshot().draft
  assert.ok(current !== null, 'real Store must contain an active Skill draft')
  assert.equal(current.kind, kind, 'the actual Store draft must match the tested Skill action')
  assert.ok(isSkillDraft(current), 'active draft must be recognized as a Skill draft')
  return current as Extract<SkillDraft, { kind: K }>
}

function fixtureCreate(
  skillName = '', mode: ContextManagerRemoteSkillMode = 'auto',
  observedSkillNames: readonly string[] = ['present'],
): Extract<SkillDraft, { kind: 'skill-mode-create' }> {
  return {
    kind: 'skill-mode-create', token: 3, basis: BASIS, profileId: 'main',
    skillName, mode, observedSkillNames,
  }
}
function fixtureEdit(mode: ContextManagerRemoteSkillMode = 'pinned'):
  Extract<SkillDraft, { kind: 'skill-mode-edit' }> {
  return {
    kind: 'skill-mode-edit', token: 4, basis: BASIS, profileId: 'main',
    skillName: 'present', originalMode: 'manual', mode,
  }
}
function fixtureDelete(): Extract<SkillDraft, { kind: 'skill-binding-delete' }> {
  return {
    kind: 'skill-binding-delete', token: 5, basis: BASIS,
    profileId: 'main', skillName: 'present', originalMode: 'manual',
  }
}

function skillProfile(): ContextManagerRemoteProfile {
  const skills = Object.create(null) as Record<string, ContextManagerRemoteSkillBinding>
  Object.defineProperty(skills, 'present', {
    enumerable: true, configurable: true, value: { mode: 'manual' },
  })
  return { name: 'Main', basePreset: 'native', skills, prompts: {} }
}

function fixtureSnapshot(profile = skillProfile()): ContextManagerClientSnapshot {
  return {
    attachment: 'attached', protocol: { status: 'compatible', apiVersion: 3 },
    sync: { status: 'idle' }, instanceId: BASIS.instanceId,
    changes: {
      instanceId: BASIS.instanceId, resourceAuthorityId: 'resource-v1',
      generation: 10, profiles: 5, promptResources: 2, presets: 3, runtime: 4,
    },
    profiles: {
      status: 'ready', stale: false,
      data: {
        schemaVersion: 1, schemaCompatible: true,
        configuredDefaultProfileId: 'main', usableDefaultProfileId: 'main',
        profiles: { main: profile }, diagnostics: [
          { code: 'invalid-profile', profileId: 'broken', message: 'invalid stored Profile' },
        ],
        persistence: {
          available: true, registered: true, writable: true, revision: BASIS.revision,
        },
      },
    },
    presets: { status: 'idle', stale: false },
    promptPlacement: { status: 'idle', stale: false },
    resources: { list: { status: 'idle', stale: false }, documents: new Map() },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
  }
}

function spyProfileMutations(
  reply: ContextManagerClientProfileMutationResult = { status: 'applied', refresh: 'fresh' },
) {
  const calls: Array<{ kind: 'set' | 'remove'; basis: ContextManagerClientProfileMutationBasis;
    profileId: string; skillName: string; mode?: ContextManagerRemoteSkillMode }> = []
  const funcs: Pick<ContextManagerClientProfileMutations, 'setSkillMode' | 'removeSkillBinding'> = {
    async setSkillMode(basis, profileId, skillName, mode) {
      calls.push({ kind: 'set', basis, profileId, skillName, mode })
      return reply
    },
    async removeSkillBinding(basis, profileId, skillName) {
      calls.push({ kind: 'remove', basis, profileId, skillName })
      return reply
    },
  }
  // The tested helper must only use these existing two Profile methods.
  return { calls, api: funcs as ContextManagerClientProfileMutations }
}

for (const mode of MODES) {
  test('B1-S01 contract: real Profile Store begins explicit Skill Create and retains mode ' + mode, () => {
    const store = newStore()
    store.actions.beginSkillModeCreate({
      profileId: 'main', basis: BASIS, observedSkillNames: ['present'],
    })
    const draft = requireSkillDraft(store, 'skill-mode-create')
    assert.equal(draft.token, 1)
    assert.deepEqual(draft.basis, BASIS)
    assert.equal(draft.kind, 'skill-mode-create')
    assert.equal(draft.skillName, '')
    assert.equal(draft.mode, 'auto')
    assert.equal(Object.isFrozen(draft.observedSkillNames), true)
    store.actions.updateSkillMode(draft.token, mode)
    const updated = requireSkillDraft(store, 'skill-mode-create')
    assert.equal(updated.mode, mode)
    assert.equal(store.getSnapshot().resourceDraft, null)
  })
}

test('B1-S02 contract: exact own Skill IDs use code-unit sorting, no whitespace normalization', () => {
  const skills = Object.create(null) as Record<string, ContextManagerRemoteSkillBinding>
  const keys = ['z', ' ', 'constructor', '', 'prototype', 'toString', 'valueOf', '人物', 'A']
  for (const key of keys) Object.defineProperty(skills, key, {
    value: { mode: 'manual' }, enumerable: true, configurable: true,
  })
  const profile: ContextManagerRemoteProfile = {
    name: 'Exact', basePreset: 'native', skills, prompts: {},
  }
  assert.deepEqual(sortedSkillBindings(profile).map(([key]) => key),
    [...keys].sort((a, b) => a < b ? -1 : a > b ? 1 : 0))
  assert.deepEqual(Object.keys(skills), keys,
    'rendering must not rewrite the stored Skill map')
  for (const key of keys) assert.equal(isWritableSkillPath('main', key), true, JSON.stringify(key))
  assert.equal(isWritableSkillPath('main', '__proto__'), false)
  assert.equal(isWritableSkillPath('__proto__', 'safe'), false)
})

test('B1-S03 contract: Configure refuses existing exact own key, not empty or Unicode keys', () => {
  assert.equal(validateSkillCreate(fixtureCreate('present')), 'exists')
  assert.equal(validateSkillCreate(fixtureCreate('')), 'valid')
  assert.equal(validateSkillCreate(fixtureCreate(' ')), 'valid')
  assert.equal(validateSkillCreate(fixtureCreate('人物')), 'valid')
  assert.equal(validateSkillCreate(fixtureCreate('constructor')), 'valid')
  assert.equal(validateSkillCreate(fixtureCreate('__proto__')), 'unsafe-id')
  assert.equal(validateSkillCreate({ ...fixtureCreate('safe'), profileId: '__proto__' }), 'unsafe-id')
  const store = newStore()
  const observed = ['present']
  const mutableBasis = { instanceId: BASIS.instanceId, revision: BASIS.revision }
  store.actions.beginSkillModeCreate({
    profileId: 'main', basis: mutableBasis, observedSkillNames: observed,
  })
  const current = requireSkillDraft(store, 'skill-mode-create')
  // Mutate the CALLER'S inputs, not the frozen fixture BASIS.
  mutableBasis.instanceId = 'mutated-after-begin'
  mutableBasis.revision = 99
  observed.push('later')
  assert.deepEqual(current.basis, BASIS, 'captured Basis must be independent of caller object')
  assert.notStrictEqual(current.basis, mutableBasis, 'captured Basis must be copied, not aliased')
  assert.deepEqual(current.observedSkillNames, ['present'],
    'original rendered Skill keys are immutable Begin evidence')
  assert.notStrictEqual(current.observedSkillNames, observed)
  assert.equal(Object.isFrozen(current.basis), true)
  assert.equal(Object.isFrozen(current.observedSkillNames), true)
})

test('B1-S04 contract: mode Edit keeps original identity and only changes one leaf', async () => {
  const store = newStore()
  store.actions.beginSkillModeEdit({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  const first = requireSkillDraft(store, 'skill-mode-edit')
  store.actions.updateSkillMode(first.token, 'pinned')
  const updated = requireSkillDraft(store, 'skill-mode-edit')
  assert.equal(updated.skillName, 'present')
  assert.equal(updated.originalMode, 'manual')
  assert.equal(updated.mode, 'pinned')
  const { calls, api } = spyProfileMutations()
  const result = commitSkillDraft(updated, api)
  assert.ok(result, 'changed Edit dispatches exactly one existing setter')
  await result
  assert.deepEqual(calls, [{
    kind: 'set', basis: BASIS, profileId: 'main', skillName: 'present', mode: 'pinned',
  }])
})

test('B1-S04 contract: unchanged Mode emits no RPC; explicit Delete emits one remove', async () => {
  const { calls, api } = spyProfileMutations()
  const unchanged = fixtureEdit('manual')
  assert.equal(skillModeEditChanged(unchanged), false)
  assert.equal(commitSkillDraft(unchanged, api), undefined)
  assert.equal(calls.length, 0)
  assert.equal(skillModeEditChanged(fixtureEdit('pinned')), true)
  const removal = commitSkillDraft(fixtureDelete(), api)
  assert.ok(removal, 'Delete confirmation must call exactly one whole-binding removal')
  await removal
  assert.deepEqual(calls, [{
    kind: 'remove', basis: BASIS, profileId: 'main', skillName: 'present',
  }])
})

test('B1-S01/S04 contract: explicit Auto Create cannot collapse into absent binding', async () => {
  const { calls, api } = spyProfileMutations()
  const result = commitSkillDraft(fixtureCreate('', 'auto'), api)
  assert.ok(result, 'explicit Auto is one actual setter, not a no-op or removal')
  await result
  assert.deepEqual(calls, [{
    kind: 'set', basis: BASIS, profileId: 'main', skillName: '', mode: 'auto',
  }])
})

test('B1-S05 contract: Skill draft occupies same visible Profile slot as existing editors', () => {
  const store = newStore()
  store.actions.beginSkillBindingDelete({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  const original = requireSkillDraft(store, 'skill-binding-delete')
  store.actions.beginCreate(BASIS)
  store.actions.beginPromptBindingCreate({ profileId: 'main', basis: BASIS })
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().draft?.token, original.token)
  assert.equal(store.getSnapshot().pane, 'profiles')
  assert.equal(store.getSnapshot().resourceDraft, null)

  const occupied = newStore()
  occupied.actions.beginPromptBindingCreate({ profileId: 'main', basis: BASIS })
  const legacy = occupied.getSnapshot().draft
  assert.ok(legacy)
  occupied.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: [],
  })
  assert.equal(occupied.getSnapshot().draft?.token, legacy.token,
    'Skill Begin must not override an existing M8A2 draft')
})

test('B1-S06 contract: old Token Input/Cancel/Discard cannot mutate a newer Skill draft', () => {
  const store = newStore()
  store.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: ['present'],
  })
  const first = requireSkillDraft(store, 'skill-mode-create')
  store.actions.updateSkillCreateName(first.token, 'first')
  store.actions.cancelDraft(first.token)
  store.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: ['present'],
  })
  const second = requireSkillDraft(store, 'skill-mode-create')
  assert.notEqual(second.token, first.token)
  store.actions.updateSkillCreateName(first.token, 'obsolete')
  store.actions.updateSkillMode(first.token, 'pinned')
  store.actions.cancelDraft(first.token)
  store.actions.discardBlockedDraft(first.token)
  const unchanged = requireSkillDraft(store, 'skill-mode-create')
  assert.equal(unchanged.skillName, '')
  assert.equal(unchanged.mode, 'auto')
  store.actions.updateSkillCreateName(second.token, 'same-token')
  store.actions.updateSkillMode(second.token, 'off')
  const current = requireSkillDraft(store, 'skill-mode-create')
  assert.equal(current.skillName, 'same-token')
  assert.equal(current.mode, 'off')
})

test('B1-S07 contract: synchronous same-frame submit claim forbids double dispatch or Cancel', () => {
  const store = newStore()
  store.actions.beginSkillModeEdit({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  const draft = requireSkillDraft(store, 'skill-mode-edit')
  assert.equal(ownsLiveProfileDraft(readLivePresentationForActions(store.actions), draft), true)
  store.actions.beginProfileSubmission(draft.token)
  const claimed = store.getSnapshot().draft
  assert.equal(claimed?.token, draft.token)
  assert.equal(claimed?.submitting, true)
  store.actions.beginProfileSubmission(draft.token)
  store.actions.cancelDraft(draft.token)
  assert.equal(store.getSnapshot().draft?.submitting, true)
  assert.equal(ownsLiveProfileDraft(readLivePresentationForActions(store.actions), draft), false)
})

test('B1-S08 contract: closed Skill Begin stays inert and reopened fresh Begin is authorized', () => {
  const store = newStore()
  store.actions.close()
  const before = store.getSnapshot()
  store.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: [],
  })
  store.actions.beginSkillModeEdit({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  store.actions.beginSkillBindingDelete({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().nextDraftToken, before.nextDraftToken)
  assert.deepEqual(store.getSnapshot().notice, before.notice)
  store.actions.open()
  store.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: [],
  })
  const preserved = requireSkillDraft(store, 'skill-mode-create')
  store.actions.close()
  store.actions.open()
  assert.equal(store.getSnapshot().draft?.token, preserved.token)
})

test('B1-S09 contract: old root Store actions revoked on remount, new Skill Begin still works', () => {
  const owner = createContextManagerPresentationStore()
  const old = owner.create()
  old.actions.open()
  old.actions.selectProfile('main')
  const oldLive = readLivePresentationForActions(old.actions)
  assert.ok(oldLive)
  const next = owner.create()
  next.actions.open()
  next.actions.selectProfile('main')
  assert.equal(readLivePresentationForActions(old.actions), undefined)
  assert.ok(readLivePresentationForActions(next.actions))
  next.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: [],
  })
  requireSkillDraft(next, 'skill-mode-create')
  owner.revokeSnapshotReader()
  assert.equal(readLivePresentationForActions(next.actions), undefined)
})

test('B1-B01 contract: old Profile Settings revision or instance rejects Begin, not silently recaptured', () => {
  const profile = skillProfile()
  const snapshot = fixtureSnapshot(profile)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile, BASIS), true)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile,
    { ...BASIS, revision: BASIS.revision + 1 }), false)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile,
    { ...BASIS, instanceId: 'other-instance' }), false)
  assert.equal(isSkillBeginCurrent({ ...snapshot, instanceId: 'other-instance' },
    'main', profile, BASIS), false)
})

test('B1-B02 contract: Edit/Delete must target the exact original own Skill binding', () => {
  const profile = skillProfile()
  const snapshot = fixtureSnapshot(profile)
  const binding = profile.skills.present
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile, BASIS, {
    skillName: 'present', renderedBinding: binding, originalMode: 'manual',
  }), true)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile, BASIS, {
    skillName: 'present', renderedBinding: { ...binding }, originalMode: 'manual',
  }), false)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile, BASIS, {
    skillName: 'present', renderedBinding: binding, originalMode: 'off',
  }), false)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile, BASIS, {
    skillName: 'missing', renderedBinding: binding, originalMode: 'manual',
  }), false)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', { ...profile }, BASIS), false)
})

test('B1-B03 contract: Resource-only authority rotation must not invalidate Profile Basis', () => {
  const profile = skillProfile()
  const snapshot = fixtureSnapshot(profile)
  const resourceOnly: ContextManagerClientSnapshot = {
    ...snapshot,
    changes: {
      ...snapshot.changes!, resourceAuthorityId: 'resource-v2',
      generation: 500, promptResources: 900,
    },
  }
  assert.equal(isSkillBeginCurrent(resourceOnly, 'main', profile, BASIS), true)
  assert.equal(isSkillBeginCurrent(resourceOnly, 'main', profile, BASIS, {
    skillName: 'present', renderedBinding: profile.skills.present, originalMode: 'manual',
  }), true)
})

test('B1-B04 contract: old Skill Begin cannot reselect a different active Profile', () => {
  const store = newStore('other')
  const before = store.getSnapshot()
  store.actions.beginSkillModeEdit({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  assert.equal(store.getSnapshot().selectedProfileId, 'other')
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().nextDraftToken, before.nextDraftToken)
  store.actions.selectProfile('main')
  store.actions.beginSkillModeEdit({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  requireSkillDraft(store, 'skill-mode-edit')
})

test('B1-B05 contract: writable published Profile only; invalid rows are never synthesized', () => {
  const profile = skillProfile()
  const snapshot = fixtureSnapshot(profile)
  assert.equal(isSkillBeginCurrent(snapshot, 'main', profile, BASIS), true)
  assert.equal(isSkillBeginCurrent({
    ...snapshot, profiles: { ...snapshot.profiles, stale: true },
  }, 'main', profile, BASIS), false)
  assert.equal(isSkillBeginCurrent({
    ...snapshot, profiles: { ...snapshot.profiles,
      data: { ...snapshot.profiles.data!, persistence: {
        ...snapshot.profiles.data!.persistence, writable: false,
      } },
    },
  }, 'main', profile, BASIS), false)
  assert.equal(isSkillBeginCurrent(snapshot, 'broken', profile, BASIS), false)
  assert.equal(isSkillBeginCurrent({ ...snapshot, attachment: 'detached' },
    'main', profile, BASIS), false)
})

test('B1-T01 contract: Unknown, Conflict, confirmed degraded are three different outcomes', () => {
  const unknown: ContextManagerClientProfileMutationResult = {
    status: 'unknown', refresh: 'fresh',
    error: { kind: 'call-rejected', message: 'transport lost after write' },
  }
  const conflict: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'profile-conflict', message: 'expected 7 actual 8' },
  }
  const degraded: ContextManagerClientProfileMutationResult = {
    status: 'applied', refresh: 'degraded',
  }
  assert.equal(blockForSkillResult(unknown), 'unknown')
  assert.equal(noticeForSkillResult(unknown)?.detail, 'transport lost after write')
  assert.equal(blockForSkillResult(conflict), 'conflict')
  assert.equal(noticeForSkillResult(conflict)?.detail, 'expected 7 actual 8')
  assert.equal(blockForSkillResult(degraded), 'unverified')
  assert.equal(noticeForSkillResult(degraded)?.code, 'noticeSavedDegraded')
  assert.equal(blockForSkillResult({ status: 'applied', refresh: 'fresh' }), undefined)
  assert.equal(noticeForSkillResult({ status: 'applied', refresh: 'fresh' })?.code, 'noticeSaved')
})

test('B1-T02 contract: first terminal Skill receipt survives late refresh and navigation', () => {
  const store = newStore()
  store.actions.beginSkillModeEdit({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  const active = requireSkillDraft(store, 'skill-mode-edit')
  store.actions.blockDraft(active.token, 'unknown', {
    code: 'noticeOutcomeUnknown', kind: 'warning', detail: 'the first unknown',
  })
  store.actions.blockDraft(active.token, 'conflict', {
    code: 'noticeConflict', kind: 'warning', detail: 'late contradiction',
  })
  store.actions.setNotice({ code: 'noticeRefreshFailed', kind: 'error' })
  store.actions.completeDraft(active.token, { code: 'noticeSaved', kind: 'success' })
  store.actions.selectPane('resources')
  store.actions.selectProfile('other')
  assert.equal(store.getSnapshot().draft?.blocked, 'unknown')
  assert.deepEqual(terminalProfileNotice(store.getSnapshot()), {
    code: 'noticeOutcomeUnknown', kind: 'warning', detail: 'the first unknown',
  })
  assert.equal(store.getSnapshot().notice?.detail, 'the first unknown')
  assert.equal(store.getSnapshot().selectedProfileId, 'main')
})

test('B1-T03 contract: wrong-token Discard or notice cannot clear Skill terminal owner', () => {
  const store = newStore()
  store.actions.beginSkillBindingDelete({
    profileId: 'main', skillName: 'present', originalMode: 'manual', basis: BASIS,
  })
  const active = requireSkillDraft(store, 'skill-binding-delete')
  store.actions.blockDraft(active.token, 'unverified', {
    code: 'noticeSavedDegraded', kind: 'warning', detail: 'confirmed but unreadable',
  })
  store.actions.setSkillDraftNotice(active.token + 1, {
    code: 'noticeRefreshFailed', kind: 'error', detail: 'obsolete',
  })
  store.actions.discardBlockedDraft(active.token + 1)
  store.actions.cancelDraft(active.token)
  assert.equal(store.getSnapshot().draft?.token, active.token)
  assert.equal(store.getSnapshot().notice?.detail, 'confirmed but unreadable')
  store.actions.discardBlockedDraft(active.token)
  assert.equal(store.getSnapshot().draft, null)
})

test('B1-T04 contract: unseen external Settings writer causes one original-basis CAS attempt', async () => {
  const conflict: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'profile-conflict', message: 'CAS 7 != 8' },
  }
  const { calls, api } = spyProfileMutations(conflict)
  const original = fixtureEdit('off')
  const call = commitSkillDraft(original, api)
  assert.ok(call, 'a non-observable external writer is decided by the Host CAS')
  const reply = await call
  assert.equal(reply.status, 'rejected')
  assert.deepEqual(calls, [{
    kind: 'set', basis: BASIS, profileId: 'main', skillName: 'present', mode: 'off',
  }], 'one attempted RPC, original Settings Basis and no hidden retry')
  assert.equal(blockForSkillResult(reply), 'conflict')
})

test('B1-S02 independent contract: recognize all three Skill draft kinds, not legacy Profile kinds', () => {
  for (const draft of [fixtureCreate('', 'auto'), fixtureEdit('off'), fixtureDelete()]) {
    assert.equal(isSkillDraft(draft), true, draft.kind)
  }
  assert.equal(isSkillDraft(null), false)
  assert.equal(isSkillDraft({
    kind: 'confirm-delete', token: 7, basis: BASIS, profileId: 'main',
  }), false)
})

test('B1-S02 independent contract: inherited Skill keys never masquerade as own stored bindings', () => {
  const inherited = Object.create(null) as Record<string, ContextManagerRemoteSkillBinding>
  Object.defineProperty(inherited, 'constructor', {
    enumerable: true, value: { mode: 'manual' }, configurable: true,
  })
  const skills = Object.create(inherited) as Record<string, ContextManagerRemoteSkillBinding>
  Object.defineProperty(skills, 'toString', {
    enumerable: true, value: { mode: 'off' }, configurable: true,
  })
  Object.defineProperty(skills, '__proto__', {
    enumerable: true, value: { mode: 'pinned' }, configurable: true,
  })
  const profile: ContextManagerRemoteProfile = {
    name: 'Exact', basePreset: 'native', skills, prompts: {},
  }
  assert.deepEqual(sortedSkillBindings(profile).map(([name]) => name),
    ['__proto__', 'toString'])
  assert.equal(isWritableSkillPath('main', '__proto__'), false,
    'historical unsafe own key is viewable but never editable')
  assert.equal(isWritableSkillPath('main', 'constructor'), true)
})

test('B1-S03 independent contract: observed duplicate cannot silently become explicit Auto', () => {
  const duplicate = fixtureCreate('present', 'auto')
  assert.equal(validateSkillCreate(duplicate), 'exists')
  const { calls, api } = spyProfileMutations()
  assert.equal(commitSkillDraft(duplicate, api), undefined,
    'invalid duplicate must not call existing setSkillMode')
  assert.equal(calls.length, 0)
})

test('B1-S04 independent contract: mode mutation keeps exact original Basis and name', async () => {
  const { calls, api } = spyProfileMutations()
  const draft = fixtureEdit('pinned')
  assert.equal(skillModeEditChanged(draft), true)
  const outcome = commitSkillDraft(draft, api)
  assert.ok(outcome)
  await outcome
  assert.deepEqual(calls, [
    { kind: 'set', basis: BASIS, profileId: 'main', skillName: 'present', mode: 'pinned' },
  ])
  assert.strictEqual(calls[0]?.basis, BASIS,
    'helper must not silently recapture a fresh Settings revision')
})

test('B1-S05 positive control: a real Resource draft excludes Skill Begin and preserves pane', () => {
  const store = newStore()
  store.actions.selectPane('resources')
  store.actions.beginResourceCreate({ resourceAuthorityId: 'independent-resource-source' })
  const resource = store.getSnapshot().resourceDraft
  assert.ok(resource !== null)
  const beforeToken = store.getSnapshot().nextDraftToken
  store.actions.beginSkillModeCreate({
    profileId: 'main', basis: BASIS, observedSkillNames: [],
  })
  assert.strictEqual(store.getSnapshot().resourceDraft, resource)
  assert.equal(store.getSnapshot().draft, null)
  assert.equal(store.getSnapshot().nextDraftToken, beforeToken)
  assert.equal(store.getSnapshot().pane, 'resources')
})

test('B1-T01 independent contract: missing Skill/invalid mode/unsafe path are not outcome Unknown', () => {
  const missing: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'skill-binding-not-found', message: 'own Skill key missing' },
  }
  const invalid: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'not-requested',
    error: { kind: 'business', code: 'invalid-skill-mode', message: 'unsupported mode' },
  }
  const unsafe: ContextManagerClientProfileMutationResult = {
    status: 'rejected', refresh: 'not-requested',
    error: { kind: 'business', code: 'unsafe-path-key', message: 'unsafe Settings segment' },
  }
  assert.equal(blockForSkillResult(missing), 'stale')
  assert.equal(noticeForSkillResult(missing)?.detail, 'own Skill key missing')
  assert.equal(blockForSkillResult(invalid), undefined)
  assert.equal(noticeForSkillResult(invalid)?.code, 'noticeInvalidInput')
  assert.equal(blockForSkillResult(unsafe), undefined)
  assert.equal(noticeForSkillResult(unsafe)?.detail, 'unsafe Settings segment')
})
