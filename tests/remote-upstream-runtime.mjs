import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'

import { TYPERT } from '../lib/typert.host.js'
import { TYPERT_REMOTE } from '../lib/typert.remote-client.js'
import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  ContextManagerRemoteService,
} from '../lib/index.js'

function assertDualStrictCodec(codec, subject) {
  assert.equal(codec.mode, 'strict', `${subject} must stay strict`)
  assert.equal(typeof codec.schema?.parse, 'function', `${subject} must retain the legacy schema ABI`)
  assert.equal(typeof codec.create, 'function', `${subject} must expose the current factory ABI`)
  assert.equal(codec.create(), codec.schema, `${subject} factory must return the generated schema`)
}

class FakeProfiles extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextManager')
    this.revision = 0
    this.profiles = Object.create(null)
  }

  snapshotForWire() {
    return {
      schemaVersion: 1,
      schemaCompatible: true,
      profiles: structuredClone(this.profiles),
      diagnostics: [],
      persistence: {
        available: true,
        registered: true,
        writable: true,
        revision: this.revision,
      },
    }
  }

  assertRevision(expectedRevision) {
    if (expectedRevision !== this.revision) {
      const error = new Error('stale profile revision')
      error.code = 'SETTINGS_CONFLICT'
      error.expected = expectedRevision
      error.actual = this.revision
      throw error
    }
  }

  async createProfile(id, input, expectedRevision) {
    this.assertRevision(expectedRevision)
    this.profiles[id] = {
      name: input.name,
      ...(input.description === undefined ? {} : { description: input.description }),
      basePreset: input.basePreset,
      skills: structuredClone(input.skills ?? {}),
      prompts: structuredClone(input.prompts ?? {}),
    }
    this.revision += 1
  }

  async deleteProfile(id, expectedRevision) {
    this.assertRevision(expectedRevision)
    delete this.profiles[id]
    this.revision += 1
  }

  async setDefaultProfile(_id, expectedRevision) { this.assertRevision(expectedRevision); this.revision += 1 }
  async setProfileName(id, name, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].name = name; this.revision += 1 }
  async setProfileDescription(id, description, expectedRevision) {
    this.assertRevision(expectedRevision)
    if (description === undefined) delete this.profiles[id].description
    else this.profiles[id].description = description
    this.revision += 1
  }
  async setProfileBasePreset(id, basePreset, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].basePreset = basePreset; this.revision += 1 }
  async setSkillMode(id, skillName, mode, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].skills[skillName] = { mode }; this.revision += 1 }
  async removeSkillBinding(id, skillName, expectedRevision) { this.assertRevision(expectedRevision); delete this.profiles[id].skills[skillName]; this.revision += 1 }
  async addPromptBinding(id, bindingId, input, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].prompts[bindingId] = structuredClone(input); this.revision += 1 }
  async setPromptBindingResourceId(id, bindingId, resourceId, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].prompts[bindingId].resourceId = resourceId; this.revision += 1 }
  async setPromptBindingEnabled(id, bindingId, enabled, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].prompts[bindingId].enabled = enabled; this.revision += 1 }
  async setPromptBindingPlacement(id, bindingId, placement, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].prompts[bindingId].placement = placement; this.revision += 1 }
  async setPromptBindingOrder(id, bindingId, order, expectedRevision) { this.assertRevision(expectedRevision); this.profiles[id].prompts[bindingId].order = order; this.revision += 1 }
  async removePromptBinding(id, bindingId, expectedRevision) { this.assertRevision(expectedRevision); delete this.profiles[id].prompts[bindingId]; this.revision += 1 }
}

class FakePrompts extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPromptLibrary')
    this.rows = new Map()
  }

  list() {
    return [...this.rows.entries()].map(([id, resource]) => ({
      status: 'usable',
      id,
      name: resource.name,
      ...(resource.description === undefined ? {} : { description: resource.description }),
      revision: resource.revision,
    }))
  }

  get(id) {
    const resource = this.rows.get(id)
    if (resource === undefined) {
      const error = new Error('missing')
      error.code = 'prompt-resource-not-found'
      throw error
    }
    return { id, resource: structuredClone(resource) }
  }

  async createPrompt(id, input) {
    this.rows.set(id, { ...structuredClone(input), revision: 1 })
    return { id, revision: 1 }
  }

  async replacePrompt(id, input, expectedRevision) {
    const current = this.rows.get(id)
    if (current.revision !== expectedRevision) {
      const error = new Error('stale prompt')
      error.code = 'prompt-resource-conflict'
      throw error
    }
    const revision = current.revision + 1
    this.rows.set(id, { ...current, ...structuredClone(input), revision })
    return { id, revision }
  }

  async deletePrompt(id, expectedRevision) {
    const current = this.rows.get(id)
    if (current.revision !== expectedRevision) {
      const error = new Error('stale prompt')
      error.code = 'prompt-resource-conflict'
      throw error
    }
    this.rows.delete(id)
  }
}

class FakePresetDirectory extends Service {
  constructor(ctx) { super(ctx, 'dshContextPresetDirectory') }
  async snapshotForWire() {
    return {
      directory: {
        status: 'available',
        defaultId: 'standard',
        authorable: true,
        presets: [{ id: 'standard', trust: 'system', isDefault: true, name: 'Standard' }],
      },
      profiles: {
        main: {
          basePreset: { status: 'resolved', configuredId: 'standard' },
        },
      },
    }
  }
}

class FakePresetAuthoring extends Service {
  constructor(ctx) {
    super(ctx, 'dshContextPresetAuthoring')
    this.rows = new Set()
  }
  async read(id) { return `composition:${id}\n` }
  async copy(_from, id) { this.rows.add(id) }
  async remove(id) { this.rows.delete(id) }
}

class FakeSessionPreset extends Service {
  constructor(ctx) { super(ctx, 'dshContextSessionPresetIdentity') }
  snapshot(sessionId) { return { status: 'known', sessionId, presetId: 'standard' } }
}

class FakePromptPlacement extends Service {
  constructor(ctx) { super(ctx, 'dshContextPromptPlacement') }
  snapshot() {
    return {
      status: 'available',
      placements: {
        'before-persona': 'system-prompt',
        'after-persona': 'system-prompt',
        'before-tool-guidance': 'system-prompt',
        'after-tool-guidance': 'system-prompt',
        'runtime-context': 'runtime-context',
      },
    }
  }
}

class FakePromptRuntime extends Service {
  constructor(ctx) { super(ctx, 'dshContextPromptRuntime') }
  async inspect(agentId) {
    return {
      status: 'resolved',
      agentId,
      profile: { status: 'active', profileId: 'main', presetId: 'standard' },
      bindings: [{
        state: 'eligible',
        bindingId: 'p',
        resourceId: 'resource',
        placement: 'after-persona',
        order: 0,
        resourceRevision: 1,
        nativeState: 'present',
      }],
    }
  }
}

class FakeSkillRuntime extends Service {
  constructor(ctx) { super(ctx, 'dshContextSkillRuntime') }
  async inspect(agentId) {
    return {
      status: 'resolved',
      agentId,
      profile: { status: 'active', profileId: 'main', presetId: 'standard' },
      catalogComplete: true,
      bindings: [{
        state: 'native-pass-through',
        skillName: 'docker',
        mode: 'auto',
        winner: {
          provider: 'filesystem',
          invocation: { modelInvocable: true, userInvocable: true },
        },
      }],
    }
  }
}

class FakePinnedRuntime extends Service {
  constructor(ctx) { super(ctx, 'dshContextPinnedSkillRuntime') }
  async inspect(agentId) {
    return {
      status: 'resolved',
      agentId,
      profile: { status: 'active', profileId: 'main', presetId: 'standard' },
      catalogComplete: true,
      nativeState: 'present',
      bindings: [{ state: 'loaded', skillName: 'docker', nativeProvider: 'filesystem' }],
    }
  }
}

class FakeChanges extends Service {
  constructor(ctx) { super(ctx, 'dshContextChanges') }
  snapshot() {
    return {
      instanceId: 'runtime-matrix',
      generation: 9,
      profiles: 1,
      promptResources: 2,
      presets: 3,
      runtime: 4,
    }
  }
}

const ctx = new Context()
const fibers = []
async function mount(plugin) {
  const fiber = ctx.plugin(plugin)
  await fiber
  fibers.push(fiber)
}

await mount(TypertRegistry)
await mount(FakeProfiles)
await mount(FakePrompts)
await mount(FakePresetDirectory)
await mount(FakePresetAuthoring)
await mount(FakeSessionPreset)
await mount(FakePromptPlacement)
await mount(FakePromptRuntime)
await mount(FakeSkillRuntime)
await mount(FakePinnedRuntime)
await mount(FakeChanges)
await mount(ContextManagerRemoteService)
await mount(TypertGatewayService)

const disposeContribution = ctx.typert.register(TYPERT)
try {
  assert.equal(TYPERT.invocations.length, 31)
  assert.equal(TYPERT_REMOTE.descriptors.length, 31)
  for (const invocation of TYPERT.invocations) {
    assertDualStrictCodec(invocation.result, `Host ${invocation.method} result`)
    for (const parameter of invocation.parameters) {
      assertDualStrictCodec(parameter.codec, `Host ${invocation.method} parameter ${parameter.name}`)
    }
  }
  for (const descriptor of TYPERT_REMOTE.descriptors) {
    assertDualStrictCodec(descriptor.result, `Remote ${descriptor.method} result`)
    for (const parameter of descriptor.parameters) {
      assertDualStrictCodec(parameter.codec, `Remote ${descriptor.method} parameter ${parameter.name}`)
    }
  }

  const protocol = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'protocol',
    args: {},
  })
  assert.deepEqual(protocol, { apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION })

  const initial = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'profiles',
    args: {},
  })
  assert.equal(initial.persistence.revision, 0)

  const created = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'createProfile',
    args: {
      id: 'main',
      input: { name: 'Main', basePreset: 'standard' },
      expectedRevision: 0,
    },
  })
  assert.equal(created.ok, true)
  assert.equal(created.value.profiles.main.name, 'Main')

  const stale = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'setProfileName',
    args: {
      profileId: 'main',
      name: 'Stale',
      expectedRevision: 0,
    },
  })
  assert.equal(stale.ok, false)
  assert.equal(stale.error.code, 'profile-conflict')

  const promptCreated = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'createPromptResource',
    args: { id: 'p', input: { name: 'Prompt', content: 'body' } },
  })
  assert.deepEqual(promptCreated, { ok: true, value: { id: 'p', revision: 1 } })

  const presets = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'presets',
    args: {},
  })
  assert.equal(presets.directory.status, 'available')
  assert.equal(presets.directory.presets[0].id, 'standard')

  const presetRead = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'readPreset',
    args: { id: 'standard' },
  })
  assert.deepEqual(presetRead, {
    ok: true,
    value: { id: 'standard', content: 'composition:standard\n' },
  })

  const presetCopy = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'copyPreset',
    args: { from: 'standard', id: 'mine', name: null },
  })
  assert.deepEqual(presetCopy, { ok: true, value: { id: 'mine' } })

  const presetRemove = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'removePreset',
    args: { id: 'mine' },
  })
  assert.deepEqual(presetRemove, { ok: true, value: { id: 'mine' } })

  assert.deepEqual(await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'sessionPreset',
    args: { sessionId: 'session-1' },
  }), {
    status: 'known',
    sessionId: 'session-1',
    presetId: 'standard',
  })

  const placement = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'promptPlacement',
    args: {},
  })
  assert.equal(placement.status, 'available')
  assert.equal(placement.placements['runtime-context'], 'runtime-context')

  const promptRuntime = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'inspectPromptRuntime',
    args: { agentId: 'agent-1' },
  })
  assert.equal(promptRuntime.status, 'resolved')
  assert.equal(promptRuntime.profile.status, 'active')
  assert.equal(promptRuntime.bindings[0].nativeState, 'present')

  const skillRuntime = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'inspectSkillRuntime',
    args: { agentId: 'agent-1' },
  })
  assert.equal(skillRuntime.status, 'resolved')
  assert.equal(skillRuntime.bindings[0].winner.provider, 'filesystem')

  const pinnedRuntime = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'inspectPinnedSkillRuntime',
    args: { agentId: 'agent-1' },
  })
  assert.equal(pinnedRuntime.status, 'resolved')
  assert.equal(pinnedRuntime.bindings[0].state, 'loaded')

  assert.deepEqual(await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'changes',
    args: {},
  }), {
    instanceId: 'runtime-matrix',
    generation: 9,
    profiles: 1,
    promptResources: 2,
    presets: 3,
    runtime: 4,
  })
} finally {
  await disposeContribution()
  for (const fiber of fibers.reverse()) await fiber.dispose()
}
