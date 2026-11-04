import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { ContextManagerClientSnapshot } from '../src/client/model-types.js'
import {
  derivePresetView,
  isPresetDraftCurrent,
  validatePresetCopyDraft,
} from '../src/client/preset-editor.js'
import {
  createContextManagerPresentationStore,
  mayApplyCurrentDraftEvent,
  ownsLivePresetDraft,
  terminalPresetNotice,
} from '../src/client/presentation-store.js'

const SYSTEM = Object.freeze({ id: 'native', trust: 'system' as const, isDefault: true, name: 'Native' })
const USER = Object.freeze({ id: 'user-one', trust: 'user' as const, isDefault: false, name: 'User One' })
const BROKEN = Object.freeze({ id: 'broken', trust: 'user' as const, isDefault: false, broken: 'invalid composition' })

function snapshot(): ContextManagerClientSnapshot {
  return {
    attachment: 'attached',
    protocol: { status: 'compatible', apiVersion: 3 },
    sync: { status: 'idle' },
    changes: {
      instanceId: 'host',
      resourceAuthorityId: 'library',
      generation: 1, profiles: 1, promptResources: 1, presets: 5, runtime: 1,
    },
    instanceId: 'host',
    profiles: { status: 'idle', stale: false },
    presets: { status: 'ready', stale: false, data: {
      directory: { status: 'available', defaultId: 'native', authorable: true, presets: [USER, BROKEN, SYSTEM] },
      profiles: {},
    }},
    promptPlacement: { status: 'idle', stale: false },
    resources: { list: { status: 'idle', stale: false }, documents: new Map() },
    diagnostics: { sessions: new Map(), prompts: new Map(), skills: new Map(), pinned: new Map() },
  }
}

test('M8C B3-B P01 native roster selection is exact and read/write capabilities are conservative', () => {
  const view = derivePresetView(snapshot(), null)
  assert.equal(view.selectedId, 'native')
  assert.equal(view.directoryFresh, true)
  assert.equal(view.canCopy, true)
  assert.equal(view.canRemove, false)
  assert.deepEqual(view.rows.map(row => row.id), ['broken', 'native', 'user-one'])
  const user = derivePresetView(snapshot(), 'user-one')
  assert.equal(user.selectedId, 'user-one')
  assert.equal(user.canRemove, true)
  const broken = derivePresetView(snapshot(), 'broken')
  assert.equal(broken.canViewComposition, false)
  const stale = derivePresetView({ ...snapshot(), presets: { ...snapshot().presets, stale: true } }, 'user-one')
  assert.equal(stale.directoryFresh, false)
  assert.equal(stale.canCopy, false)
  assert.equal(stale.canRemove, false)
})

test('M8C B3-B P19 all three panes preserve exclusive live draft ownership', () => {
  const handle = createContextManagerPresentationStore()
  const store = handle.create()
  store.actions.open()
  store.actions.selectPane('presets')
  assert.equal(store.getSnapshot().pane, 'presets')
  store.actions.beginPresetCopy(USER, 5, 'native')
  const draft = store.getSnapshot().presetDraft
  if (draft?.kind !== 'copy') throw new Error('expected copy draft')
  assert.equal(draft.sourceId, 'user-one')
  assert.equal(store.getSnapshot().nextPresetDraftToken, 1)
  assert.equal(ownsLivePresetDraft(store.getSnapshot(), draft), true)
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'presets', 'occupied Preset draft blocks navigation')
  store.actions.beginCreate({ instanceId: 'host', revision: 7 })
  assert.equal(store.getSnapshot().draft, null, 'cannot bypass Preset draft by direct Profile Begin')
  store.actions.selectPane('resources')
  assert.equal(store.getSnapshot().pane, 'presets')
  store.actions.beginResourceCreate({ resourceAuthorityId: 'library' })
  assert.equal(store.getSnapshot().resourceDraft, null, 'cannot bypass Preset draft by direct Resource Begin')
  store.actions.cancelPresetDraft(draft.token)
  assert.equal(store.getSnapshot().presetDraft, null)
  store.actions.selectPane('profiles')
  assert.equal(store.getSnapshot().pane, 'profiles')
  handle.revokeSnapshotReader()
})

test('M8C B3-B P09 remove requires target-matching acknowledgment and blocked receipt survives Cancel', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.open()
  store.actions.selectPane('presets')
  store.actions.beginPresetRemove(USER, 5, 'native')
  const draft = store.getSnapshot().presetDraft
  if (draft?.kind !== 'confirm-remove') throw new Error('expected removal draft')
  assert.equal(draft.confirmationText, '')
  store.actions.updatePresetRemoveConfirmation(draft.token, 'wrong')
  const pending = store.getSnapshot().presetDraft
  if (pending?.kind !== 'confirm-remove') throw new Error('expected removal draft')
  assert.equal(pending.confirmationText, 'wrong')
  store.actions.blockPresetDraft(draft.token, 'unknown', {
    kind: 'warning', code: 'presetNoticeUnknown',
  })
  const first = terminalPresetNotice(store.getSnapshot())
  assert.equal(first?.code, 'presetNoticeUnknown')
  store.actions.cancelPresetDraft(draft.token)
  assert.equal(store.getSnapshot().presetDraft?.token, draft.token)
  store.actions.setPresetNotice({ kind: 'error', code: 'presetNoticeReadFailed' })
  assert.equal(terminalPresetNotice(store.getSnapshot()), first)
  store.actions.discardBlockedPresetDraft(draft.token)
  assert.equal(store.getSnapshot().presetDraft, null)
})

test('M8C B3-B P07 Copy mode preserves null versus deliberately empty display name', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.open()
  store.actions.selectPane('presets')
  store.actions.beginPresetCopy(SYSTEM, 5, 'native')
  const draft = store.getSnapshot().presetDraft
  if (draft?.kind !== 'copy') throw new Error('expected copy draft')
  store.actions.updatePresetCopy(draft.token, 'targetId', '  exact ')
  assert.equal(validatePresetCopyDraft(store.getSnapshot().presetDraft, new Set(['native'])), 'valid')
  const beforeName = store.getSnapshot().presetDraft
  if (beforeName?.kind !== 'copy') throw new Error('expected copy draft')
  assert.equal(beforeName.nameMode, 'inherit')
  store.actions.setPresetNameMode(draft.token, 'explicit')
  store.actions.updatePresetCopy(draft.token, 'explicitName', '')
  const afterName = store.getSnapshot().presetDraft
  if (afterName?.kind !== 'copy') throw new Error('expected copy draft')
  assert.equal(afterName.explicitName, '')
  const current = isPresetDraftCurrent(snapshot(), store.getSnapshot().presetDraft)
  assert.equal(current, true)
})

test('M8C B3-B P13/15 obsolete callbacks lose opened-session authority despite draft retention', () => {
  const handle = createContextManagerPresentationStore()
  const store = handle.create()
  store.actions.open()
  store.actions.selectPane('presets')
  store.actions.beginPresetCopy(SYSTEM, 5, 'native')
  const token = store.getSnapshot().presetDraft?.token
  assert.ok(token)
  const opening = store.getSnapshot().openSessionEpoch
  assert.equal(mayApplyCurrentDraftEvent(store.actions, opening, 'presets', token), true)
  store.actions.close()
  store.actions.open()
  assert.equal(mayApplyCurrentDraftEvent(store.actions, opening, 'presets', token), false)
  assert.equal(store.getSnapshot().presetDraft?.token, token)
  handle.revokeSnapshotReader()
})


test('M8C Strict P24: retained copy and remove drafts cannot migrate to a replacement Host with identical catalog', () => {
  const store = createContextManagerPresentationStore().create()
  store.actions.open()
  store.actions.selectPane('presets')
  const original = snapshot()
  const replacement = {
    ...original,
    instanceId: 'host-replaced',
    changes: { ...original.changes!, instanceId: 'host-replaced' },
  }
  assert.deepEqual(derivePresetView(original, 'native').rows.map(row => row.id),
    derivePresetView(replacement, 'native').rows.map(row => row.id))
  assert.equal(derivePresetView(replacement, 'native').directoryFresh, true)
  store.actions.beginPresetCopy(SYSTEM, 5, 'native')
  assert.equal(isPresetDraftCurrent(original, store.getSnapshot().presetDraft), true)
  assert.equal(isPresetDraftCurrent(replacement, store.getSnapshot().presetDraft), false,
    'an old copy intent cannot target a different Host with numerically identical native cursor')
  store.actions.cancelPresetDraft(store.getSnapshot().presetDraft!.token)
  store.actions.beginPresetRemove(USER, 5, 'native')
  assert.equal(isPresetDraftCurrent(original, store.getSnapshot().presetDraft), true)
  assert.equal(isPresetDraftCurrent(replacement, store.getSnapshot().presetDraft), false,
    'an old remove intent cannot target a different Host with identical user-row metadata')
})
