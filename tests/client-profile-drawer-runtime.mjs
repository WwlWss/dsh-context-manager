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
  const instanceId = 'm7c-real-ui-host'
  let revision = 7
  let change = 10
  let defaultId = 'main'
  let unknownNextWrite = false
  let readOnly = false
  const writes = []
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
    change += 1
    if (unknownNextWrite) {
      unknownNextWrite = false
      throw new Error('simulated lost reply after commit')
    }
    return accepted(profileSnapshot())
  }

  const face = {
    async protocol() { return okRead({ apiVersion: 2 }) },
    async changes() {
      return okRead({
        instanceId,
        generation: change,
        profiles: change,
        promptResources: 0,
        presets: change,
        runtime: change,
      })
    },
    async profiles() { return okRead(profileSnapshot()) },
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
  }
  return {
    face, profiles, writes,
    getDefault: () => defaultId,
    makeUnknownNextWrite() { unknownNextWrite = true },
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
