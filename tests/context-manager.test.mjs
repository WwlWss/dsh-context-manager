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
  assert.equal(snapshot.profiles.anima.name, 'Anima Development')
  assert.equal(snapshot.profiles.anima.skills.docker, 'manual')

  await manager.setDefaultProfile('future-profile', snapshot.persistence.revision)
  snapshot = manager.snapshot()
  assert.equal(snapshot.configuredDefaultProfileId, 'future-profile')
  assert.equal(snapshot.defaultProfileId, undefined)
  assert.equal(snapshot.diagnostics.at(-1)?.code, 'missing-default-profile')

  await manager.setSkillMode('anima', 'future-skill', 'pinned', snapshot.persistence.revision)
  snapshot = manager.snapshot()
  assert.equal(snapshot.profiles.anima.skills['future-skill'], 'pinned')

  const descriptor = settings.describe().find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)
  assert.ok(descriptor)
  assert.equal(descriptor.user.profiles.anima.skills['future-skill'], 'pinned')
})

test('one malformed raw profile is preserved and isolated as a diagnostic', async () => {
  const { manager, settings } = await boot()

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

  const descriptor = settings.describe().find(item => item.ns === CONTEXT_MANAGER_SETTINGS_NAMESPACE)
  assert.deepEqual(descriptor.user.profiles.broken.futureField, { preserve: true })
})

test('stale expectedRevision is rejected by the native Settings conflict mechanism', async () => {
  const { manager } = await boot()
  await manager.createProfile('anima', anima)

  const stale = manager.snapshot().persistence.revision
  await manager.setSkillMode('anima', 'docker', 'off', stale)

  await assert.rejects(
    manager.setSkillMode('anima', 'react', 'auto', stale),
    error => error instanceof SettingsConflictError,
  )
})

test('newer schema remains readable as diagnostic but refuses writes', async () => {
  const { manager } = await boot({
    [CONTEXT_MANAGER_SETTINGS_NAMESPACE]: {
      schemaVersion: 999,
      defaultProfileId: 'future',
      profiles: {
        future: anima,
      },
    },
  })

  const snapshot = manager.snapshot()
  assert.equal(snapshot.schemaCompatible, false)
  assert.equal(snapshot.configuredDefaultProfileId, 'future')
  assert.equal(snapshot.profiles.future, undefined)
  assert.equal(snapshot.diagnostics[0].code, 'unsupported-schema-version')

  await assert.rejects(
    manager.setDefaultProfile(undefined, snapshot.persistence.revision),
    error => error instanceof ContextManagerError && error.code === 'unsupported-schema-version',
  )
})

test('unsafe path keys are rejected only at the known DSH Settings integrity boundary', async () => {
  const { manager } = await boot()

  await manager.createProfile('Profile With Spaces', {
    name: '  preserved exactly  ',
    basePreset: 'missing preset is allowed',
    skills: {},
  })
  assert.equal(manager.snapshot().profiles['Profile With Spaces'].name, '  preserved exactly  ')

  await assert.rejects(
    manager.setRawProfile('__proto__', {}),
    error => error instanceof ContextManagerError && error.code === 'unsafe-path-key',
  )
})
