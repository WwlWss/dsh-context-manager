import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as Cordis from '@deepseek-ai/cordis'
import * as ClientSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import TestRenderer from 'react-test-renderer'

const { Context } = Cordis
const { act } = TestRenderer

async function loadBundle(filePath, id, externals) {
  const source = await readFile(filePath, 'utf8')
  let registration
  new Function('window', source)({
    __ModuleLoader__: { load(value) { registration = value } },
  })
  assert.equal(registration?.id, id)
  return registration.factory(specifier => {
    if (!externals.has(specifier)) throw new Error('Unexpected browser external: ' + specifier)
    return externals.get(specifier)
  })
}

function createAbsentSessionAdapter() {
  const absent = Object.freeze({
    key: undefined,
    hooks: Object.freeze({}),
    keyedHooks: Object.freeze({}),
    props: Object.freeze({}),
  })
  const current = Object.freeze({
    getSnapshot: () => absent,
    subscribe: () => () => {},
  })
  return Object.freeze({
    current,
    resolve: () => undefined,
    bindingSource: () => current,
  })
}

function createSlotsFace(core) {
  return {
    inject(name, factory) {
      // The renderer's published SlotRegistry is not the SlotCore used by
      // the legacy declaration-lifecycle harness. Prefer its native inject;
      // otherwise register into the already-declared root for this UI probe.
      return typeof core.inject === 'function'
        ? core.inject(name, factory)
        : factory()
    },
    register(options, component) {
      return core.register(options, component)
    },
  }
}

function pluginCapableContext(base) {
  const ctx = { ...base }
  ctx.plugin = definition => {
    assert.deepEqual(definition.inject, ['remote', 'remote.contextManager'])
    let disposer
    const started = Promise.resolve().then(async () => {
      disposer = await definition.apply(ctx)
    })
    return {
      then(onSuccess, onFailure) {
        return started.then(() => onSuccess?.(undefined), onFailure)
      },
      async dispose() {
        await started
        const current = disposer
        disposer = undefined
        await current?.()
      },
    }
  }
  return ctx
}

function createLocale() {
  const dictionaries = new Map()
  const subscribers = new Set()
  let snapshot = Object.freeze({ revision: 0 })
  function publish() {
    snapshot = Object.freeze({ revision: snapshot.revision + 1 })
    for (const listener of subscribers) listener()
  }
  return {
    getSnapshot() { return snapshot },
    subscribe(listener) {
      subscribers.add(listener)
      return () => { subscribers.delete(listener) }
    },
    register(ns, all) {
      dictionaries.set(ns, all)
      publish()
      return () => {
        dictionaries.delete(ns)
        publish()
      }
    },
    bind(ns) {
      return key => dictionaries.get(ns)?.en?.[key] ?? key
    },
  }
}

function createWritableRemoteFixture() {
  let instanceId = 'm7c-real-ui-host'
  let resourceAuthorityId = 'm7c-fixture-resource'
  let revision = 7
  let change = 10
  let profileCursor = 10
  let failProfileReads = 0
  let defaultId = 'main'
  let unknownNextWrite = false
  let readOnly = false
  const writes = []
  const resourceWrites = []
  const resources = new Map()
  let resourceCursor = 0
  let unknownNextResourceWrite = false
  let failNextResourceListRead = false
  const profiles = Object.create(null)
  profiles.main = {
    name: 'Main',
    description: 'Original',
    basePreset: 'native',
    skills: {},
    prompts: {},
  }

  function profileSnapshot() {
    const diagnostics = [
      { code: 'invalid-profile', profileId: 'malformed', message: 'stored payload is malformed' },
    ]
    if (defaultId !== null && !Object.hasOwn(profiles, defaultId)) {
      diagnostics.push({
        code: 'missing-default-profile', profileId: defaultId,
        message: 'default profile reference is dangling',
      })
    }
    return {
      schemaVersion: 1,
      schemaCompatible: true,
      ...(defaultId === null ? {} : { configuredDefaultProfileId: defaultId }),
      ...(defaultId !== null && Object.hasOwn(profiles, defaultId)
        ? { usableDefaultProfileId: defaultId } : {}),
      profiles: structuredClone(profiles),
      diagnostics,
      persistence: {
        available: true, registered: true, writable: !readOnly, revision,
      },
    }
  }

  const okRead = value => ({ ok: true, value })
  const accepted = value => okRead({ ok: true, value })
  const rejected = (code, message) => okRead({ ok: false, error: { code, message } })
  async function resourceWrite(kind, id, basis, update) {
    resourceWrites.push({ kind, id, basis })
    if (basis.resourceAuthorityId !== resourceAuthorityId) {
      return rejected('prompt-resource-authority-conflict', 'resource source changed')
    }
    const current = resources.get(id)
    if (kind === 'resource-create') {
      if (current !== undefined) return rejected('prompt-resource-exists', 'duplicate Resource ID')
    } else {
      if (current === undefined) return rejected('prompt-resource-not-found', 'missing Resource')
      if (basis.incarnationId !== current.incarnationId) {
        return rejected('prompt-resource-incarnation-conflict', 'resource incarnation changed')
      }
      if (basis.revision !== current.revision) {
        return rejected('prompt-resource-conflict', 'resource revision changed')
      }
    }
    update(current)
    resourceCursor += 1
    change += 1
    if (unknownNextResourceWrite) {
      unknownNextResourceWrite = false
      throw new Error('Resource committed but Host response was dropped')
    }
    const next = resources.get(id)
    return accepted(kind === 'resource-delete' ? { id } : { id, revision: next.revision })
  }

  async function write(kind, basis, update) {
    writes.push({ kind, basis })
    if (readOnly) return rejected('persistence-read-only', 'read-only')
    if (basis.instanceId !== instanceId) return rejected('host-instance-conflict', 'different host')
    if (basis.revision !== revision) return okRead({
      ok: false,
      error: { code: 'profile-conflict', message: 'revision mismatch', expectedRevision: basis.revision, actualRevision: revision },
    })
    update()
    revision += 1
    profileCursor += 1
    change += 1
    if (unknownNextWrite) {
      unknownNextWrite = false
      throw new Error('simulated lost reply after commit')
    }
    return accepted(profileSnapshot())
  }

  const face = {
    async protocol() { return okRead({ apiVersion: 3 }) },
    async changes() {
      return okRead({
        instanceId,
        resourceAuthorityId,
        generation: change,
        profiles: profileCursor,
        promptResources: resourceCursor,
        presets: change,
        runtime: change,
      })
    },
    async profiles() {
      if (failProfileReads > 0) {
        failProfileReads -= 1
        // profiles() is a single-layer RemoteResult, unlike mutation RPCs.
        // A rejected transport promise is the realistic read failure; a
        // nested business result would corrupt the snapshot test fixture.
        throw new Error('simulated Profile read-back transport failure')
      }
      return okRead(profileSnapshot())
    },
    async presets() {
      const resolutions = Object.create(null)
      for (const [id, profile] of Object.entries(profiles)) {
        resolutions[id] = {
          basePreset: {
            status: profile.basePreset === 'native' ? 'resolved' : 'missing',
            configuredId: profile.basePreset,
          },
        }
      }
      return okRead({
        directory: {
          status: 'available', defaultId: 'native', authorable: false,
          presets: [{ id: 'native', trust: 'system', isDefault: true }],
        },
        profiles: resolutions,
      })
    },
    async promptPlacement() { return okRead({ status: 'unavailable' }) },
    async listPromptResources() {
      if (failNextResourceListRead) {
        failNextResourceListRead = false
        return rejected('prompt-library-not-ready', 'simulated read-back failure')
      }
      return accepted([
        ...Array.from(resources.values(), row => ({
          status: 'usable',
          id: row.id,
          name: row.name,
          ...(row.description === undefined ? {} : { description: row.description }),
          revision: row.revision,
          incarnationId: row.incarnationId,
        })),
        { status: 'invalid', id: 'corrupt-resource', message: 'Stored record cannot be parsed' },
      ])
    },
    async getPromptResource(id) {
      const record = resources.get(id)
      return record === undefined
        ? rejected('prompt-resource-not-found', 'missing Resource')
        : accepted({ ...record })
    },
    createPromptResource(id, input, basis) {
      return resourceWrite('resource-create', id, basis, () => {
        resources.set(id, { id, name: input.name,
          ...(input.description === undefined ? {} : { description: input.description }),
          content: input.content, revision: 1, incarnationId: 'uuid-' + id,
        })
      })
    },
    replacePromptResource(id, input, basis) {
      return resourceWrite('resource-replace', id, basis, current => {
        const { description: _oldDescription, ...other } = current
        resources.set(id, {
          ...other, name: input.name, content: input.content,
          ...(input.description === undefined ? {} : { description: input.description }),
          revision: current.revision + 1,
        })
      })
    },
    deletePromptResource(id, basis) {
      return resourceWrite('resource-delete', id, basis, () => { resources.delete(id) })
    },
    setPromptResourceName(id, name, basis) {
      return resourceWrite('resource-name', id, basis, current => {
        resources.set(id, { ...current, name, revision: current.revision + 1 })
      })
    },
    setPromptResourceDescription(id, description, basis) {
      return resourceWrite('resource-description', id, basis, current => {
        const { description: _oldDescription, ...other } = current
        resources.set(id, {
          ...other, ...(description === null ? {} : { description }),
          revision: current.revision + 1,
        })
      })
    },
    setPromptResourceContent(id, content, basis) {
      return resourceWrite('resource-content', id, basis, current => {
        resources.set(id, { ...current, content, revision: current.revision + 1 })
      })
    },
    createProfile(id, input, basis) {
      return write('create', basis, () => { profiles[id] = { ...input, skills: {}, prompts: {} } })
    },
    deleteProfile(id, basis) {
      return write('delete', basis, () => { delete profiles[id] })
    },
    setProfileName(id, name, basis) {
      return write('name', basis, () => { profiles[id].name = name })
    },
    setProfileDescription(id, description, basis) {
      return write('description', basis, () => {
        if (description === null) delete profiles[id].description
        else profiles[id].description = description
      })
    },
    setProfileBasePreset(id, basePreset, basis) {
      return write('basePreset', basis, () => { profiles[id].basePreset = basePreset })
    },
    setDefaultProfile(id, basis) {
      return write('default', basis, () => { defaultId = id })
    },
    addPromptBinding(profileId, bindingId, input, basis) {
      return write('binding-add', basis, () => {
        profiles[profileId].prompts[bindingId] = structuredClone(input)
      })
    },
    setPromptBindingResourceId(profileId, bindingId, resourceId, basis) {
      return write('binding-resource', basis, () => {
        profiles[profileId].prompts[bindingId].resourceId = resourceId
      })
    },
    setPromptBindingEnabled(profileId, bindingId, enabled, basis) {
      return write('binding-enabled', basis, () => {
        profiles[profileId].prompts[bindingId].enabled = enabled
      })
    },
    setPromptBindingPlacement(profileId, bindingId, placement, basis) {
      return write('binding-placement', basis, () => {
        profiles[profileId].prompts[bindingId].placement = placement
      })
    },
    setPromptBindingOrder(profileId, bindingId, order, basis) {
      return write('binding-order', basis, () => {
        profiles[profileId].prompts[bindingId].order = order
      })
    },
    removePromptBinding(profileId, bindingId, basis) {
      return write('binding-delete', basis, () => {
        delete profiles[profileId].prompts[bindingId]
      })
    },
  }
  return {
    face, profiles, writes, resources, resourceWrites,
    getDefault: () => defaultId,
    makeUnknownNextResourceWrite() { unknownNextResourceWrite = true },
    failNextResourceListRead() { failNextResourceListRead = true },
    externalResourceReplacement(id, newName) {
      const old = resources.get(id)
      resources.set(id, { ...old, name: newName, incarnationId: 'new-incarnation-' + id })
      resourceCursor += 1
      change += 1
    },
    makeUnknownNextWrite() { unknownNextWrite = true },
    externalRename(id, name) {
      // A distinct Settings writer updates the authoritative revision
      // after the UI captured its immutable edit basis.
      profiles[id].name = name
      revision += 1
      profileCursor += 1
      change += 1
    },
    externalBindingResourceId(profileId, bindingId, resourceId) {
      profiles[profileId].prompts[bindingId].resourceId = resourceId
      revision += 1
      profileCursor += 1
      change += 1
    },
    failProfileReads(count = 8) { failProfileReads = count },
    restoreProfileReads() { failProfileReads = 0 },
    externalRotateResourceAuthority() {
      resourceAuthorityId = 'm8a2-source-' + String(change)
      resourceCursor += 1
      change += 1
      // The independent Profile cursor/revision is intentionally unchanged.
    },
    externalRotateHostInstance() {
      instanceId = 'm8a2-host-' + String(change)
      change += 1
    },
    setReadOnly(value) { readOnly = value; change += 1 },
  }
}

function renderedText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (node === null || !Array.isArray(node.children)) return ''
  return node.children.map(renderedText).join('')
}

function buttonByLabel(tree, text, index = 0) {
  const matches = tree.root.findAll(node => node.type === 'button' && node.props.children === text)
  assert.ok(matches.length > index, 'Missing button ' + JSON.stringify(text))
  return matches[index]
}

async function settleUI() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
  })
}

const renderer = await loadBundle(
  fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/client')),
  '@deepseek-ai/dsh-client-ui-renderer',
  new Map([
    ['react', React],
    ['react/jsx-runtime', ReactJsxRuntime],
    ['react-dom', ReactDOM],
    ['react-dom/client', ReactDOMClient],
    ['@deepseek-ai/cordis', Cordis],
    ['@deepseek-ai/dsh-client-ui-slots', ClientSlots],
  ]),
)
const clientPlugin = await loadBundle(
  path.resolve('lib/client.js'),
  'dsh-context-manager',
  new Map([['react', React]]),
)

const rendererContext = new Context()
const rendererFiber = rendererContext.plugin({
  name: 'm7c-real-renderer',
  inject: [...renderer.inject],
  apply: renderer.apply,
})
await rendererFiber.await()
const slots = rendererContext.get('slots')
assert.ok(slots)
const sessionFiber = rendererContext.plugin({
  name: 'm7c-session-scope',
  inject: ['slots'],
  apply(ctx) { ctx.slots.installScope('session', createAbsentSessionAdapter()) },
})
await sessionFiber.await()

// The published Renderer requires a LocaleFace on its own SlotRegistry; a
// separate fake ctx.locale only satisfies plugin apply, not the renderer seat.
const locale = createLocale()
assert.equal(typeof slots.installLocale, 'function')
slots.installLocale(locale)

const remoteFixture = createWritableRemoteFixture()
const remote = {
  contextManager: remoteFixture.face,
  async $mount() { return async () => {} },
}
const disposeRoot = slots.register({
  name: 'root',
  children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  },
}, props => React.createElement('section', null,
  props.renderSlot('sidebar.footer.action', {}),
  props.renderSlot('shell.overlay', {}),
))

const slotFace = createSlotsFace(slots)
const register = slotFace.register
let injectedBusiness
slotFace.register = (options, component) => {
  if (options.name === 'shell.overlay') injectedBusiness = options.inject
  return register(options, component)
}
const disposePlugin = await clientPlugin.apply(pluginCapableContext({
  remote, slots: slotFace, locale,
}))


let tree
await act(async () => { tree = TestRenderer.create(slots.renderSlot('root', {})) })
await settleUI()

function trigger() {
  const found = tree.root.findAllByProps({ 'data-context-manager-trigger': '' })
  assert.equal(found.length, 1)
  return found[0]
}
await act(async () => { trigger().props.onClick() })
await settleUI()
assert.equal(tree.root.findAllByProps({ 'data-context-manager-new-profile': '' }).length, 1)
assert.equal(remoteFixture.writes.length, 0)

// M8A2 executable RED in the ACTUAL published DSH React Renderer:
// the selected usable Profile must expose its PromptBindings section.
// This is intentionally absent until the M8A2 production implementation.
assert.equal(
  tree.root.findAllByProps({ 'data-context-manager-prompt-bindings': '' }).length,
  1,
  'M8A2 RED: Profile PromptBindings editor is not yet mounted',
)

// Create with one explicit, basis-bearing Host write.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-new-profile': '' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-create-id' }).props.onChange({ currentTarget: { value: 'new' } })
  tree.root.findByProps({ id: 'cm-create-name' }).props.onChange({ currentTarget: { value: 'New profile' } })
  tree.root.findByProps({ id: 'cm-create-preset' }).props.onChange({ currentTarget: { value: 'native' } })
})
assert.equal(remoteFixture.writes.length, 0)
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.profiles.new.name, 'New profile')
assert.equal(remoteFixture.writes.length, 1)
assert.equal(remoteFixture.writes[0].kind, 'create')
assert.deepEqual(remoteFixture.writes[0].basis, { instanceId: 'm7c-real-ui-host', revision: 7 })

// A field edit is a single separate write and has no per-keystroke Remote calls.
await act(async () => { buttonByLabel(tree, 'Edit', 0).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-edit-name' }).props.onChange({ currentTarget: { value: 'Renamed' } })
})
assert.equal(remoteFixture.writes.length, 1)
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.profiles.new.name, 'Renamed')
assert.equal(remoteFixture.writes.length, 2)

// Absent description and an explicit empty string are different stored values.
await act(async () => { buttonByLabel(tree, 'Edit', 1).props.onClick() })
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(Object.hasOwn(remoteFixture.profiles.new, 'description'), true)
assert.equal(remoteFixture.profiles.new.description, '')

// Explicit field removal must send null instead of storing an empty string.
await act(async () => { buttonByLabel(tree, 'Edit', 1).props.onClick() })
await act(async () => { buttonByLabel(tree, 'Remove description field').props.onClick() })
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(Object.hasOwn(remoteFixture.profiles.new, 'description'), false)

// Declarative missing native preset ids must be preserved, not silently fixed.
await act(async () => { buttonByLabel(tree, 'Edit', 2).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-edit-basePreset' }).props.onChange({
    currentTarget: { value: 'missing-native' },
  })
})
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.profiles.new.basePreset, 'missing-native')
assert.ok(renderedText(tree.root).includes('Missing preset'))

// Set default is an independent mutation. Deleting it leaves the declared dangling reference.
await act(async () => { buttonByLabel(tree, 'Set as default').props.onClick() })
await settleUI()
assert.equal(remoteFixture.getDefault(), 'new')
await act(async () => { buttonByLabel(tree, 'Delete profile').props.onClick() })
assert.ok(tree.root.findAll(node => node.type === 'strong' && node.props.children === 'Delete this profile?').length > 0)
await act(async () => { buttonByLabel(tree, 'Confirm delete').props.onClick() })
await settleUI()
assert.equal(Object.hasOwn(remoteFixture.profiles, 'new'), false)
assert.equal(remoteFixture.getDefault(), 'new')
assert.ok(tree.root.findAll(node => typeof node.props?.children === 'string' && node.props.children.includes('Invalid or missing default')).length > 0)

// Invalid stored rows are visible, but have no ordinary form editor.
const invalidRow = tree.root.findAll(node =>
  node.type === 'button'
  && Object.hasOwn(node.props, 'aria-current')
  && renderedText(node).includes('malformed'),
)[0]
assert.ok(invalidRow)
await act(async () => { invalidRow.props.onClick() })
assert.equal(tree.root.findAllByProps({ id: 'cm-edit-name' }).length, 0)

// An uncertain write is attempted exactly once and retains a blocked draft through close/reopen.
const mainRow = tree.root.findAll(node =>
  node.type === 'button'
  && Object.hasOwn(node.props, 'aria-current')
  && renderedText(node).includes('Main'),
)[0]
assert.ok(mainRow)
await act(async () => { mainRow.props.onClick() })
await act(async () => { buttonByLabel(tree, 'Edit', 0).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-edit-name' }).props.onChange({ currentTarget: { value: 'Changed but uncertain' } })
})
remoteFixture.makeUnknownNextWrite()
const writeCount = remoteFixture.writes.length
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, writeCount + 1)
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
await act(async () => { trigger().props.onClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-backdrop': '' }).length, 0)
await act(async () => { trigger().props.onClick() })
assert.ok(buttonByLabel(tree, 'Discard draft'))
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
assert.equal(remoteFixture.writes.length, writeCount + 1)
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })

// A real concurrent Settings writer wins over an old edit basis. The Host
// rejects the original revision, the controller only rehydrates, and the
// Drawer keeps the old draft blocked until the user explicitly discards it.
await act(async () => { buttonByLabel(tree, 'Edit', 0).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-edit-name' }).props.onChange({
    currentTarget: { value: 'Stale local overwrite' },
  })
})
remoteFixture.externalRename('main', 'External writer won')
const conflictCount = remoteFixture.writes.length
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, conflictCount + 1)
assert.equal(remoteFixture.profiles.main.name, 'External writer won')
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
assert.ok(renderedText(tree.root).includes('Profile write conflict'))
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })

// M8A1: the same retained DSH Renderer opens the Resource library inside
// the existing Drawer, without moving Profile drafts into the Resource lane.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
})
await settleUI()
assert.equal(tree.root.findAllByProps({ 'data-context-manager-resource-editor': '' }).length, 1)
assert.ok(renderedText(tree.root).includes('Invalid resource record'))
assert.equal(remoteFixture.resourceWrites.length, 0)

await act(async () => {
  tree.root.findByProps({ 'data-context-manager-new-resource': '' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-create-id' }).props.onChange({ currentTarget: { value: 'res-ui' } })
  tree.root.findByProps({ id: 'cm-resource-create-name' }).props.onChange({ currentTarget: { value: 'New Resource' } })
  tree.root.findByProps({ id: 'cm-resource-create-content' }).props.onChange({ currentTarget: { value: 'Line 1\nLine 2\n' } })
})
assert.equal(remoteFixture.resourceWrites.length, 0)
// Two rapid form submits from the same render must not issue two writes or
// publish an obsolete busy result that overwrites the successful outcome.
await act(async () => {
  const form = tree.root.findAllByType('form')[0]
  form.props.onSubmit({ preventDefault() {} })
  form.props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, 1)
assert.equal(remoteFixture.resourceWrites[0].kind, 'resource-create')
assert.ok(renderedText(tree.root).includes('Resource saved and authoritative state refreshed.'))
assert.deepEqual(remoteFixture.resourceWrites[0].basis, { resourceAuthorityId: 'm7c-fixture-resource' })
assert.equal(remoteFixture.resources.get('res-ui').content, 'Line 1\nLine 2\n')

await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-edit-name' }).props.onChange({ currentTarget: { value: 'Renamed Resource' } })
  tree.root.findByProps({ id: 'cm-resource-edit-content' }).props.onChange({ currentTarget: { value: 'Exact\n\n' } })
})
assert.equal(remoteFixture.resourceWrites.length, 1)
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, 2)
assert.equal(remoteFixture.resourceWrites[1].kind, 'resource-replace')
assert.equal(remoteFixture.resources.get('res-ui').content, 'Exact\n\n')
assert.equal(remoteFixture.resources.get('res-ui').name, 'Renamed Resource')

await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
await act(async () => { buttonByLabel(tree, 'Explicitly set an empty description string').props.onClick() })
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites[2].kind, 'resource-description')
assert.equal(remoteFixture.resources.get('res-ui').description, '')

await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
await act(async () => { buttonByLabel(tree, 'Remove description field').props.onClick() })
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites[3].kind, 'resource-description')
assert.equal(remoteFixture.resources.get('res-ui').description, undefined)
assert.equal(Object.hasOwn(remoteFixture.resources.get('res-ui'), 'description'), false)

// An uncertain Host reply must retain a non-retryable draft through close/reopen.
await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-edit-content' }).props.onChange({ currentTarget: { value: 'Committed but unknown' } })
})
remoteFixture.makeUnknownNextResourceWrite()
const beforeUnknown = remoteFixture.resourceWrites.length
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, beforeUnknown + 1)
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-resource-editor': '' }).length, 1)
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-resource-editor': '' }).length, 1)
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
assert.equal(remoteFixture.resourceWrites.length, beforeUnknown + 1)
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })

// An ABA replacement with the same ID/revision but new Incarnation must
// reject the original editor Stamp and never overwrite the external Resource.
await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-edit-name' }).props.onChange({ currentTarget: { value: 'Illegal old edit' } })
})
remoteFixture.externalResourceReplacement('res-ui', 'External actor won')
const beforeConflict = remoteFixture.resourceWrites.length
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, beforeConflict + 1)
assert.equal(remoteFixture.resources.get('res-ui').name, 'External actor won')
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })

// An acknowledged write with a failed authoritative List read is *applied*
// but degraded. The UI must never replay it; explicit refresh is read-only.
await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-edit-content' }).props.onChange({
    currentTarget: { value: 'Committed with degraded read-back' },
  })
})
remoteFixture.failNextResourceListRead()
const beforeDegraded = remoteFixture.resourceWrites.length
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, beforeDegraded + 1)
assert.equal(remoteFixture.resources.get('res-ui').content, 'Committed with degraded read-back')
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
assert.ok(renderedText(tree.root).includes('read-back incomplete'))
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })
await act(async () => { buttonByLabel(tree, 'Refresh').props.onClick() })
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, beforeDegraded + 1)

// The Resource deletion must not cascade to Profile PromptBinding intent.
remoteFixture.profiles.main.prompts.dangling = {
  resourceId: 'res-ui', enabled: true, placement: 'before-persona', order: 1,
}
await act(async () => { buttonByLabel(tree, 'Delete resource').props.onClick() })
assert.ok(renderedText(tree.root).includes('It does not delete referring Profile PromptBindings'))
await act(async () => { buttonByLabel(tree, 'Confirm delete').props.onClick() })
await settleUI()
assert.equal(remoteFixture.resources.has('res-ui'), false)
assert.equal(remoteFixture.profiles.main.prompts.dangling.resourceId, 'res-ui')
assert.equal(remoteFixture.resourceWrites.at(-1).kind, 'resource-delete')
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick() })
await settleUI()
assert.equal(tree.root.findAllByProps({ 'data-context-manager-new-profile': '' }).length, 1)

// M8A2 GREEN: real published Renderer + Business Face + Profile Controller.
// Each explicit Binding Save maps to one existing Profile RPC on its original
// instanceId/Settings revision. Resources (including missing references) are not
// looked up or mutated while authoring Profile-local Binding intent.
assert.equal(tree.root.findAllByProps({ 'data-context-manager-prompt-bindings': '' }).length, 1)
const bindingWritesStart = remoteFixture.writes.length
const resourceWritesStart = remoteFixture.resourceWrites.length
// A preceding Resource failure may retain a stale Profile baseline.
// If stale, the Binding editor must remain read-only; explicitly refresh
// authoritative Profile state before beginning a new Binding operation.
// Resource-only increments do not themselves advance the Profile cursor.
if (injectedBusiness?.()?.hooks.contextManager.getSnapshot().profiles.stale) {
  assert.equal(tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.disabled, true)
}
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const bindingStartButton = tree.root.findByProps({ 'data-context-manager-new-binding': '' })
assert.equal(bindingStartButton.props.disabled, false, 'fresh Profile basis should permit a new binding')

// M8A2 Fix2 RED: a Profile default handler captured before a Binding draft
// must not dispatch after the Store begins that draft, even *before React
// re-renders*. The Controller does not own Presentation draft exclusivity.
const oldDefaultOnClick = buttonByLabel(tree, 'Set as default').props.onClick
const beforeStaleDefault = remoteFixture.writes.length
await act(async () => {
  bindingStartButton.props.onClick()
  oldDefaultOnClick()
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeStaleDefault,
  'M8A2 Fix2 RED: obsolete default callback must issue 0 Profile RPCs')
assert.equal(tree.root.findAllByProps({ 'data-context-manager-binding-create-form': '' }).length, 1)
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
await settleUI()

// Old M7C submit closure cannot save after cancel and Binding draft takeover.
await act(async () => { buttonByLabel(tree, 'Edit', 0).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-edit-name' }).props.onChange({ currentTarget: { value: 'obsolete-profile-write' } })
})
const obsoleteProfileSubmit = tree.root.findAllByType('form')[0].props.onSubmit
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
await act(async () => { tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick() })
const beforeStaleProfileSave = remoteFixture.writes.length
await act(async () => {
  obsoleteProfileSubmit({ preventDefault() {} })
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeStaleProfileSave,
  'M8A2 Fix2 RED: stale M7C form must not dispatch during Binding draft')
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })

// Old M8A2 Save closure cannot submit an abandoned Binding when a new
// Binding draft owns the same shared Profile Store slot.
await act(async () => { tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-create-id' }).props.onChange({ currentTarget: { value: 'abandoned-binding' } })
})
const obsoleteBindingSubmit = tree.root.findByProps({
  'data-context-manager-binding-create-form': '',
}).props.onSubmit
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
await act(async () => { tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick() })
const beforeStaleBindingSave = remoteFixture.writes.length
await act(async () => {
  obsoleteBindingSubmit({ preventDefault() {} })
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeStaleBindingSave,
  'M8A2 Fix2 RED: abandoned Binding form must issue 0 Profile RPCs')
assert.equal(Object.hasOwn(remoteFixture.profiles.main.prompts, 'abandoned-binding'), false)
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })

await act(async () => { tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick() })
assert.equal(tree.root.findAllByProps({ id: 'cm-binding-create-id' }).length, 1,
  'M8A2 beginCreate must retain the bound selected usable Profile draft')
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-create-id' }).props.onChange({ currentTarget: { value: 'm8a2-ui' } })
  tree.root.findByProps({ id: 'cm-binding-create-resource' }).props.onChange({ currentTarget: { value: 'missing/日本語' } })
  tree.root.findByProps({ id: 'cm-binding-create-order' }).props.onChange({ currentTarget: { value: '-5' } })
})
assert.equal(remoteFixture.writes.length, bindingWritesStart)
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-create-form': '' }).props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, bindingWritesStart + 1)
assert.equal(remoteFixture.writes.at(-1).kind, 'binding-add')
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].resourceId, 'missing/日本語')
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].order, -5)
assert.equal(remoteFixture.resourceWrites.length, resourceWritesStart)

async function bindingLeaf(field, fieldId, value, expectedKind) {
  const before = remoteFixture.writes.length
  await act(async () => {
    tree.root.findByProps({ ['data-context-manager-binding-edit-' + field]: 'm8a2-ui' }).props.onClick()
  })
  await act(async () => {
    const change = field === 'enabled' || field === 'placement'
      ? { currentTarget: { value } }
      : { currentTarget: { value } }
    tree.root.findByProps({ id: fieldId }).props.onChange(change)
  })
  const currentForm = tree.root.findByProps({ 'data-context-manager-binding-edit-form': '' })
  await act(async () => {
    // A second synchronous submission of one render must be single-flight.
    currentForm.props.onSubmit({ preventDefault() {} })
    currentForm.props.onSubmit({ preventDefault() {} })
    for (let i = 0; i < 25; i += 1) await Promise.resolve()
  })
  await settleUI()
  assert.equal(remoteFixture.writes.length, before + 1)
  assert.equal(remoteFixture.writes.at(-1).kind, expectedKind)
  assert.equal(remoteFixture.resourceWrites.length, resourceWritesStart)
}
await bindingLeaf('resourceId', 'cm-binding-edit-resourceId', '__proto__', 'binding-resource')
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].resourceId, '__proto__')
await bindingLeaf('enabled', 'cm-binding-edit-enabled', 'false', 'binding-enabled')
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].enabled, false)
await bindingLeaf('placement', 'cm-binding-edit-placement', 'runtime-context', 'binding-placement')
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].placement, 'runtime-context')
await bindingLeaf('order', 'cm-binding-edit-order', '-42', 'binding-order')
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].order, -42)

// Unknown is never reinterpreted as applied even when read-back matches.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-resourceId': 'm8a2-ui' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-edit-resourceId' }).props.onChange({
    currentTarget: { value: 'unknown-response-but-committed' },
  })
})
remoteFixture.makeUnknownNextWrite()
const beforeUnknownBinding = remoteFixture.writes.length
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-form': '' }).props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeUnknownBinding + 1)
assert.equal(remoteFixture.profiles.main.prompts['m8a2-ui'].resourceId, 'unknown-response-but-committed')
assert.equal(tree.root.findByProps({ 'data-context-manager-binding-save': '' }).props.disabled, true)
assert.ok(renderedText(tree.root).includes('write outcome is unknown'))
// An attempted tab switch must neither lose the uncertain result nor replay it.
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-prompt-bindings': '' }).length, 1)
assert.ok(renderedText(tree.root).includes('write outcome is unknown'))
await act(async () => { trigger().props.onClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-drawer': '' }).length, 0)
await act(async () => { trigger().props.onClick() })
await settleUI()
assert.ok(renderedText(tree.root).includes('write outcome is unknown'))
assert.equal(tree.root.findByProps({ 'data-context-manager-binding-save': '' }).props.disabled, true)
assert.equal(remoteFixture.writes.length, beforeUnknownBinding + 1)
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })
await settleUI()
assert.equal(remoteFixture.writes.length, beforeUnknownBinding + 1)

await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-delete': 'm8a2-ui' }).props.onClick()
})
assert.ok(renderedText(tree.root).includes('Only this Profile binding will be deleted'))
const beforeDeleteBinding = remoteFixture.writes.length
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-delete-confirm': '' })
    .findAllByType('button').find(node => node.props.children === 'Confirm delete').props.onClick()
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeDeleteBinding + 1)
assert.equal(remoteFixture.writes.at(-1).kind, 'binding-delete')
assert.equal(Object.hasOwn(remoteFixture.profiles.main.prompts, 'm8a2-ui'), false)
assert.equal(remoteFixture.profiles.main.prompts.dangling.resourceId, 'res-ui')
assert.equal(remoteFixture.resourceWrites.length, resourceWritesStart)

// M8A2 Fix RED: old rendered callback MUST NOT capture a newer revision and
// silently overwrite a Binding that changed between rendering and clicking.
const obsoleteEditClick = tree.root.findByProps({
  'data-context-manager-binding-edit-resourceId': 'dangling',
}).props.onClick
remoteFixture.externalBindingResourceId('main', 'dangling', 'concurrent-writer-won')
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const beforeStaleBegin = remoteFixture.writes.length
await act(async () => { obsoleteEditClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-binding-edit-form': '' }).length, 0,
  'M8A2 RED: obsolete rendered callback may not begin a draft with a new Profile basis')
assert.equal(remoteFixture.writes.length, beforeStaleBegin)

// M8A2 Fix RED: an externally stored unsafe key is readable, but each Host
// structural write would be refused. No misleading editable button.
Object.defineProperty(remoteFixture.profiles.main.prompts, '__proto__', {
  value: { resourceId: '__proto__', enabled: true,
    placement: 'before-persona', order: 0 },
  enumerable: true, configurable: true, writable: true,
})
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const unsafeBindingRow = tree.root.findByProps({ 'data-context-manager-binding-row': '__proto__' })
assert.ok(unsafeBindingRow.findAllByType('button').every(node => node.props.disabled === true),
  'M8A2 RED: __proto__ Binding path is read-only and must not offer writes')
assert.ok(renderedText(unsafeBindingRow).includes('read-only'))

// Binding-specific Conflict: a concurrent Settings writer wins at the Host.
// The old binding basis is never rebased; a forbidden tab switch cannot
// overwrite the exact conflict notice and no implicit retry occurs.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-enabled': 'dangling' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-edit-enabled' }).props.onChange({
    currentTarget: { value: 'false' },
  })
})
remoteFixture.externalBindingResourceId('main', 'dangling', 'external-cas-winner')
const beforeBindingConflict = remoteFixture.writes.length
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-form': '' })
    .props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeBindingConflict + 1)
assert.equal(remoteFixture.profiles.main.prompts.dangling.enabled, true)
assert.equal(remoteFixture.profiles.main.prompts.dangling.resourceId, 'external-cas-winner')
assert.ok(renderedText(tree.root).includes('Profile write conflict'))
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick() })
assert.ok(renderedText(tree.root).includes('Profile write conflict'))
assert.equal(tree.root.findByProps({ 'data-context-manager-binding-save': '' }).props.disabled, true)
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })
assert.equal(remoteFixture.writes.length, beforeBindingConflict + 1)

// Confirmed applied + failed authoritative Profile rehydrate is NOT Conflict
// or Unknown. The confirmed write remains permanently blocked from replay.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-placement': 'dangling' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-edit-placement' }).props.onChange({
    currentTarget: { value: 'runtime-context' },
  })
})
remoteFixture.failProfileReads()
const beforeBindingDegraded = remoteFixture.writes.length
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-form': '' })
    .props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeBindingDegraded + 1)
assert.equal(remoteFixture.profiles.main.prompts.dangling.placement, 'runtime-context')
assert.ok(renderedText(tree.root).includes('Write confirmed, but reconciliation is incomplete'))
assert.equal(tree.root.findByProps({ 'data-context-manager-binding-save': '' }).props.disabled, true)
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick() })
assert.ok(renderedText(tree.root).includes('Write confirmed, but reconciliation is incomplete'))
remoteFixture.restoreProfileReads()
await act(async () => { buttonByLabel(tree, 'Refresh').props.onClick() })
await settleUI()
assert.ok(renderedText(tree.root).includes('Write confirmed, but reconciliation is incomplete'))
assert.equal(remoteFixture.writes.length, beforeBindingDegraded + 1)
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })

// A Resource Authority rotation, without a Profile revision/instance change,
// may stale Resource metadata but must leave Profile writes fully possible.
const beforeSourceRotation = injectedBusiness?.()?.hooks.contextManager.getSnapshot()
const profileRevisionBefore = beforeSourceRotation?.profiles.data?.persistence.revision
remoteFixture.externalRotateResourceAuthority()
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const afterSourceRotation = injectedBusiness?.()?.hooks.contextManager.getSnapshot()
assert.notEqual(afterSourceRotation.changes.resourceAuthorityId,
  beforeSourceRotation.changes.resourceAuthorityId)
assert.equal(afterSourceRotation.profiles.data.persistence.revision, profileRevisionBefore)
assert.equal(afterSourceRotation.profiles.stale, false)
const beforeResourceIndependentWrite = remoteFixture.writes.length
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-order': 'dangling' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-edit-order' }).props.onChange({
    currentTarget: { value: '-7' },
  })
})
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-form': '' })
    .props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeResourceIndependentWrite + 1)
assert.equal(remoteFixture.profiles.main.prompts.dangling.order, -7)
assert.equal(remoteFixture.resourceWrites.length, resourceWritesStart)

// An old React closure must also fail when the Host instance changes while
// the Settings revision is numerically unchanged.
const beforeHostSwitchCallback = tree.root.findByProps({
  'data-context-manager-binding-edit-resourceId': 'dangling',
}).props.onClick
remoteFixture.externalRotateHostInstance()
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const beforeHostSwitchWrite = remoteFixture.writes.length
await act(async () => { beforeHostSwitchCallback() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-binding-edit-form': '' }).length, 0)
assert.equal(remoteFixture.writes.length, beforeHostSwitchWrite)

remoteFixture.setReadOnly(true)
const overlayFace = injectedBusiness?.()
assert.ok(overlayFace)
await act(async () => {
  await overlayFace.refresh()
})
await settleUI()
assert.equal(tree.root.findByProps({ 'data-context-manager-new-profile': '' }).props.disabled, true)

await act(async () => { tree.unmount() })
disposeRoot()
await disposePlugin()
await sessionFiber.dispose()
await rendererFiber.dispose()
