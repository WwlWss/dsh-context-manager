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

const ctx = new Context()
const registryFiber = ctx.plugin(TypertRegistry)
await registryFiber
const profilesFiber = ctx.plugin(FakeProfiles)
await profilesFiber
const promptsFiber = ctx.plugin(FakePrompts)
await promptsFiber
const remoteFiber = ctx.plugin(ContextManagerRemoteService)
await remoteFiber
const gatewayFiber = ctx.plugin(TypertGatewayService)
await gatewayFiber

const disposeContribution = ctx.typert.register(TYPERT)
try {
  assert.equal(TYPERT.invocations.length, 21)
  assert.equal(TYPERT_REMOTE.descriptors.length, 21)
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
  assert.equal(created.value.persistence.revision, 1)

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
  assert.equal(stale.error.expectedRevision, 0)
  assert.equal(stale.error.actualRevision, 1)

  const promptCreated = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'createPromptResource',
    args: {
      id: 'p',
      input: { name: 'Prompt', content: 'body' },
    },
  })
  assert.deepEqual(promptCreated, { ok: true, value: { id: 'p', revision: 1 } })

  const promptList = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'listPromptResources',
    args: {},
  })
  assert.equal(promptList.ok, true)
  assert.equal(promptList.value[0].id, 'p')
  assert.equal(Object.hasOwn(promptList.value[0], 'content'), false)

  const promptGet = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'getPromptResource',
    args: { id: 'p' },
  })
  assert.equal(promptGet.ok, true)
  assert.equal(promptGet.value.content, 'body')

  const promptReplaced = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'replacePromptResource',
    args: {
      id: 'p',
      input: { name: 'Prompt 2', content: 'updated' },
      expectedRevision: 1,
    },
  })
  assert.deepEqual(promptReplaced, { ok: true, value: { id: 'p', revision: 2 } })

  const promptDeleted = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'deletePromptResource',
    args: { id: 'p', expectedRevision: 2 },
  })
  assert.deepEqual(promptDeleted, { ok: true, value: { id: 'p' } })
} finally {
  await disposeContribution()
  await gatewayFiber.dispose()
  await remoteFiber.dispose()
  await promptsFiber.dispose()
  await profilesFiber.dispose()
  await registryFiber.dispose()
}
