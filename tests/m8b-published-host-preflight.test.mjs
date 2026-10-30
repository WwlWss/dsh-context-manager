import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  ContextManagerChangeTracker,
  ContextManagerError,
  ContextManagerRemoteService,
  ContextManagerService,
} from '../lib/index.js'

const MODES = ['auto', 'manual', 'off', 'pinned']

class PublishedMemorySettings extends SettingsProvider {
  constructor(ctx, initial = {}) {
    super(ctx)
    this.doc = structuredClone(initial)
  }
  get writable() { return true }
  async load() { return structuredClone(this.doc) }
  async persist(namespace, value) { this.doc[namespace] = structuredClone(value) }
}

async function boot(t) {
  const ctx = new Context()
  const fibers = []
  for (const plugin of [
    PublishedMemorySettings,
    ContextManagerService,
    ContextManagerChangeTracker,
    ContextManagerRemoteService,
  ]) {
    const fiber = ctx.plugin(plugin)
    await fiber
    fibers.push(fiber)
  }
  t.after(async () => {
    for (const fiber of fibers.reverse()) await fiber.dispose()
  })
  return {
    manager: ctx.get('dshContextManager'),
    remote: ctx.get('dshContextRemote'),
  }
}

function basis(remote) {
  return {
    instanceId: remote.changes().instanceId,
    revision: remote.profiles().persistence.revision,
  }
}

function proof(id, outcome = 'pass') {
  console.log('M8B_B0_ASSERT ' + JSON.stringify({ id, outcome }))
}

async function versionOf(name) {
  return JSON.parse(await readFile(new URL('../node_modules/' + name + '/package.json', import.meta.url), 'utf8')).version
}

test('M8B B0 H01-H06/H13: actual published Settings stores exact modes and destructive removes', async t => {
  const { manager, remote } = await boot(t)
  console.log('M8B_B0_PUBLISHED ' + JSON.stringify({
    cordis: await versionOf('@deepseek-ai/cordis'),
    settings: await versionOf('@deepseek-ai/dsh-settings'),
    typert: await versionOf('@deepseek-ai/dsh-typert-protocol'),
  }))
  assert.equal(remote.protocol().apiVersion, 3)
  assert.equal(typeof remote.setSkillMode, 'function')
  assert.equal(typeof remote.removeSkillBinding, 'function')

  await manager.createProfile('main', {
    name: 'Primary', basePreset: 'standard', prompts: {},
    extension: { nested: ['preserve', 0, null] },
    skills: {
      docker: {
        mode: 'manual',
        future: { nested: ['exact', 'unmodified'] },
        placement: 'future-anchor',
      },
      other: { mode: 'pinned', future: 'keep' },
    },
  })
  const storedStart = manager.getStoredProfile('main')
  assert.deepEqual(storedStart.extension, { nested: ['preserve', 0, null] })
  assert.deepEqual(storedStart.skills.docker.future, { nested: ['exact', 'unmodified'] })
  assert.deepEqual(remote.profiles().profiles.main.skills.docker, { mode: 'manual' })
  assert.equal(Object.hasOwn(remote.profiles().profiles.main, 'extension'), false)
  assert.equal(Object.hasOwn(remote.profiles().profiles.main.skills.docker, 'future'), false)
  proof('H01')

  const missing = '  未收录 Skill  '
  const createBasis = basis(remote)
  const autoCreated = await remote.setSkillMode('main', missing, 'auto', createBasis)
  assert.equal(autoCreated.ok, true)
  assert.equal(autoCreated.value.persistence.revision, createBasis.revision + 1)
  assert.equal(Object.hasOwn(manager.getStoredProfile('main').skills, missing), true)
  assert.deepEqual(manager.getStoredProfile('main').skills[missing], { mode: 'auto' })
  assert.equal(remote.profiles().profiles.main.skills[missing].mode, 'auto')
  proof('H02')

  const modeSequence = ['auto', 'manual', 'off', 'pinned', 'auto']
  for (const mode of modeSequence) {
    const before = basis(remote)
    const reply = await remote.setSkillMode('main', 'docker', mode, before)
    assert.equal(reply.ok, true, 'set ' + mode + ': ' + JSON.stringify(reply))
    assert.equal(reply.value.persistence.revision, before.revision + 1)
    const stored = manager.getStoredProfile('main')
    assert.deepEqual(stored.skills.docker, {
      mode,
      future: { nested: ['exact', 'unmodified'] },
      placement: 'future-anchor',
    })
    assert.deepEqual(stored.skills.other, { mode: 'pinned', future: 'keep' })
    assert.deepEqual(stored.extension, { nested: ['preserve', 0, null] })
  }
  proof('H03')

  const beforeRemove = basis(remote)
  const removed = await remote.removeSkillBinding('main', 'docker', beforeRemove)
  assert.equal(removed.ok, true)
  assert.equal(removed.value.persistence.revision, beforeRemove.revision + 1)
  const afterRemove = manager.getStoredProfile('main')
  assert.equal(Object.hasOwn(afterRemove.skills, 'docker'), false)
  assert.deepEqual(afterRemove.skills.other, { mode: 'pinned', future: 'keep' })
  assert.deepEqual(afterRemove.extension, { nested: ['preserve', 0, null] })
  proof('H04')

  // Host behavior for a repeated identical mode is measured, not assumed.
  const sameBefore = basis(remote)
  const same = await remote.setSkillMode('main', missing, 'auto', sameBefore)
  assert.equal(same.ok, true)
  const revisionDelta = same.value.persistence.revision - sameBefore.revision
  assert.ok(revisionDelta === 0 || revisionDelta === 1)
  assert.equal(manager.getStoredProfile('main').skills[missing].mode, 'auto')
  console.log('M8B_B0_SAME_MODE ' + JSON.stringify({ revisionDelta }))
  proof('H05')

  const beforeMissing = basis(remote)
  const notFound = await remote.removeSkillBinding('main', 'absent', beforeMissing)
  assert.equal(notFound.ok, false)
  assert.equal(notFound.error.code, 'skill-binding-not-found')
  assert.equal(remote.profiles().persistence.revision, beforeMissing.revision)
  assert.equal(Object.hasOwn(manager.getStoredProfile('main').skills, 'absent'), false)
  proof('H06')

  // Three distinct states: authored Auto, explicit deletion, never configured.
  assert.equal(Object.hasOwn(manager.getStoredProfile('main').skills, missing), true)
  const beforeAutoRemove = basis(remote)
  const removedAuto = await remote.removeSkillBinding('main', missing, beforeAutoRemove)
  assert.equal(removedAuto.ok, true)
  assert.equal(removedAuto.value.persistence.revision, beforeAutoRemove.revision + 1)
  assert.equal(Object.hasOwn(manager.getStoredProfile('main').skills, missing), false)
  assert.equal(Object.hasOwn(manager.getStoredProfile('main').skills, 'never-configured'), false)
  proof('H13')
})

test('M8B B0 H07-H09: validation and native Settings/instance CAS fail without mutation', async t => {
  const { manager, remote } = await boot(t)
  await manager.createProfile('main', {
    name: 'Main', basePreset: 'standard',
    skills: { docker: { mode: 'manual', extra: { keep: true } } },
    prompts: {},
  })
  const beforeBad = basis(remote)
  const snapshot = structuredClone(manager.getStoredProfile('main'))
  await assert.rejects(
    manager.setSkillMode('main', 'docker', 'banana', beforeBad.revision),
    error => error instanceof ContextManagerError && error.code === 'invalid-skill-mode',
  )
  assert.deepEqual(manager.getStoredProfile('main'), snapshot)
  assert.equal(remote.profiles().persistence.revision, beforeBad.revision)
  proof('H07')

  const oldBasis = basis(remote)
  const valid = await remote.setSkillMode('main', 'docker', 'off', oldBasis)
  assert.equal(valid.ok, true)
  const freshStored = structuredClone(manager.getStoredProfile('main'))
  const stale = await remote.setSkillMode('main', 'docker', 'manual', oldBasis)
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'profile-conflict')
  assert.equal(stale.error.expectedRevision, oldBasis.revision)
  assert.equal(stale.error.actualRevision, oldBasis.revision + 1)
  assert.deepEqual(manager.getStoredProfile('main'), freshStored)
  assert.equal(remote.profiles().persistence.revision, oldBasis.revision + 1)
  proof('H08')

  const current = basis(remote)
  const wrongHost = await remote.removeSkillBinding('main', 'docker', {
    ...current, instanceId: 'former-host-instance',
  })
  assert.equal(wrongHost.ok, false)
  assert.equal(wrongHost.error.code, 'host-instance-conflict')
  assert.deepEqual(manager.getStoredProfile('main'), freshStored)
  assert.equal(remote.profiles().persistence.revision, current.revision)
  proof('H09')
})

test('M8B B0 H10-H11: exact Settings path identity including special JS keys', async t => {
  const { manager, remote } = await boot(t)
  await manager.createProfile('keys', { name: 'Exact keys', basePreset: 'standard', skills: {}, prompts: {} })
  const observed = []
  for (const id of [
    'constructor', 'prototype', '  exact  ', '用户/\tSkill', ' ', '',
    '__proto__',
  ]) {
    const current = basis(remote)
    const state = structuredClone(manager.getStoredProfile('keys'))
    const response = await remote.setSkillMode('keys', id, 'manual', current)
    if (response.ok) {
      assert.equal(response.value.persistence.revision, current.revision + 1)
      assert.equal(Object.hasOwn(manager.getStoredProfile('keys').skills, id), true)
      assert.equal(Object.hasOwn(remote.profiles().profiles.keys.skills, id), true)
      assert.equal(manager.getStoredProfile('keys').skills[id].mode, 'manual')
      observed.push({ id, outcome: 'accepted' })
    } else {
      assert.equal(remote.profiles().persistence.revision, current.revision)
      assert.deepEqual(manager.getStoredProfile('keys'), state)
      observed.push({ id, outcome: 'rejected', code: response.error.code })
      if (id === '__proto__') assert.equal(response.error.code, 'unsafe-path-key')
    }
  }
  for (const id of ['constructor', 'prototype', '  exact  ', '用户/\tSkill']) {
    assert.equal(observed.find(x => x.id === id)?.outcome, 'accepted', JSON.stringify(id))
  }
  assert.equal(observed.find(x => x.id === '__proto__')?.outcome, 'rejected')
  console.log('M8B_B0_PATH_RESULTS ' + JSON.stringify(observed))
  proof('H10')

  const before = basis(remote)
  const stored = structuredClone(manager.getStoredProfile('keys'))
  const illegalProfile = await remote.setSkillMode('__proto__', 'docker', 'off', before)
  assert.equal(illegalProfile.ok, false)
  assert.equal(illegalProfile.error.code, 'unsafe-path-key')
  assert.equal(remote.profiles().persistence.revision, before.revision)
  assert.deepEqual(manager.getStoredProfile('keys'), stored)
  proof('H11')
})

test('M8B B0 H12: Host local repair does not make invalid Profiles writable in ordinary UI', async t => {
  const { manager, remote } = await boot(t)
  await manager.setRawProfile('repairable', {
    name: 42, basePreset: [], extension: { preserved: true },
    skills: { broken: { mode: 'banana', future: true }, docker: { mode: 'manual', placement: 'keep' } },
  })
  assert.equal(Object.hasOwn(remote.profiles().profiles, 'repairable'), false)
  assert.ok(remote.profiles().diagnostics.some(x => x.code === 'invalid-profile' && x.profileId === 'repairable'))
  await manager.setSkillMode('repairable', 'broken', 'auto', manager.snapshot().persistence.revision)
  assert.deepEqual(manager.getStoredProfile('repairable').skills.broken, { mode: 'auto', future: true })
  assert.deepEqual(manager.getStoredProfile('repairable').skills.docker, { mode: 'manual', placement: 'keep' })
  assert.equal(manager.getStoredProfile('repairable').name, 42)
  assert.deepEqual(manager.getStoredProfile('repairable').extension, { preserved: true })
  assert.equal(Object.hasOwn(remote.profiles().profiles, 'repairable'), false)

  await manager.setRawProfile('scalar-skills', {
    name: 'Bad skills', basePreset: 'standard', skills: 'opaque',
  }, manager.snapshot().persistence.revision)
  const before = manager.snapshot().persistence.revision
  await assert.rejects(
    manager.setSkillMode('scalar-skills', 'x', 'off', before),
    error => error instanceof ContextManagerError && error.code === 'profile-path-not-editable',
  )
  assert.equal(manager.snapshot().persistence.revision, before)
  assert.equal(manager.getStoredProfile('scalar-skills').skills, 'opaque')
  proof('H12')
})
