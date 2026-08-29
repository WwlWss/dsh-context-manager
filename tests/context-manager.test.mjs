import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { SettingsConflictError, SettingsProvider } from '@deepseek-ai/dsh-settings'

import {
  CONTEXT_MANAGER_SETTINGS_NAMESPACE,
  ContextManagerError,
  ContextManagerService,
} from '../lib/index.js'

class MemorySettings extends SettingsProvider {
  constructor(ctx, doc = {}) {
    super(ctx)
    this.doc = structuredClone(doc)
  }

  get writable() {
    return true
  }

  async load() {
    return structuredClone(this.doc)
  }

  async persist(ns, section) {
    this.doc[ns] = structuredClone(section)
  }

  externalEdit(doc) {
    this.doc = structuredClone(doc)
    this.publish(this.doc)
  }
}

async function boot(doc = {}) {
  const ctx = new Context()
  const settingsFiber = ctx.plugin(MemorySettings, doc)
  await settingsFiber
  const managerFiber = ctx.plugin(ContextManagerService)
  await managerFiber
  return {
    ctx,
    settings: ctx.get('settings'),
    manager: ctx.get('dshContextManager'),
    settingsFiber,
    managerFiber,
  }
}

const anima = {
  name: 'Anima Development',
  basePreset: 'standard',
  skills: {
    'anima-training': 'auto',
    docker: 'manual',
  },
}

test('service starts without settings and reports persistence honestly', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin(ContextManagerService)
  await fiber

  const manager = ctx.get('dshContextManager')
  assert.ok(manager)
  assert.deepEqual(manager.snapshot().persistence, {
    available: false,
    registered: false,
    writable: false,
  })

  await assert.rejects(
    manager.createProfile('anima', anima),
    error => error instanceof ContextManagerError && error.code === 'persistence-unavailable',
  )
})

test('profile CRUD persists through DSH Settings without resolving references', async () => {
  const { manager, settings } = await boot()

  await manager.createProfile('anima', anima)
  let snapshot = manager.snapshot()
  assert.equal(snapshot.persistence.registered, true)
  assert.equal(snapshot.profiles.anima.name, 'Anima Development')
  assert.equal(snapshot.profiles.anima.skills.docker, 'manual')

  await manager.setDefaultProfile('future-profile', snapshot.persistence.revision)
  snapshot = manager.snapshot()
  assert.equal(snapshot.configuredDefaultProfileId, 'future-profile')
  assert.equal(snapshot.usableDefaultProfileId, undefined)
  assert.equal(snapshot.diagnostics.at(-1)?.code, 'missing-default-profile')

  await manager.setSkillMode('anima', 'future-skill', 'pinned', snapshot.persistence.revision)
  snapshot = manager.snapshot()
  assert.equal(snapshot.profiles.anima.skills['future-skill'], 'pinned')

  const descriptor = settings.describe().find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)
  assert.ok(descriptor)
  assert.equal(descriptor.user.profiles.anima.skills['future-skill'], 'pinned')
})

test('structured writes preserve caller-supplied extension fields', async () => {
  const { manager } = await boot()
  await manager.createProfile('extended', {
    ...anima,
    futureField: {
      keep: true,
      nested: ['a', 'b'],
    },
  })

  const stored = manager.getStoredProfile('extended')
  assert.deepEqual(stored.futureField, {
    keep: true,
    nested: ['a', 'b'],
  })
  assert.equal(manager.snapshot().profiles.extended.name, 'Anima Development')
})

test('deleting a profile preserves the dangling default reference explicitly', async () => {
  const { manager } = await boot()
  await manager.createProfile('anima', anima)
  await manager.setDefaultProfile('anima', manager.snapshot().persistence.revision)
  await manager.deleteProfile('anima', manager.snapshot().persistence.revision)

  const snapshot = manager.snapshot()
  assert.equal(snapshot.configuredDefaultProfileId, 'anima')
  assert.equal(snapshot.usableDefaultProfileId, undefined)
  assert.ok(snapshot.diagnostics.some(item => item.code === 'missing-default-profile' && item.profileId === 'anima'))
})

test('default diagnostics distinguish missing from stored-but-invalid profiles', async () => {
  const { manager } = await boot()
  await manager.setRawProfile('broken', { name: 42, basePreset: 'standard' })
  await manager.setDefaultProfile('broken', manager.snapshot().persistence.revision)

  let snapshot = manager.snapshot()
  assert.ok(snapshot.diagnostics.some(item => item.code === 'invalid-default-profile' && item.profileId === 'broken'))

  await manager.setDefaultProfile('missing', snapshot.persistence.revision)
  snapshot = manager.snapshot()
  assert.ok(snapshot.diagnostics.some(item => item.code === 'missing-default-profile' && item.profileId === 'missing'))
})

test('stored malformed payloads remain visible and detached from callers', async () => {
  const { manager } = await boot()
  await manager.createProfile('good', anima)
  await manager.setRawProfile('broken', {
    name: 42,
    basePreset: ['not', 'a', 'string'],
    futureField: { preserve: true },
  }, manager.snapshot().persistence.revision)

  const snapshot = manager.snapshot()
  assert.ok(snapshot.profiles.good)
  assert.equal(snapshot.profiles.broken, undefined)
  assert.ok(snapshot.diagnostics.some(item => item.code === 'invalid-profile' && item.profileId === 'broken'))
  assert.deepEqual([...manager.listStoredProfileIds()].sort(), ['broken', 'good'])

  const payload = manager.getStoredProfile('broken')
  payload.futureField.preserve = false
  assert.equal(manager.getStoredProfile('broken').futureField.preserve, true)
})

test('structured skill edits use path-local guards instead of whole-profile gating', async () => {
  const { manager } = await boot()
  await manager.setRawProfile('repairable', {
    name: 42,
    basePreset: [],
    futureField: { untouched: true },
    skills: {
      broken: 'banana',
      docker: 'manual',
    },
  })

  await manager.setSkillMode('repairable', 'docker', 'off', manager.snapshot().persistence.revision)
  let stored = manager.getStoredProfile('repairable')
  assert.equal(stored.skills.docker, 'off')
  assert.equal(stored.skills.broken, 'banana')
  assert.deepEqual(stored.futureField, { untouched: true })

  await manager.setSkillMode('repairable', 'broken', 'auto', manager.snapshot().persistence.revision)
  stored = manager.getStoredProfile('repairable')
  assert.equal(stored.skills.broken, 'auto')
  assert.equal(stored.name, 42)
})

test('structured skill edits never replace non-object path segments', async () => {
  const { manager } = await boot()
  await manager.setRawProfile('primitive', 'DO NOT TOUCH')

  await assert.rejects(
    manager.setSkillMode('primitive', 'docker', 'off', manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'profile-path-not-editable',
  )
  assert.equal(manager.getStoredProfile('primitive'), 'DO NOT TOUCH')

  await manager.setRawProfile('bad-skills', {
    name: 'Bad skills',
    basePreset: 'standard',
    skills: 'DO NOT REPLACE',
  }, manager.snapshot().persistence.revision)

  await assert.rejects(
    manager.setSkillMode('bad-skills', 'docker', 'off', manager.snapshot().persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'profile-path-not-editable',
  )
  assert.equal(manager.getStoredProfile('bad-skills').skills, 'DO NOT REPLACE')
})

test('skill mode validation exists at runtime and does not corrupt the profile', async () => {
  const { manager } = await boot()
  await manager.createProfile('anima', anima)
  const before = manager.snapshot().persistence.revision

  await assert.rejects(
    manager.setSkillMode('anima', 'docker', 'banana', before),
    error => error instanceof ContextManagerError && error.code === 'invalid-skill-mode',
  )

  assert.equal(manager.getStoredProfile('anima').skills.docker, 'manual')
  assert.equal(manager.snapshot().persistence.revision, before)
})

test('every semantic write is revision-fenced even when the caller omits expectedRevision', async () => {
  const { manager } = await boot()

  const results = await Promise.allSettled([
    manager.createProfile('same', anima),
    manager.createProfile('same', {
      ...anima,
      name: 'Competing writer',
    }),
  ])

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  const rejected = results.find(result => result.status === 'rejected')
  assert.ok(rejected)
  assert.ok(rejected.reason instanceof SettingsConflictError)
})

test('a stale path check cannot overwrite a profile changed by an earlier queued writer', async () => {
  const { manager } = await boot()
  await manager.createProfile('anima', anima)

  const results = await Promise.allSettled([
    manager.setRawProfile('anima', 'replacement'),
    manager.setSkillMode('anima', 'docker', 'off'),
  ])

  assert.equal(results[0].status, 'fulfilled')
  assert.equal(results[1].status, 'rejected')
  assert.ok(results[1].reason instanceof SettingsConflictError)
  assert.equal(manager.getStoredProfile('anima'), 'replacement')
})

test('explicit stale expectedRevision is rejected by native Settings conflict semantics', async () => {
  const { manager } = await boot()
  await manager.createProfile('anima', anima)

  const stale = manager.snapshot().persistence.revision
  await manager.setSkillMode('anima', 'docker', 'off', stale)

  await assert.rejects(
    manager.setSkillMode('anima', 'react', 'auto', stale),
    error => error instanceof SettingsConflictError,
  )
})

test('snapshot revision follows raw document changes even when resolved settings are unchanged', async () => {
  const { manager, settings } = await boot()
  const before = manager.snapshot()

  settings.externalEdit({
    [CONTEXT_MANAGER_SETTINGS_NAMESPACE]: {
      schemaVersion: 1,
      profiles: {},
    },
  })

  const after = manager.snapshot()
  assert.deepEqual(after.profiles, before.profiles)
  assert.ok(after.persistence.revision > before.persistence.revision)
})

test('settings provider detach falls back to the composition entry without killing the service', async () => {
  const { manager, settingsFiber } = await boot()
  await manager.createProfile('anima', anima)
  assert.equal(manager.snapshot().persistence.available, true)
  assert.equal(manager.snapshot().persistence.registered, true)

  await settingsFiber.dispose()
  const snapshot = manager.snapshot()
  assert.equal(snapshot.persistence.available, false)
  assert.equal(snapshot.persistence.registered, false)
  assert.equal(snapshot.persistence.writable, false)
  assert.deepEqual(Object.keys(snapshot.profiles), [])
})

test('unsupported and malformed numeric schema versions remain diagnosable but read-only', async () => {
  const future = await boot({
    [CONTEXT_MANAGER_SETTINGS_NAMESPACE]: {
      schemaVersion: 999,
      defaultProfileId: 'future',
      profiles: { future: anima },
    },
  })

  let snapshot = future.manager.snapshot()
  assert.equal(snapshot.schemaCompatible, false)
  assert.equal(snapshot.configuredDefaultProfileId, 'future')
  assert.equal(snapshot.profiles.future, undefined)
  assert.equal(snapshot.diagnostics[0].code, 'unsupported-schema-version')
  await assert.rejects(
    future.manager.setDefaultProfile(undefined, snapshot.persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'unsupported-schema-version',
  )

  const malformed = await boot({
    [CONTEXT_MANAGER_SETTINGS_NAMESPACE]: {
      schemaVersion: 1.5,
      profiles: {},
    },
  })
  snapshot = malformed.manager.snapshot()
  assert.equal(snapshot.schemaCompatible, false)
  assert.equal(snapshot.diagnostics[0].code, 'invalid-schema-version')
  await assert.rejects(
    malformed.manager.createProfile('x', anima, snapshot.persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'invalid-schema-version',
  )
})

test('advanced editing rejects only current DSH losslessness hazards, not cosmetic names', async () => {
  const { manager } = await boot()

  await manager.createProfile('constructor', {
    name: '  preserved exactly  ',
    basePreset: 'missing preset is allowed',
    skills: { prototype: 'manual' },
  })
  assert.equal(manager.snapshot().profiles.constructor.name, '  preserved exactly  ')
  assert.equal(manager.snapshot().profiles.constructor.skills.prototype, 'manual')

  await assert.rejects(
    manager.setRawProfile('__proto__', {}),
    error => error instanceof ContextManagerError && error.code === 'unsafe-path-key',
  )

  const unsafeNested = JSON.parse('{"nested":{"__proto__":{"polluted":true}}}')
  await assert.rejects(
    manager.setRawProfile('nested', unsafeNested),
    error => error instanceof ContextManagerError && error.code === 'unsafe-path-key',
  )

  await assert.rejects(
    manager.setRawProfile('undefined-root', undefined),
    error => error instanceof ContextManagerError && error.code === 'invalid-raw-profile',
  )
  await assert.rejects(
    manager.setRawProfile('undefined-child', { value: undefined }),
    error => error instanceof ContextManagerError && error.code === 'invalid-raw-profile',
  )
})

test('domain snapshots are immutable down to diagnostic records', async () => {
  const { manager } = await boot()
  await manager.setRawProfile('broken', { name: 42, basePreset: 'standard' })
  const snapshot = manager.snapshot()
  const diagnostic = snapshot.diagnostics.find(item => item.profileId === 'broken')
  assert.ok(diagnostic)
  assert.throws(() => {
    diagnostic.message = 'mutated by consumer'
  }, TypeError)
  assert.notEqual(manager.snapshot().diagnostics.find(item => item.profileId === 'broken').message, 'mutated by consumer')
})
