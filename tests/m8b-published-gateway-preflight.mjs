// Dedicated published Gateway matrix only: these imports are optional in the pinned Draft Quick workspace.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'

import { TYPERT } from '../lib/typert.host.js'
import { TYPERT_REMOTE } from '../lib/typert.remote-client.js'
import {
  ContextManagerChangeTracker,
  ContextManagerRemoteService,
  ContextManagerService,
} from '../lib/index.js'

const PRIVATE_MARKER = 'M8B_B0_PRIVATE_SKILL_DEFINITION'
const PRIVATE_PATH = '/host/private/skill/SKILL.md'

class PublishedMemorySettings extends SettingsProvider {
  constructor(ctx) {
    super(ctx)
    this.doc = {}
  }
  get writable() { return true }
  async load() { return structuredClone(this.doc) }
  async persist(namespace, value) { this.doc[namespace] = structuredClone(value) }
}

function poisonedSkillBinding(state, extra) {
  return {
    state, skillName: 'skill/' + state,
    ...extra,
    instructions: PRIVATE_MARKER,
    path: PRIVATE_PATH,
    content: PRIVATE_MARKER,
    privateMetadata: { body: PRIVATE_MARKER },
  }
}

class ControlledSkillInspector extends Service {
  constructor(ctx) { super(ctx, 'dshContextSkillRuntime') }
  async inspect(agentId) {
    if (agentId === 'unavailable') return { status: 'runtime-unavailable', internal: PRIVATE_MARKER }
    if (agentId === 'absent') return { status: 'agent-not-live', agentId, secret: PRIVATE_PATH }
    return {
      status: 'resolved',
      agentId,
      profile: {
        status: 'active', profileId: agentId === 'other-profile' ? 'another' : 'main',
        presetId: 'standard', internal: PRIVATE_MARKER, path: PRIVATE_PATH,
      },
      catalogComplete: false,
      bindings: [
        poisonedSkillBinding('native-pass-through', {
          mode: 'auto',
          winner: {
            provider: 'filesystem',
            invocation: { modelInvocable: true, userInvocable: true, content: PRIVATE_MARKER },
            internalPath: PRIVATE_PATH,
          },
        }),
        poisonedSkillBinding('policy-applied', {
          mode: 'manual', nativeProvider: 'filesystem',
          expectedInvocation: { modelInvocable: false, userInvocable: true, content: PRIVATE_MARKER },
        }),
        poisonedSkillBinding('policy-not-effective', {
          mode: 'pinned', nativeProvider: 'filesystem',
          expectedInvocation: { modelInvocable: false, userInvocable: false },
          winner: {
            provider: 'higher-priority',
            invocation: { modelInvocable: true, userInvocable: true, instructions: PRIVATE_MARKER },
          },
        }),
        poisonedSkillBinding('missing-native-skill', { mode: 'off' }),
        poisonedSkillBinding('catalog-incomplete', { mode: 'pinned' }),
      ],
      instructionBody: PRIVATE_MARKER,
      nativeCatalogPath: PRIVATE_PATH,
    }
  }
}

class ControlledPinnedInspector extends Service {
  constructor(ctx) { super(ctx, 'dshContextPinnedSkillRuntime') }
  async inspect(agentId) {
    if (agentId === 'unavailable') return { status: 'runtime-unavailable', body: PRIVATE_MARKER }
    if (agentId === 'absent') return { status: 'agent-not-live', agentId, path: PRIVATE_PATH }
    if (agentId === 'bypassed') return { status: 'assembly-bypassed', agentId, content: PRIVATE_MARKER }
    return {
      status: 'resolved',
      agentId,
      profile: {
        status: 'active', profileId: agentId === 'other-profile' ? 'another' : 'main',
        presetId: 'standard', privateProfile: PRIVATE_MARKER,
      },
      catalogComplete: true,
      nativeState: 'present',
      bindings: [
        poisonedSkillBinding('loaded', { nativeProvider: 'filesystem' }),
        poisonedSkillBinding('definition-unavailable', { nativeProvider: 'filesystem' }),
        poisonedSkillBinding('policy-not-effective', {
          nativeProvider: 'filesystem', winnerProvider: 'higher-priority',
        }),
        poisonedSkillBinding('missing-native-skill', {}),
        poisonedSkillBinding('catalog-incomplete', {}),
      ],
      fullInstructions: PRIVATE_MARKER,
      fullPath: PRIVATE_PATH,
    }
  }
}

async function boot(t) {
  const ctx = new Context()
  const fibers = []
  for (const plugin of [
    PublishedMemorySettings,
    ContextManagerService,
    ContextManagerChangeTracker,
    ControlledSkillInspector,
    ControlledPinnedInspector,
    TypertRegistry,
    ContextManagerRemoteService,
    TypertGatewayService,
  ]) {
    const fiber = ctx.plugin(plugin)
    await fiber
    fibers.push(fiber)
  }
  const disposeContribution = ctx.typert.register(TYPERT)
  t.after(async () => {
    await disposeContribution()
    for (const fiber of fibers.reverse()) await fiber.dispose()
  })
  return { ctx, manager: ctx.get('dshContextManager') }
}

function call(ctx, method, args = {}) {
  return ctx.typertGateway.invoke({ namespace: 'contextManager', method, args })
}

function proof(id) {
  console.log('M8B_B0_ASSERT ' + JSON.stringify({ id, outcome: 'pass' }))
}

function assertNoPrivate(value) {
  const body = JSON.stringify(value)
  assert.equal(body.includes(PRIVATE_MARKER), false, 'full Skill body must be absent')
  assert.equal(body.includes(PRIVATE_PATH), false, 'private host path must be absent')
  assert.equal(body.includes('privateMetadata'), false)
  assert.equal(body.includes('privateProfile'), false)
}

test('M8B B0 R01-R03: generated strict v3 gateway operates on real Settings-backed Profile Host', async t => {
  const { ctx, manager } = await boot(t)
  for (const name of [
    'setSkillMode', 'removeSkillBinding',
    'inspectSkillRuntime', 'inspectPinnedSkillRuntime',
  ]) {
    const host = TYPERT.invocations.find(x => x.method === name)
    const remote = TYPERT_REMOTE.descriptors.find(x => x.method === name)
    assert.ok(host, 'generated Host descriptor: ' + name)
    assert.ok(remote, 'generated Client descriptor: ' + name)
    for (const descriptor of [host, remote]) {
      assert.equal(descriptor.result.mode, 'strict')
      assert.equal(typeof descriptor.result.schema?.parse, 'function')
      assert.equal(descriptor.result.create(), descriptor.result.schema)
      for (const item of descriptor.parameters) {
        assert.equal(item.codec.mode, 'strict')
        assert.equal(typeof item.codec.schema?.parse, 'function')
      }
    }
  }
  assert.deepEqual(await call(ctx, 'protocol'), { apiVersion: 3 })
  proof('R01')

  await manager.createProfile('main', {
    name: 'Main', basePreset: 'standard', prompts: {},
    skills: { docker: { mode: 'manual', future: { nested: ['keep', 1] } } },
    futureProfile: { keep: true },
  })
  const changes = await call(ctx, 'changes')
  let profile = await call(ctx, 'profiles')
  let basis = { instanceId: changes.instanceId, revision: profile.persistence.revision }
  const updated = await call(ctx, 'setSkillMode', {
    profileId: 'main', skillName: 'docker', mode: 'off', basis,
  })
  assert.equal(updated.ok, true)
  assert.equal(updated.value.persistence.revision, basis.revision + 1)
  assert.deepEqual(manager.getStoredProfile('main').skills.docker, {
    mode: 'off', future: { nested: ['keep', 1] },
  })
  assert.deepEqual(manager.getStoredProfile('main').futureProfile, { keep: true })
  assert.deepEqual(updated.value.profiles.main.skills.docker, { mode: 'off' })
  assert.equal(Object.hasOwn(updated.value.profiles.main.skills.docker, 'future'), false)
  profile = await call(ctx, 'profiles')
  basis = { instanceId: changes.instanceId, revision: profile.persistence.revision }
  const removed = await call(ctx, 'removeSkillBinding', {
    profileId: 'main', skillName: 'docker', basis,
  })
  assert.equal(removed.ok, true)
  assert.equal(removed.value.persistence.revision, basis.revision + 1)
  assert.equal(Object.hasOwn(manager.getStoredProfile('main').skills, 'docker'), false)
  proof('R02')

  const previous = structuredClone(manager.getStoredProfile('main'))
  const revision = (await call(ctx, 'profiles')).persistence.revision
  const stale = await call(ctx, 'setSkillMode', {
    profileId: 'main', skillName: 'docker', mode: 'manual',
    basis: { instanceId: changes.instanceId, revision: revision - 1 },
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'profile-conflict')
  const wrongHost = await call(ctx, 'setSkillMode', {
    profileId: 'main', skillName: 'docker', mode: 'pinned',
    basis: { instanceId: 'retired-instance', revision },
  })
  assert.equal(wrongHost.ok, false)
  assert.equal(wrongHost.error.code, 'host-instance-conflict')
  const missing = await call(ctx, 'removeSkillBinding', {
    profileId: 'main', skillName: 'docker',
    basis: { instanceId: changes.instanceId, revision },
  })
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'skill-binding-not-found')
  assert.deepEqual(manager.getStoredProfile('main'), previous)
  assert.equal((await call(ctx, 'profiles')).persistence.revision, revision)
  proof('R03')
})

test('M8B B0 R04-R06: both Agent-scoped projections discard private Skill bodies and report honest states', async t => {
  const { ctx } = await boot(t)
  const skill = await call(ctx, 'inspectSkillRuntime', { agentId: 'agent-1' })
  assert.equal(skill.status, 'resolved')
  assert.equal(skill.agentId, 'agent-1')
  assert.deepEqual(skill.profile, { status: 'active', profileId: 'main', presetId: 'standard' })
  assert.equal(skill.catalogComplete, false)
  assert.deepEqual(skill.bindings.map(x => x.state), [
    'native-pass-through', 'policy-applied', 'policy-not-effective',
    'missing-native-skill', 'catalog-incomplete',
  ])
  assert.deepEqual(skill.bindings[0], {
    state: 'native-pass-through', skillName: 'skill/native-pass-through', mode: 'auto',
    winner: { provider: 'filesystem', invocation: { modelInvocable: true, userInvocable: true } },
  })
  assert.deepEqual(skill.bindings[1], {
    state: 'policy-applied', skillName: 'skill/policy-applied', mode: 'manual',
    nativeProvider: 'filesystem',
    expectedInvocation: { modelInvocable: false, userInvocable: true },
  })
  assert.deepEqual(skill.bindings[2].winner, {
    provider: 'higher-priority',
    invocation: { modelInvocable: true, userInvocable: true },
  })
  assertNoPrivate(skill)
  const other = await call(ctx, 'inspectSkillRuntime', { agentId: 'other-profile' })
  assert.equal(other.profile.profileId, 'another')
  assert.equal(other.agentId, 'other-profile')
  assertNoPrivate(other)
  proof('R04')

  const pinned = await call(ctx, 'inspectPinnedSkillRuntime', { agentId: 'agent-1' })
  assert.equal(pinned.status, 'resolved')
  assert.equal(pinned.agentId, 'agent-1')
  assert.deepEqual(pinned.profile, { status: 'active', profileId: 'main', presetId: 'standard' })
  assert.equal(pinned.nativeState, 'present')
  assert.deepEqual(pinned.bindings.map(x => x.state), [
    'loaded', 'definition-unavailable', 'policy-not-effective',
    'missing-native-skill', 'catalog-incomplete',
  ])
  assert.deepEqual(pinned.bindings[0], {
    state: 'loaded', skillName: 'skill/loaded', nativeProvider: 'filesystem',
  })
  assert.deepEqual(pinned.bindings[2], {
    state: 'policy-not-effective',
    skillName: 'skill/policy-not-effective',
    nativeProvider: 'filesystem',
    winnerProvider: 'higher-priority',
  })
  const otherPinned = await call(ctx, 'inspectPinnedSkillRuntime', { agentId: 'other-profile' })
  assert.equal(otherPinned.profile.profileId, 'another')
  assertNoPrivate(otherPinned)
  assertNoPrivate(pinned)
  proof('R05')

  for (const method of ['inspectSkillRuntime', 'inspectPinnedSkillRuntime']) {
    const unavailable = await call(ctx, method, { agentId: 'unavailable' })
    assert.deepEqual(unavailable, { status: 'runtime-unavailable' })
    const absent = await call(ctx, method, { agentId: 'absent' })
    assert.deepEqual(absent, { status: 'agent-not-live', agentId: 'absent' })
    assertNoPrivate(unavailable)
    assertNoPrivate(absent)
  }
  const bypassed = await call(ctx, 'inspectPinnedSkillRuntime', { agentId: 'bypassed' })
  assert.deepEqual(bypassed, { status: 'assembly-bypassed', agentId: 'bypassed' })
  assertNoPrivate(bypassed)
  proof('R06')
})
