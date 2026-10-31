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
  const readCalls = { protocol: 0, profiles: 0, resourceLists: 0 }
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

  async function write(kind, basis, update, details = {}) {
    writes.push({ kind, basis, ...details })
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
    async protocol() { readCalls.protocol++; return okRead({ apiVersion: 3 }) },
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
      readCalls.profiles++
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
      readCalls.resourceLists++
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
    // Test-only existing Remote v3 RPCs. Neither Skill UI nor controller
    // behavior is mocked: these are reached only via the real Business Face.
    setSkillMode(profileId, skillName, mode, basis) {
      return write('skill-mode', basis, () => {
        const map = profiles[profileId].skills
        const previous = Object.hasOwn(map, skillName) ? map[skillName] : {}
        Object.defineProperty(map, skillName, {
          value: { ...previous, mode },
          enumerable: true, writable: true, configurable: true,
        })
      }, { profileId, skillName, mode })
    },
    removeSkillBinding(profileId, skillName, basis) {
      return write('skill-remove', basis, () => {
        delete profiles[profileId].skills[skillName]
      }, { profileId, skillName })
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
    face, profiles, writes, resources, resourceWrites, readCalls,
    getDefault: () => defaultId,
    // The chosen Profile snapshot is seeded before the real Renderer is
    // mounted. Special names are own Settings-style keys, not native catalog.
    seedSkillsForProbe() {
      const skills = Object.create(null)
      for (const [id, mode] of [
        ['manual', 'manual'],
        ['constructor', 'auto'],
        ['日本語', 'off'],
        ['toString', 'pinned'],
        ['__proto__', 'manual'],
      ]) Object.defineProperty(skills, id, {
        value: { mode }, enumerable: true, configurable: true, writable: true,
      })
      profiles.main.skills = skills
    },
    externalSkillMode(profileId, skillName, mode) {
      const map = profiles[profileId].skills
      const previous = Object.hasOwn(map, skillName) ? map[skillName] : {}
      Object.defineProperty(map, skillName, {
        value: { ...previous, mode }, enumerable: true, configurable: true, writable: true,
      })
      revision += 1
      profileCursor += 1
      change += 1
    },
    makeUnknownNextResourceWrite() { unknownNextResourceWrite = true },
    failNextResourceListRead() { failNextResourceListRead = true },
    externalResourceReplacement(id, newName) {
      const old = resources.get(id)
      resources.set(id, {
        ...old, name: newName,
        // A *second* replacement must be another incarnation even when the
        // Resource ID and numerical revision happen to be identical.
        incarnationId: 'new-incarnation-' + id + '-' + String(resourceCursor + 1),
      })
      resourceCursor += 1
      change += 1
    },
    externalResourceRevision(id, newName) {
      const old = resources.get(id)
      resources.set(id, { ...old, name: newName, revision: old.revision + 1 })
      resourceCursor += 1
      change += 1
    },
    externalSetDefault(id) {
      defaultId = id
      revision += 1
      profileCursor += 1
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
if (process.env.M8B_SKILL_PROBE) remoteFixture.seedSkillsForProbe()
// R15 tests seed *real* Remote fixture rows before the published DSH
// Business Face mounts. No direct Presentation Store / React mocks.
if (process.env.M8B_SKILL_PROBE?.startsWith('R15')) {
  const binding = { resourceId: 'fixture-prompt', enabled: true,
    placement: 'before-persona', order: 1 }
  remoteFixture.profiles.main.prompts.legacy = { ...binding }
  remoteFixture.profiles.beta = {
    name: 'Beta Profile', description: 'Independent Profile', basePreset: 'native',
    skills: {}, prompts: { legacy: { ...binding } },
  }
  const seed = (id, name) => remoteFixture.resources.set(id, {
    id, name, content: 'R15 readable body: ' + id,
    revision: 1, incarnationId: 'r15-' + id,
  })
  if (process.env.M8B_SKILL_PROBE === 'R15R') seed('b-resource', 'Bravo Resource')
  if (process.env.M8B_SKILL_PROBE === 'R15RBegin') {
    seed('a-resource', 'Alpha Resource')
    seed('b-resource', 'Bravo Resource')
  }
}
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
let registeredOverlayStore
let registeredSidebarStore
let delayNextUiRefresh = false
let uiRefreshDispatches = 0
let uiListDispatches = 0
let rejectDelayedUiRefresh
slotFace.register = (options, component) => {
  if (options.name === 'shell.overlay') {
    injectedBusiness = options.inject
    registeredOverlayStore = options.store
    const originalInject = options.inject
    return register({
      ...options,
      inject: () => {
        const face = originalInject()
        return {
          ...face,
          // Test-only delayed UI read failure: Controller reads continue on
          // their actual paths, so no invented Host/Remote mutation response.
          refresh: () => {
            uiRefreshDispatches++
            return delayNextUiRefresh
              ? new Promise((_resolve, reject) => {
                delayNextUiRefresh = false
                rejectDelayedUiRefresh = reject
              })
              : face.refresh()
          },
          loadPromptResourceList: () => {
            uiListDispatches++
            return face.loadPromptResourceList()
          },
        }
      },
    }, component)
  }
  if (options.name === 'sidebar.footer.action') registeredSidebarStore = options.store
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
assert.strictEqual(registeredOverlayStore, registeredSidebarStore,
  'M8A2 live dispatch gate MUST use the same published DSH root StoreHandle')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, true,
  'the native Renderer must have created an observable root StoreInstance')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.pane, 'profiles')
assert.equal(tree.root.findAllByProps({ 'data-context-manager-new-profile': '' }).length, 1)
assert.equal(remoteFixture.writes.length, 0)

// B1-3 uses this same Published Renderer + root Store + real Business Face.
// The probe branch isolates each intentional RED from the long historical
// M7C/M8A1/M8A2 green scenario; it never substitutes a fake UI renderer.
if (process.env.M8B_SKILL_PROBE) {
  const probe = process.env.M8B_SKILL_PROBE
  const live = () => registeredOverlayStore.readLiveSnapshot()
  const skillRows = () => tree.root.findAll(node =>
    node.props?.['data-context-manager-skill-row'] !== undefined)
  const beforeWrites = remoteFixture.writes.length
  const initialProfiles = injectedBusiness?.()?.hooks.contextManager.getSnapshot().profiles
  assert.equal(initialProfiles.status, 'ready',
    'B1-3: the actual published Client must have hydrated the Profile snapshot')
  assert.equal(initialProfiles.data?.profiles.main.skills.manual.mode, 'manual')

  // Independent mount control; subsequent REDs must reach real React Begin
  // callbacks, not fail because the Skill section itself is absent.
  const sections = tree.root.findAllByProps({ 'data-context-manager-skills': '' })
  assert.equal(sections.length, 1,
    'B1-R01: real selected usable Profile must mount Skill section')
  assert.deepEqual(skillRows().map(row => row.props['data-context-manager-skill-row']),
    ['__proto__', 'constructor', 'manual', 'toString', '日本語'],
    'B1-R01: only exact own configured keys, code-unit order; no native inventory')
  for (const [name, mode] of [
    ['__proto__', 'manual'], ['constructor', 'auto'], ['manual', 'manual'],
    ['toString', 'pinned'], ['日本語', 'off'],
  ]) {
    const row = tree.root.findByProps({ 'data-context-manager-skill-row': name })
    assert.ok(renderedText(row).includes(mode),
      'B1-R01: visible explicit mode for ' + JSON.stringify(name))
  }
  assert.equal(tree.root.findByProps({
    'data-context-manager-skill-edit': '__proto__',
  }).props.disabled, true, 'unsafe own Skill key is viewable but not editable')
  assert.equal(tree.root.findByProps({
    'data-context-manager-skill-edit': 'constructor',
  }).props.disabled, false, 'constructor is a valid Skill path key')
  assert.equal(remoteFixture.writes.length, beforeWrites,
    'B1-R01: rendering explicit Skills must not issue Host writes')
  assert.equal(live()?.draft, null)
  assert.equal(live()?.resourceDraft, null)

  switch (probe) {
    case 'R01':
      // Read-only mount/sort proof. R02-R05 independently exercise handlers.
      break

    case 'R02': {
      const startCreate = tree.root.findByProps({
        'data-context-manager-skill-new': '',
      })
      assert.equal(startCreate.props.disabled, false)
      const tokenBefore = live()?.nextDraftToken
      await act(async () => { startCreate.props.onClick() })
      assert.equal(live()?.draft?.kind, 'skill-mode-create',
        'B1-R02 RED: real Skill Configure Begin must enter the one Profile Store slot')
      assert.equal(live()?.nextDraftToken, tokenBefore + 1)
      assert.equal(live()?.draft?.mode, 'auto',
        'B1-R02: explicit Auto must be default for the new draft')
      assert.equal(remoteFixture.writes.length, beforeWrites,
        'Begin is not a Host write')
      const form = tree.root.findByProps({ 'data-context-manager-skill-create-form': '' })
      assert.ok(form, 'Create draft must expose a real editable form')
      // Empty Skill key must be accepted without trimming or coercion.
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-create-name' }).props.onChange({
          currentTarget: { value: '' },
        })
      })
      await act(async () => {
        form.props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 25; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      assert.deepEqual(remoteFixture.writes.at(-1), {
        kind: 'skill-mode', basis: { instanceId: 'm7c-real-ui-host', revision: 7 },
        profileId: 'main', skillName: '', mode: 'auto',
      })
      assert.equal(Object.hasOwn(remoteFixture.profiles.main.skills, ''), true)
      assert.equal(remoteFixture.profiles.main.skills[''].mode, 'auto')
      break
    }

    case 'R03': {
      const click = tree.root.findByProps({
        'data-context-manager-skill-edit': 'manual',
      }).props.onClick
      await act(async () => { click() })
      assert.equal(live()?.draft?.kind, 'skill-mode-edit',
        'B1-R03 RED: mounted Skill mode Edit must create one Profile draft')
      assert.equal(live()?.draft?.originalMode, 'manual')
      assert.equal(live()?.draft?.skillName, 'manual')
      assert.equal(remoteFixture.writes.length, beforeWrites,
        'Mode Edit Begin is not an RPC')
      const mode = tree.root.findByProps({ id: 'cm-skill-mode-edit' })
      await act(async () => { mode.props.onChange({ currentTarget: { value: 'pinned' } }) })
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 25; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      assert.equal(remoteFixture.writes.at(-1)?.kind, 'skill-mode')
      assert.equal(remoteFixture.writes.at(-1)?.mode, 'pinned')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'pinned')
      break
    }

    case 'R04': {
      const click = tree.root.findByProps({
        'data-context-manager-skill-delete': '日本語',
      }).props.onClick
      await act(async () => { click() })
      assert.equal(live()?.draft?.kind, 'skill-binding-delete',
        'B1-R04 RED: removal must create confirmation, not immediate RPC')
      assert.equal(live()?.draft?.skillName, '日本語')
      assert.equal(live()?.draft?.originalMode, 'off')
      assert.equal(remoteFixture.writes.length, beforeWrites,
        'Begin Remove must not delete anything before confirmation')
      const confirmation = tree.root.findByProps({
        'data-context-manager-skill-delete-confirm': '',
      })
      const text = renderedText(confirmation)
      assert.ok(text.includes(JSON.stringify('main')))
      assert.ok(text.includes(JSON.stringify('日本語')))
      assert.ok(text.includes('extension') || text.includes('扩展'),
        'destructive confirmation must warn about unknown Stored sibling fields')
      await act(async () => {
        confirmation.findByProps({ 'data-context-manager-skill-confirm-delete': '' })
          .props.onClick()
        for (let i = 0; i < 25; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      assert.equal(remoteFixture.writes.at(-1)?.kind, 'skill-remove')
      assert.equal(Object.hasOwn(remoteFixture.profiles.main.skills, '日本語'), false)
      break
    }

    case 'R05': {
      const oldEdit = tree.root.findByProps({
        'data-context-manager-skill-edit': 'manual',
      }).props.onClick
      remoteFixture.externalSkillMode('main', 'manual', 'pinned')
      await act(async () => { await injectedBusiness?.()?.refresh() })
      await settleUI()
      await act(async () => { oldEdit() })
      assert.equal(live()?.draft, null,
        'B1-R05: obsolete rendered Edit cannot create a draft on newer Settings revision')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      const freshEdit = tree.root.findByProps({
        'data-context-manager-skill-edit': 'manual',
      }).props.onClick
      await act(async () => { freshEdit() })
      assert.equal(live()?.draft?.kind, 'skill-mode-edit',
        'B1-R05 RED: fresh displayed mode must permit editing at new Settings revision')
      assert.equal(live()?.draft?.originalMode, 'pinned')
      break
    }


    case 'R06V': {
      // Observable external Settings writer: stale Save emits ZERO RPC.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      const oldSave = tree.root.findByProps({
        'data-context-manager-skill-edit-form': '',
      }).props.onSubmit
      remoteFixture.externalSkillMode('main', 'toString', 'manual')
      await act(async () => { await injectedBusiness?.()?.refresh() })
      await settleUI()
      await act(async () => {
        oldSave({ preventDefault() {} })
        for (let i = 0; i < 30; i += 1) await Promise.resolve()
      })
      assert.equal(remoteFixture.writes.length, beforeWrites,
        'B1-R06V: visible stale Settings Basis must be rejected before RPC')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'manual')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R06V RED: fresh rendered Save must work at the new revision')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'off')
      break
    }

    case 'R06H': {
      // Host-only external writer, invisible to Client until attempted CAS.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'pinned' } })
      })
      const originalBasis = live()?.draft?.basis
      remoteFixture.externalSkillMode('main', 'toString', 'manual')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R06H RED: one original-Basis RPC must reach actual Host CAS')
      assert.deepEqual(remoteFixture.writes.at(-1)?.basis, originalBasis)
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'manual',
        'rejected CAS must never persist the stale mode')
      assert.equal(live()?.draft?.blocked, 'conflict')
      assert.equal(live()?.notice?.code, 'noticeConflict')
      break
    }

    case 'R07': {
      // Old Save after Cancel and new same-Profile draft must not consume the
      // new Token. Positive current Save makes an inert implementation fail.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'pinned' } })
      })
      const obsolete = tree.root.findByProps({
        'data-context-manager-skill-edit-form': '',
      }).props.onSubmit
      const oldToken = live()?.draft?.token
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      assert.notEqual(live()?.draft?.token, oldToken)
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      await act(async () => {
        obsolete({ preventDefault() {} })
        for (let i = 0; i < 20; i += 1) await Promise.resolve()
      })
      assert.equal(remoteFixture.writes.length, beforeWrites,
        'B1-R07: an old Save cannot write or claim a newer Token')
      assert.equal(live()?.draft?.kind, 'skill-mode-edit')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R07 RED: genuine new Save must commit exactly once')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'off')
      break
    }

    case 'R08': {
      // Same-render Save twice, then Save->Cancel, must claim synchronously.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'pinned' } })
      })
      const submit = tree.root.findByProps({
        'data-context-manager-skill-edit-form': '',
      }).props.onSubmit
      const cancel = buttonByLabel(tree, 'Cancel').props.onClick
      await act(async () => {
        submit({ preventDefault() {} })
        submit({ preventDefault() {} })
        cancel()
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R08 RED: exactly one synchronous claim survives double Save/Cancel')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'pinned')
      assert.equal(live()?.draft, null)
      break
    }

    case 'R08U': {
      // The Host has applied a write but the response was dropped: Unknown
      // blocks automatic replay and preserves the one original receipt.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      remoteFixture.makeUnknownNextWrite()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R08U RED: the real Host must receive one write before lost reply')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'off')
      assert.equal(live()?.draft?.blocked, 'unknown')
      assert.equal(live()?.notice?.code, 'noticeOutcomeUnknown')
      assert.ok(live()?.notice?.detail?.includes('simulated lost reply'))
      const originalReceipt = live()?.notice
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      assert.deepEqual(live()?.notice, originalReceipt)
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })
      assert.equal(live()?.draft, null)
      break
    }

    case 'R09': {
      // Applied+Degraded means the write is confirmed but the read-back is
      // not; neither Unknown nor a retry is permitted.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      remoteFixture.failProfileReads()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R09 RED: exactly one real acknowledged write')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'off')
      assert.equal(live()?.draft?.blocked, 'unverified')
      assert.equal(live()?.notice?.code, 'noticeSavedDegraded')
      const degradedUiText = renderedText(tree.root)
      assert.ok(
        degradedUiText.includes('Write confirmed, but reconciliation is incomplete. Refresh; do not resubmit.')
          || degradedUiText.includes('写入已确认，但重新同步不完整；请刷新，不要再次提交。'),
        'B1-R09: the confirmed-degraded notice must be rendered using the actual localized Profile message',
      )
      const first = live()?.notice
      await act(async () => { tree.root.findByProps({
        'data-context-manager-tab': 'resources',
      }).props.onClick() })
      assert.deepEqual(live()?.notice, first,
        'B1-R09: late reads/pane changes cannot overwrite confirmed degraded receipt')
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      break
    }

    case 'R10': {
      // F01-SR1 semantics extend to retained Skill drafts, not just legacy.
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'pinned' } })
      })
      const oldSave = tree.root.findByProps({
        'data-context-manager-skill-edit-form': '',
      }).props.onSubmit
      const original = live()?.draft
      await act(async () => { trigger().props.onClick() })
      assert.equal(live()?.open, false)
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.equal(live()?.open, true)
      assert.equal(live()?.draft?.token, original.token)
      assert.deepEqual(live()?.draft?.basis, original.basis)
      await act(async () => {
        oldSave({ preventDefault() {} })
        for (let i = 0; i < 20; i += 1) await Promise.resolve()
      })
      assert.equal(remoteFixture.writes.length, beforeWrites,
        'B1-R10: pre-Close Save callback must never write in reopened session')
      assert.equal(live()?.draft?.token, original.token)
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 35; i += 1) await Promise.resolve()
      })
      await settleUI()
      assert.equal(remoteFixture.writes.length, beforeWrites + 1,
        'B1-R10 RED: new reopened Save may write once with old original Basis')
      assert.equal(remoteFixture.profiles.main.skills.manual.mode, 'pinned')
      assert.equal(live()?.draft, null)
      break
    }


    // F01-SR2: independent real published Renderer old-event RED cases.
    // Each old callback is captured from the OLD render. A valid callback
    // captured after Reopen is the positive control against vacuous no-ops.
    case 'R11P': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-profile': '' }).props.onClick()
      })
      const oldDraft = live()?.draft
      assert.equal(oldDraft?.kind, 'create')
      const oldCancel = buttonByLabel(tree, 'Cancel').props.onClick
      await act(async () => { trigger().props.onClick() })
      assert.equal(live()?.open, false)
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.equal(live()?.draft?.token, oldDraft.token)
      assert.deepEqual(live()?.draft?.basis, oldDraft.basis)
      await act(async () => { oldCancel() })
      assert.equal(live()?.draft?.token, oldDraft.token,
        'F01-R11P RED: obsolete Profile Cancel cannot discard retained draft')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      assert.equal(live()?.draft, null,
        'F01-R11P: fresh Profile Cancel must still work')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R11B': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick()
      })
      const oldDraft = live()?.draft
      assert.equal(oldDraft?.kind, 'prompt-binding-create')
      const oldCancel = buttonByLabel(tree, 'Cancel').props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.equal(live()?.draft?.token, oldDraft.token)
      await act(async () => { oldCancel() })
      assert.equal(live()?.draft?.token, oldDraft.token,
        'F01-R11B RED: obsolete Binding Cancel cannot discard retained draft')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      assert.equal(live()?.draft, null,
        'F01-R11B: fresh Binding Cancel must still work')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R11R': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-resource': '' }).props.onClick()
      })
      const oldDraft = live()?.resourceDraft
      assert.equal(oldDraft?.kind, 'create')
      const oldCancel = buttonByLabel(tree, 'Cancel').props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.equal(live()?.resourceDraft?.token, oldDraft.token)
      assert.deepEqual(live()?.resourceDraft?.basis, oldDraft.basis)
      await act(async () => { oldCancel() })
      assert.equal(live()?.resourceDraft?.token, oldDraft.token,
        'F01-R11R RED: obsolete Resource Cancel cannot discard retained draft')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      assert.equal(live()?.resourceDraft, null,
        'F01-R11R: fresh Resource Cancel must still work')
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }

    case 'R11T': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      remoteFixture.makeUnknownNextWrite()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit-form': '' })
          .props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 30; i += 1) await Promise.resolve()
      })
      await settleUI()
      const first = live()?.notice
      const original = live()?.draft
      assert.equal(original?.blocked, 'unknown')
      assert.equal(first?.code, 'noticeOutcomeUnknown')
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      const oldDiscard = buttonByLabel(tree, 'Discard draft').props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => { oldDiscard() })
      assert.equal(live()?.draft?.token, original.token,
        'F01-R11T RED: obsolete Discard cannot erase retained Unknown Skill draft')
      assert.deepEqual(live()?.notice, first,
        'F01-R11T: old Discard cannot erase first terminal notice')
      assert.equal(remoteFixture.writes.length, beforeWrites + 1)
      await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })
      assert.equal(live()?.draft, null, 'F01-R11T: new explicit Discard must work')
      break
    }

    case 'R11TR': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-resource': '' }).props.onClick()
      })
      assert.equal(live()?.resourceDraft?.kind, 'create')
      await act(async () => {
        tree.root.findByProps({ id: 'cm-resource-create-id' })
          .props.onChange({ currentTarget: { value: 'f01-sr2-unknown' } })
        tree.root.findByProps({ id: 'cm-resource-create-name' })
          .props.onChange({ currentTarget: { value: 'F01 SR2 Unknown' } })
      })
      remoteFixture.makeUnknownNextResourceWrite()
      await act(async () => {
        tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
        for (let i = 0; i < 30; i += 1) await Promise.resolve()
      })
      await settleUI()
      const original = live()?.resourceDraft
      const first = live()?.resourceNotice
      assert.equal(original?.blocked, 'unknown')
      assert.equal(first?.code, 'resourceNoticeUnknown')
      assert.equal(remoteFixture.resourceWrites.length, 1)
      const oldDiscard = buttonByLabel(tree, 'Discard draft').props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => { oldDiscard() })
      assert.equal(live()?.resourceDraft?.token, original.token,
        'F01-R11TR RED: obsolete Resource Discard cannot remove Unknown')
      assert.deepEqual(live()?.resourceNotice, first)
      await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })
      assert.equal(live()?.resourceDraft, null)
      assert.equal(remoteFixture.resourceWrites.length, 1)
      break
    }

    case 'R12S': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-new': '' }).props.onClick()
      })
      assert.equal(live()?.draft?.kind, 'skill-mode-create')
      const oldInput = tree.root.findByProps({ id: 'cm-skill-create-name' }).props.onChange
      await act(async () => { oldInput({ currentTarget: { value: 'before' } }) })
      const original = live()?.draft
      const epochBefore = live()?.openSessionEpoch
      await act(async () => { trigger().props.onClick() })
      assert.equal(live()?.open, false)
      await act(async () => { oldInput({ currentTarget: { value: 'closed-overwrite' } }) })
      assert.equal(live()?.draft?.skillName, 'before',
        'F01-R12S RED: old Skill Create input during closed Drawer must be inert')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.equal(live()?.openSessionEpoch, epochBefore + 1)
      assert.equal(live()?.draft?.token, original.token)
      await act(async () => { oldInput({ currentTarget: { value: 'reopened-overwrite' } }) })
      assert.equal(live()?.draft?.skillName, 'before',
        'F01-R12S: obsolete Skill Create input cannot overwrite reopened name')
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-create-name' })
          .props.onChange({ currentTarget: { value: 'fresh' } })
      })
      assert.equal(live()?.draft?.skillName, 'fresh')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })

      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-edit': 'manual' }).props.onClick()
      })
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'pinned' } })
      })
      const oldMode = tree.root.findByProps({ id: 'cm-skill-mode-edit' }).props.onChange
      const beforeMode = live()?.draft
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.equal(live()?.draft?.token, beforeMode.token)
      await act(async () => { oldMode({ currentTarget: { value: 'off' } }) })
      assert.equal(live()?.draft?.mode, 'pinned',
        'F01-R12S: obsolete Skill Edit mode cannot overwrite new session')
      await act(async () => {
        tree.root.findByProps({ id: 'cm-skill-mode-edit' })
          .props.onChange({ currentTarget: { value: 'off' } })
      })
      assert.equal(live()?.draft?.mode, 'off',
        'F01-R12S: fresh mode onChange must remain editable')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R12P': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-profile': '' }).props.onClick()
      })
      assert.equal(live()?.draft?.kind, 'create')
      const oldInput = tree.root.findByProps({ id: 'cm-create-name' }).props.onChange
      await act(async () => { oldInput({ currentTarget: { value: 'original' } }) })
      const original = live()?.draft
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => {
        oldInput({ currentTarget: { value: 'obsolete-profile-name' } })
      })
      assert.equal(live()?.draft?.name, 'original',
        'F01-R12P RED: old Profile input cannot rewrite reopened draft')
      assert.equal(live()?.draft?.token, original.token)
      await act(async () => {
        tree.root.findByProps({ id: 'cm-create-name' })
          .props.onChange({ currentTarget: { value: 'current' } })
      })
      assert.equal(live()?.draft?.name, 'current')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R12B': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick()
      })
      assert.equal(live()?.draft?.kind, 'prompt-binding-create')
      const oldInput = tree.root.findByProps({ id: 'cm-binding-create-resource' }).props.onChange
      await act(async () => {
        oldInput({ currentTarget: { value: 'original-resource' } })
      })
      const original = live()?.draft
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => {
        oldInput({ currentTarget: { value: 'obsolete-binding-resource' } })
      })
      assert.equal(live()?.draft?.resourceId, 'original-resource',
        'F01-R12B RED: old Binding input cannot rewrite reopened draft')
      assert.equal(live()?.draft?.token, original.token)
      await act(async () => {
        tree.root.findByProps({ id: 'cm-binding-create-resource' })
          .props.onChange({ currentTarget: { value: 'current-resource' } })
      })
      assert.equal(live()?.draft?.resourceId, 'current-resource')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R12R': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-new-resource': '' }).props.onClick()
      })
      assert.equal(live()?.resourceDraft?.kind, 'create')
      const oldInput = tree.root.findByProps({ id: 'cm-resource-create-content' }).props.onChange
      await act(async () => {
        oldInput({ currentTarget: { value: 'original content' } })
      })
      const original = live()?.resourceDraft
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => {
        oldInput({ currentTarget: { value: 'obsolete resource content' } })
      })
      assert.equal(live()?.resourceDraft?.content, 'original content',
        'F01-R12R RED: old Resource input cannot rewrite reopened draft')
      assert.equal(live()?.resourceDraft?.token, original.token)
      await act(async () => {
        tree.root.findByProps({ id: 'cm-resource-create-content' })
          .props.onChange({ currentTarget: { value: 'current content' } })
      })
      assert.equal(live()?.resourceDraft?.content, 'current content')
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }


    // F01-SR3: obsolete navigation handlers belong to the original Drawer
    // opening, not merely this root Store. Positive current-session controls
    // prove the fix cannot just make every navigation handler inert.
    case 'R13T': {
      const oldToResources = tree.root.findByProps({
        'data-context-manager-tab': 'resources',
      }).props.onClick
      assert.equal(live()?.pane, 'profiles')
      await act(async () => { trigger().props.onClick() })
      await act(async () => { oldToResources() })
      assert.equal(live()?.pane, 'profiles',
        'F01-R13T RED: old Tab click cannot change Pane while Drawer is closed')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      const reopenEpoch = live()?.openSessionEpoch
      await act(async () => { oldToResources() })
      assert.equal(live()?.pane, 'profiles',
        'F01-R13T: old Tab click cannot navigate reopened Drawer')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      assert.equal(live()?.pane, 'resources',
        'F01-R13T: fresh Tab can navigate in the current session')
      const oldToProfiles = tree.root.findByProps({
        'data-context-manager-tab': 'profiles',
      }).props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.ok(live()?.openSessionEpoch > reopenEpoch)
      await act(async () => { oldToProfiles() })
      assert.equal(live()?.pane, 'resources',
        'F01-R13T: old Tab cannot navigate in the reverse direction')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick()
      })
      assert.equal(live()?.pane, 'profiles')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }

    case 'R13P': {
      assert.equal(live()?.pane, 'profiles')
      assert.equal(live()?.selectedProfileId, null)
      const getRow = () => {
        const rows = tree.root.findAll(node =>
          node.type === 'button'
          && node.props['aria-current'] === 'true'
          && renderedText(node).includes('Main'))
        assert.equal(rows.length, 1, 'F01-R13P: actual default Profile row must exist')
        return rows[0]
      }
      const oldSelection = getRow().props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { oldSelection() })
      assert.equal(live()?.selectedProfileId, null,
        'F01-R13P RED: Profile selection cannot mutate closed Drawer')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => { oldSelection() })
      assert.equal(live()?.selectedProfileId, null,
        'F01-R13P: obsolete Profile selection cannot alter a new session')
      await act(async () => { getRow().props.onClick() })
      assert.equal(live()?.selectedProfileId, 'main',
        'F01-R13P: the new Profile row selection remains usable')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R13R': {
      remoteFixture.resources.set('z-selectable', {
        id: 'z-selectable',
        name: 'F01 SR3 selectable resource',
        content: 'read-only navigation control',
        revision: 1,
        incarnationId: 'resource-session-selectable',
      })
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      assert.equal(live()?.pane, 'resources')
      assert.equal(live()?.selectedResourceId, null)
      const getRow = () => {
        const rows = tree.root.findAll(node =>
          node.type === 'button'
          && renderedText(node).includes('F01 SR3 selectable resource'))
        assert.equal(rows.length, 1, 'F01-R13R: real Resource row must be hydrated')
        return rows[0]
      }
      const oldSelection = getRow().props.onClick
      await act(async () => { trigger().props.onClick() })
      await act(async () => { oldSelection() })
      assert.equal(live()?.selectedResourceId, null,
        'F01-R13R RED: Resource selection cannot mutate closed Drawer')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => { oldSelection() })
      assert.equal(live()?.selectedResourceId, null,
        'F01-R13R: obsolete Resource row cannot select in reopened Drawer')
      await act(async () => { getRow().props.onClick() })
      assert.equal(live()?.selectedResourceId, 'z-selectable',
        'F01-R13R: a fresh Resource row remains selectable')
      assert.equal(remoteFixture.resourceWrites.length, 0)
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R13C': {
      const oldBackdropClose = tree.root.findByProps({
        'data-context-manager-backdrop': '',
      }).props.onClick
      const oldHeaderClose = tree.root.findByProps({
        'aria-label': 'Close Context Manager',
      }).props.onClick
      const oldEscape = tree.root.findByProps({
        'data-context-manager-drawer': '',
      }).props.onKeyDown
      let prevented = 0
      const escape = () => ({
        key: 'Escape',
        shiftKey: false,
        preventDefault() { prevented++ },
        stopPropagation() {},
      })
      await act(async () => { trigger().props.onClick() })
      assert.equal(live()?.open, false)
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      const currentEpoch = live()?.openSessionEpoch
      await act(async () => { oldBackdropClose() })
      assert.equal(live()?.open, true,
        'F01-R13C RED: obsolete backdrop callback must not close new session')
      await act(async () => { oldHeaderClose() })
      assert.equal(live()?.open, true,
        'F01-R13C: obsolete header Close must not close new session')
      await act(async () => { oldEscape(escape()) })
      assert.equal(live()?.open, true,
        'F01-R13C: obsolete Escape handler must not close new session')
      assert.equal(prevented, 0,
        'F01-R13C: obsolete Escape must not consume new session event')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-backdrop': '' }).props.onClick()
      })
      assert.equal(live()?.open, false, 'F01-R13C: fresh Backdrop close still works')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.ok(live()?.openSessionEpoch > currentEpoch)
      await act(async () => {
        tree.root.findByProps({ 'aria-label': 'Close Context Manager' }).props.onClick()
      })
      assert.equal(live()?.open, false, 'F01-R13C: fresh header Close still works')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-drawer': '' })
          .props.onKeyDown(escape())
      })
      assert.equal(live()?.open, false, 'F01-R13C: fresh Escape still closes Drawer')
      assert.equal(prevented, 1)
      assert.equal(remoteFixture.writes.length, beforeWrites)
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }


    // F01-SR4: obsolete user-requested Read callbacks may not start even a
    // READ RPC after Close->Reopen; same-key Resource reads share Model owners.
    // The remote read counters prove that the fresh current-session control
    // really runs the published Host/Client read chain, not a stubbed no-op.
    case 'R14P': {
      const oldRefresh = buttonByLabel(tree, 'Refresh').props.onClick
      const originalEpoch = live()?.openSessionEpoch
      const beforeClose = uiRefreshDispatches
      await act(async () => { trigger().props.onClick() })
      await act(async () => { oldRefresh() })
      await settleUI()
      assert.equal(uiRefreshDispatches, beforeClose,
        'F01-R14P RED: old Profile Refresh must not dispatch while Drawer is closed')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      assert.ok(live()?.openSessionEpoch > originalEpoch)
      const beforeReopen = uiRefreshDispatches
      await act(async () => { oldRefresh() })
      await settleUI()
      assert.equal(uiRefreshDispatches, beforeReopen,
        'F01-R14P: old Profile Refresh must not start baseline reconcile in a new session')
      const beforeRemote = remoteFixture.readCalls.profiles
      await act(async () => {
        buttonByLabel(tree, 'Refresh').props.onClick()
        for (let i = 0; i < 30; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(uiRefreshDispatches, beforeReopen + 1,
        'F01-R14P: a fresh current-session Profile Refresh must dispatch')
      assert.ok(remoteFixture.readCalls.profiles > beforeRemote,
        'F01-R14P: a fresh Profile Refresh must actually read Remote profiles')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }

    case 'R14R': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      assert.equal(live()?.pane, 'resources')
      const oldRefresh = buttonByLabel(tree, 'Refresh').props.onClick
      const beforeClose = uiListDispatches
      await act(async () => { trigger().props.onClick() })
      await act(async () => { oldRefresh() })
      await settleUI()
      assert.equal(uiListDispatches, beforeClose,
        'F01-R14R RED: old Resource Refresh cannot begin a keyed read while closed')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      const beforeReopen = uiListDispatches
      await act(async () => { oldRefresh() })
      await settleUI()
      assert.equal(uiListDispatches, beforeReopen,
        'F01-R14R: old Resource Refresh cannot supersede a new same-key read')
      const beforeRemote = remoteFixture.readCalls.resourceLists
      await act(async () => {
        buttonByLabel(tree, 'Refresh').props.onClick()
        for (let i = 0; i < 30; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(uiListDispatches, beforeReopen + 1,
        'F01-R14R: fresh Resource Refresh must dispatch exactly once')
      assert.ok(remoteFixture.readCalls.resourceLists > beforeRemote,
        'F01-R14R: fresh Resource Refresh must reach the real Remote list')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }

    case 'R14B': {
      const oldSuggestions = buttonByLabel(tree, 'Load resource suggestions').props.onClick
      const beforeClose = uiListDispatches
      await act(async () => { trigger().props.onClick() })
      await act(async () => { oldSuggestions() })
      await settleUI()
      assert.equal(uiListDispatches, beforeClose,
        'F01-R14B RED: old Binding Suggestions must not read while Drawer is closed')
      await act(async () => { trigger().props.onClick() })
      await settleUI()
      const beforeReopen = uiListDispatches
      await act(async () => { oldSuggestions() })
      await settleUI()
      assert.equal(uiListDispatches, beforeReopen,
        'F01-R14B: old Binding Suggestions cannot read after Reopen')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      const otherPane = uiListDispatches
      await act(async () => { oldSuggestions() })
      await settleUI()
      assert.equal(uiListDispatches, otherPane,
        'F01-R14B: stale Binding Suggestions cannot steal Resource Pane list owner')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick()
      })
      await settleUI()
      const beforeFresh = uiListDispatches
      const beforeRemote = remoteFixture.readCalls.resourceLists
      await act(async () => {
        buttonByLabel(tree, 'Load resource suggestions').props.onClick()
        for (let i = 0; i < 30; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(uiListDispatches, beforeFresh + 1,
        'F01-R14B: new current-session Suggestions still dispatches one read')
      assert.ok(remoteFixture.readCalls.resourceLists > beforeRemote,
        'F01-R14B: new Suggestions must reach real Remote Resource metadata')
      assert.equal(remoteFixture.writes.length, beforeWrites)
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }


    // F01-SR5: effective displayed selection may change during the SAME
    // Drawer opening while the raw Store selectedId stays null. CAS may
    // remain unchanged. Old render closures must not gain current intent.
    case 'R15R': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      assert.equal(live()?.selectedResourceId, null)
      const selectedRow = () => tree.root.findAll(node =>
        node.type === 'button' && node.props['aria-current'] === 'true'
        && /Resource/.test(renderedText(node)))[0]
      assert.ok(renderedText(selectedRow()).includes('Bravo Resource'),
        'R15R setup must initially render Bravo as effective selection')
      const oldRefresh = buttonByLabel(tree, 'Refresh').props.onClick
      const oldEpoch = live()?.openSessionEpoch
      remoteFixture.resources.set('a-resource', {
        id: 'a-resource', name: 'Alpha Resource',
        content: 'new lower-sorted resource', revision: 1,
        incarnationId: 'r15-a-resource',
      })
      await act(async () => {
        buttonByLabel(tree, 'Refresh').props.onClick()
        for (let i = 0; i < 35; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(live()?.openSessionEpoch, oldEpoch)
      assert.equal(live()?.selectedResourceId, null,
        'implicit fallback changes effective resource, not raw selection')
      assert.ok(renderedText(selectedRow()).includes('Alpha Resource'),
        'R15R new list must display Alpha in same opening')
      const before = uiListDispatches
      const beforeRemote = remoteFixture.readCalls.resourceLists
      await act(async () => { oldRefresh() })
      await settleUI()
      assert.equal(uiListDispatches, before,
        'R15R RED: obsolete Bravo Refresh must not issue a new keyed Client list read')
      assert.equal(remoteFixture.readCalls.resourceLists, beforeRemote,
        'R15R stale closure cannot reach the actual Remote list')
      await act(async () => {
        buttonByLabel(tree, 'Refresh').props.onClick()
        for (let i = 0; i < 35; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(uiListDispatches, before + 1)
      assert.ok(remoteFixture.readCalls.resourceLists > beforeRemote)
      assert.equal(remoteFixture.writes.length, beforeWrites)
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }

    case 'R15B': {
      assert.equal(live()?.selectedProfileId, null)
      const selectedHeading = () => tree.root.findAll(node =>
        node.type === 'h3' && (renderedText(node) === 'Main'
          || renderedText(node) === 'Beta Profile'))[0]
      assert.equal(renderedText(selectedHeading()), 'Main')
      const oldSuggestions = buttonByLabel(tree, 'Load resource suggestions').props.onClick
      const originalEpoch = live()?.openSessionEpoch
      remoteFixture.externalSetDefault('beta')
      await act(async () => {
        buttonByLabel(tree, 'Refresh').props.onClick()
        for (let i = 0; i < 35; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(live()?.openSessionEpoch, originalEpoch)
      assert.equal(live()?.selectedProfileId, null)
      assert.equal(renderedText(selectedHeading()), 'Beta Profile',
        'R15B must actually replace default displayed Profile with unchanged raw null')
      const before = uiListDispatches
      const reads = remoteFixture.readCalls.resourceLists
      await act(async () => { oldSuggestions() })
      await settleUI()
      assert.equal(uiListDispatches, before,
        'R15B RED: obsolete Main Suggestions must not claim new Beta Resource read')
      assert.equal(remoteFixture.readCalls.resourceLists, reads)
      await act(async () => {
        buttonByLabel(tree, 'Load resource suggestions').props.onClick()
        for (let i = 0; i < 35; i++) await Promise.resolve()
      })
      await settleUI()
      assert.equal(uiListDispatches, before + 1)
      assert.ok(remoteFixture.readCalls.resourceLists > reads)
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R15Begin': {
      const oldCreate = tree.root.findByProps({
        'data-context-manager-new-binding': '',
      }).props.onClick
      const oldEdit = tree.root.findByProps({
        'data-context-manager-binding-edit-resourceId': 'legacy',
      }).props.onClick
      const oldDelete = tree.root.findByProps({
        'data-context-manager-binding-delete': 'legacy',
      }).props.onClick
      const epoch = live()?.openSessionEpoch
      const beforeToken = live()?.nextDraftToken
      const beta = tree.root.findAll(node => node.type === 'button'
        && renderedText(node).includes('Beta Profile'))[0]
      assert.ok(beta, 'R15Begin requires a second selectable Profile')
      await act(async () => { beta.props.onClick() })
      await settleUI()
      assert.equal(live()?.openSessionEpoch, epoch)
      assert.equal(live()?.selectedProfileId, 'beta')
      for (const [kind, oldEvent] of [
        ['create', oldCreate], ['edit', oldEdit], ['delete', oldDelete],
      ]) {
        await act(async () => { oldEvent() })
        assert.equal(live()?.draft, null,
          'R15Begin RED: old Main ' + kind + ' must not create a Beta-session draft')
        assert.equal(live()?.selectedProfileId, 'beta',
          'R15Begin: old Main ' + kind + ' must not select Main again')
        assert.equal(live()?.nextDraftToken, beforeToken)
      }
      for (const [kind, attr] of [
        ['create', 'data-context-manager-new-binding'],
        ['edit', 'data-context-manager-binding-edit-resourceId'],
        ['delete', 'data-context-manager-binding-delete'],
      ]) {
        const node = tree.root.findByProps({ [attr]: kind === 'create' ? '' : 'legacy' })
        await act(async () => { node.props.onClick() })
        assert.equal(live()?.draft?.profileId, 'beta',
          'R15Begin: fresh Beta ' + kind + ' must create a Beta-owned draft')
        await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
        assert.equal(live()?.draft, null)
      }
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R15PBegin': {
      const oldEdit = buttonByLabel(tree, 'Edit').props.onClick
      const oldDelete = buttonByLabel(tree, 'Delete profile').props.onClick
      const beta = tree.root.findAll(node => node.type === 'button'
        && renderedText(node).includes('Beta Profile'))[0]
      assert.ok(beta)
      const epoch = live()?.openSessionEpoch
      await act(async () => { beta.props.onClick() })
      await settleUI()
      assert.equal(live()?.selectedProfileId, 'beta')
      assert.equal(live()?.openSessionEpoch, epoch)
      for (const [kind, oldHandler] of [
        ['edit', oldEdit], ['delete', oldDelete],
      ]) {
        await act(async () => { oldHandler() })
        assert.equal(live()?.draft, null,
          'R15PBegin RED: old Main ' + kind + ' must not enter Main editing')
        assert.equal(live()?.selectedProfileId, 'beta')
      }
      await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
      assert.equal(live()?.draft?.profileId, 'beta')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      await act(async () => { buttonByLabel(tree, 'Delete profile').props.onClick() })
      assert.equal(live()?.draft?.profileId, 'beta')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    case 'R15RBegin': {
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
      })
      await settleUI()
      const first = tree.root.findAll(node => node.type === 'button'
        && node.props['aria-current'] === 'true'
        && renderedText(node).includes('Alpha Resource'))
      assert.equal(first.length, 1)
      const oldEdit = buttonByLabel(tree, 'Edit').props.onClick
      const oldDelete = buttonByLabel(tree, 'Delete resource').props.onClick
      const beta = tree.root.findAll(node => node.type === 'button'
        && renderedText(node).includes('Bravo Resource'))[0]
      assert.ok(beta)
      const epoch = live()?.openSessionEpoch
      await act(async () => { beta.props.onClick() })
      await settleUI()
      assert.equal(live()?.selectedResourceId, 'b-resource')
      assert.equal(live()?.openSessionEpoch, epoch)
      for (const [kind, handler] of [
        ['edit', oldEdit], ['delete', oldDelete],
      ]) {
        await act(async () => { handler() })
        assert.equal(live()?.resourceDraft, null,
          'R15RBegin RED: old Alpha ' + kind + ' must not start an Alpha draft')
        assert.equal(live()?.selectedResourceId, 'b-resource')
      }
      await act(async () => { buttonByLabel(tree, 'Edit').props.onClick() })
      assert.equal(live()?.resourceDraft?.stamp?.resourceId,
        'b-resource', 'R15RBegin: fresh Bravo Edit must start a Bravo-stamped draft')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      await act(async () => { buttonByLabel(tree, 'Delete resource').props.onClick() })
      assert.equal(live()?.resourceDraft?.resourceId, 'b-resource')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      assert.equal(remoteFixture.resourceWrites.length, 0)
      break
    }

    case 'R15SBegin': {
      const oldSkill = tree.root.findByProps({
        'data-context-manager-skill-new': '',
      }).props.onClick
      const beta = tree.root.findAll(node => node.type === 'button'
        && renderedText(node).includes('Beta Profile'))[0]
      assert.ok(beta)
      await act(async () => { beta.props.onClick() })
      await settleUI()
      assert.equal(live()?.selectedProfileId, 'beta')
      await act(async () => { oldSkill() })
      assert.equal(live()?.draft, null,
        'R15SBegin: existing Skill Begin effective-selection fence rejects Main')
      await act(async () => {
        tree.root.findByProps({ 'data-context-manager-skill-new': '' }).props.onClick()
      })
      assert.equal(live()?.draft?.profileId, 'beta')
      await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
      assert.equal(remoteFixture.writes.length, beforeWrites)
      break
    }

    default:
      throw new Error('Unknown B1-3 real Renderer probe: ' + probe)
  }

  assert.equal(remoteFixture.resourceWrites.length, probe === 'R11TR' ? 1 : 0,
    'M8B Skill interactions must never dispatch a Resource RPC; R11TR deliberately creates one Resource Unknown receipt')
  await act(async () => { tree.unmount() })
  disposeRoot()
  await disposePlugin()
  assert.equal(registeredOverlayStore.readLiveSnapshot(), undefined)
  await sessionFiber.dispose()
  await rendererFiber.dispose()
} else {

// M8A2 executable RED in the ACTUAL published DSH React Renderer:
// the selected usable Profile must expose its PromptBindings section.
// This is intentionally absent until the M8A2 production implementation.
assert.equal(
  tree.root.findAllByProps({ 'data-context-manager-prompt-bindings': '' }).length,
  1,
  'M8A2 RED: Profile PromptBindings editor is not yet mounted',
)

// M8B B1-2a real published Renderer control: capture live, enabled React
// Begin callbacks while open, then invoke them *after* the Drawer is closed,
// in the same act() batch before the old mounted tree has rerendered.
// They must not create a hidden draft, consume a token or dispatch an RPC.
const b1OldProfileBegin = tree.root.findByProps({
  'data-context-manager-new-profile': '',
}).props.onClick
const b1OldBindingBegin = tree.root.findByProps({
  'data-context-manager-new-binding': '',
}).props.onClick
const b1ProfileCallsBefore = remoteFixture.writes.length
const b1ResourceCallsBefore = remoteFixture.resourceWrites.length
const b1TokenBefore = registeredOverlayStore.readLiveSnapshot()?.nextDraftToken
await act(async () => {
  trigger().props.onClick()
  b1OldProfileBegin()
  b1OldBindingBegin()
})
await settleUI()
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, false)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null,
  'B1-2a: retained Profile/Binding Begin must create no hidden closed draft')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.nextDraftToken, b1TokenBefore)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.notice, null,
  'B1-2a: stale closed Begin may not inject a phantom Draft Active notice')
assert.equal(remoteFixture.writes.length, b1ProfileCallsBefore,
  'B1-2a: no Profile RPC after closed Begin callback')
assert.equal(remoteFixture.resourceWrites.length, b1ResourceCallsBefore,
  'B1-2a: no Resource RPC after closed Profile/Binding Begin')
await act(async () => { trigger().props.onClick() })
await settleUI()
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, true)

// Resource's real tab initializes its read-only list asynchronously, so
// require a truly enabled Create handler before retaining it across Close.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
})
await settleUI()
const b1ResourceStart = tree.root.findByProps({ 'data-context-manager-new-resource': '' })
assert.equal(b1ResourceStart.props.disabled, false,
  'B1-2a: genuine published Resource Begin must be enabled before this race test')
const b1OldResourceBegin = b1ResourceStart.props.onClick
const b1ResourceTokenBefore = registeredOverlayStore.readLiveSnapshot()?.nextResourceDraftToken
const b1ResourceWritesBefore = remoteFixture.resourceWrites.length
await act(async () => {
  trigger().props.onClick()
  b1OldResourceBegin()
})
await settleUI()
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, false)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null,
  'B1-2a: retained Resource Begin must create no hidden closed draft')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.nextResourceDraftToken, b1ResourceTokenBefore)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceNotice, null,
  'B1-2a: stale closed Resource Begin may not leave a phantom notice')
assert.equal(remoteFixture.resourceWrites.length, b1ResourceWritesBefore)
await act(async () => { trigger().props.onClick() })
await settleUI()
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick()
})
await settleUI()
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, true)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.pane, 'profiles')
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
const sameFrameProfileCancel = buttonByLabel(tree, 'Cancel').props.onClick
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  sameFrameProfileCancel()
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
// A malformed Profile has no normal field editor but remains explicitly
// deletable via its original diagnostic row (no synthetic usable Profile).
await act(async () => { buttonByLabel(tree, 'Delete profile').props.onClick() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.kind, 'confirm-delete',
  'M8A2 Fix4: invalid Profile diagnostic must still permit an explicit Delete draft')
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null)

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
const legacyUnknownReceipt = registeredOverlayStore.readLiveSnapshot()?.notice
assert.equal(legacyUnknownReceipt?.code, 'noticeOutcomeUnknown')
assert.ok(legacyUnknownReceipt?.detail?.includes('simulated lost reply'))
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
})
assert.deepEqual(registeredOverlayStore.readLiveSnapshot()?.notice, legacyUnknownReceipt,
  'legacy M7C Unknown receipt survives forbidden pane switch with exact detail')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.blocked, 'unknown')
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
const legacyConflictReceipt = registeredOverlayStore.readLiveSnapshot()?.notice
assert.equal(legacyConflictReceipt?.code, 'noticeConflict')
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
})
assert.deepEqual(registeredOverlayStore.readLiveSnapshot()?.notice, legacyConflictReceipt,
  'legacy M7C Conflict receipt survives forbidden pane switch')
await act(async () => { buttonByLabel(tree, 'Discard draft').props.onClick() })

// M8A1: the same retained DSH Renderer opens the Resource library inside
// the existing Drawer, without moving Profile drafts into the Resource lane.
const obsoleteProfileBeginFromPreviousPane = tree.root.findByProps({
  'data-context-manager-new-profile': '',
}).props.onClick
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
await act(async () => { obsoleteProfileBeginFromPreviousPane() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null,
  'M8A2 Fix3: old Profile Begin cannot occupy Store while Resource draft owns pane')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft?.kind, 'create')
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-create-id' }).props.onChange({ currentTarget: { value: 'res-ui' } })
  tree.root.findByProps({ id: 'cm-resource-create-name' }).props.onChange({ currentTarget: { value: 'New Resource' } })
  tree.root.findByProps({ id: 'cm-resource-create-content' }).props.onChange({ currentTarget: { value: 'Line 1\nLine 2\n' } })
})
assert.equal(remoteFixture.resourceWrites.length, 0)
// Two rapid form submits from the same render must not issue two writes or
// publish an obsolete busy result that overwrites the successful outcome.
const sameFrameResourceCancel = buttonByLabel(tree, 'Cancel').props.onClick
await act(async () => {
  const form = tree.root.findAllByType('form')[0]
  form.props.onSubmit({ preventDefault() {} })
  form.props.onSubmit({ preventDefault() {} })
  // Old Cancel from this render must not destroy the now-submitting draft.
  sameFrameResourceCancel()
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
const uncertainResourceReceipt = registeredOverlayStore.readLiveSnapshot()?.resourceNotice
assert.equal(uncertainResourceReceipt?.code, 'resourceNoticeUnknown')
assert.ok(uncertainResourceReceipt?.detail?.includes('response was dropped'))
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick() })
assert.deepEqual(registeredOverlayStore.readLiveSnapshot()?.resourceNotice, uncertainResourceReceipt,
  'M8A2 Fix4: a blocked Resource tab-switch cannot replace the exact Unknown receipt')
assert.equal(tree.root.findAllByProps({ 'data-context-manager-resource-editor': '' }).length, 1)
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
assert.equal(tree.root.findAllByProps({ 'data-context-manager-resource-editor': '' }).length, 1)
assert.equal(buttonByLabel(tree, 'Save').props.disabled, true)
assert.equal(remoteFixture.resourceWrites.length, beforeUnknown + 1)
assert.deepEqual(registeredOverlayStore.readLiveSnapshot()?.resourceNotice, uncertainResourceReceipt)
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

// M8A2 Fix4 GREEN: stale rendered Resource Edit/Delete callbacks must not
// pair a previous List/Document with a newly captured valid Stamp.
const staleResourceEdit = buttonByLabel(tree, 'Edit').props.onClick
const staleResourceDelete = buttonByLabel(tree, 'Delete resource').props.onClick
remoteFixture.externalResourceReplacement('res-ui', 'External new incarnation')
await act(async () => {
  await injectedBusiness?.()?.refresh()
  await injectedBusiness?.()?.loadPromptResourceList()
  await injectedBusiness?.()?.loadPromptResource('res-ui')
})
await settleUI()
const beforeOldResourceBegin = remoteFixture.resourceWrites.length
await act(async () => { staleResourceEdit() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null,
  'M8A2 Fix4 GREEN: old Resource Edit must not pair stale document with new incarnation Stamp')
await act(async () => { staleResourceDelete() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null,
  'M8A2 Fix4 GREEN: old Resource Delete must not delete a replaced incarnation')
assert.equal(remoteFixture.resourceWrites.length, beforeOldResourceBegin)
assert.equal(remoteFixture.resources.get('res-ui').name, 'External new incarnation')

// A revision-only change (same incarnation) also makes the old Edit invalid.
const staleResourceRevisionEdit = buttonByLabel(tree, 'Edit').props.onClick
remoteFixture.externalResourceRevision('res-ui', 'Another writer changed name')
await act(async () => {
  await injectedBusiness?.()?.refresh()
  await injectedBusiness?.()?.loadPromptResourceList()
  await injectedBusiness?.()?.loadPromptResource('res-ui')
})
await settleUI()
await act(async () => { staleResourceRevisionEdit() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null,
  'M8A2 Fix4 GREEN: old Resource Edit must not pair stale document with latest revision')

// By contrast, fresh reads of the SAME version may replace JS object identity.
const sameVersionResourceEdit = buttonByLabel(tree, 'Edit').props.onClick
await act(async () => {
  await injectedBusiness?.()?.loadPromptResourceList()
  await injectedBusiness?.()?.loadPromptResource('res-ui')
})
await settleUI()
await act(async () => { sameVersionResourceEdit() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft?.kind, 'edit',
  'same-version rehydration should not reject the original Resource Edit')
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })

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

// M8A2 Fix3 GREEN: Resource Controller has an independent authority, but an
// obsolete Resource form closure must NOT write after Binding draft takeover.
await act(async () => { tree.root.findByProps({ 'data-context-manager-new-resource': '' }).props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-create-id' }).props.onChange({
    currentTarget: { value: 'obsolete-resource-after-tab-switch' },
  })
  tree.root.findByProps({ id: 'cm-resource-create-name' }).props.onChange({
    currentTarget: { value: 'should never be written' },
  })
})
const obsoleteResourceSubmit = tree.root.findAllByType('form')[0].props.onSubmit
const obsoleteResourceBeginFromPreviousPane = tree.root.findByProps({
  'data-context-manager-new-resource': '',
}).props.onClick
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })
await act(async () => { tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick() })
await settleUI()
await act(async () => { tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick() })
await act(async () => { obsoleteResourceBeginFromPreviousPane() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null,
  'M8A2 Fix3: old Resource Begin cannot occupy Store while Binding draft owns pane')
const beforeObsoleteResourceSave = remoteFixture.resourceWrites.length
await act(async () => {
  obsoleteResourceSubmit({ preventDefault() {} })
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, beforeObsoleteResourceSave,
  'M8A2 Fix3 GREEN: old Resource Save cannot write while a Binding draft owns the Store')
assert.equal(remoteFixture.resources.has('obsolete-resource-after-tab-switch'), false)
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })


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
  assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.kind, 'prompt-binding-create',
    'the store must publish the new draft before React rerenders')
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
const sameFrameBindingCancel = buttonByLabel(tree, 'Cancel').props.onClick
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-create-form': '' }).props.onSubmit({ preventDefault() {} })
  sameFrameBindingCancel()
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
const obsoletePreSubmitCancel = buttonByLabel(tree, 'Cancel').props.onClick
// Start an unresolved UI-only refresh request before the uncertain write;
// its rejected completion must not overwrite the later terminal outcome.
delayNextUiRefresh = true
await act(async () => { buttonByLabel(tree, 'Refresh').props.onClick() })
assert.equal(typeof rejectDelayedUiRefresh, 'function')
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
await act(async () => { obsoletePreSubmitCancel() })
assert.ok(renderedText(tree.root).includes('write outcome is unknown'),
  'old pre-submit Cancel must not discard a same-token terminal Unknown')
await act(async () => {
  rejectDelayedUiRefresh(new Error('late Profile refresh failure'))
  for (let i = 0; i < 15; i += 1) await Promise.resolve()
})
await settleUI()
assert.ok(renderedText(tree.root).includes('write outcome is unknown'),
  'a late rejected UI refresh cannot relabel an uncertain Binding write')
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

// M7C compatibility: a normal Profile refresh transport error is still
// severity=error / role=alert; terminal Binding receipts are protected
// separately and do not require downgrading ordinary refresh errors.
delayNextUiRefresh = true
rejectDelayedUiRefresh = undefined
await act(async () => { buttonByLabel(tree, 'Refresh').props.onClick() })
assert.equal(typeof rejectDelayedUiRefresh, 'function')
await act(async () => {
  rejectDelayedUiRefresh(new Error('ordinary Profile refresh transport failure'))
  for (let i = 0; i < 15; i += 1) await Promise.resolve()
})
await settleUI()
assert.ok(tree.root.findAll(node =>
  node.type === 'div' && node.props.role === 'alert'
  && renderedText(node).includes('Refresh request failed.')
).length > 0, 'M7C refresh transport error must retain error/alert severity')

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

// A Resource-only Authority rotation WHILE a Binding draft holds its
// immutable Profile basis must not invalidate a Profile write or rebase it.
const beforeSourceRotation = injectedBusiness?.()?.hooks.contextManager.getSnapshot()
const profileRevisionBefore = beforeSourceRotation?.profiles.data?.persistence.revision
const beforeResourceIndependentWrite = remoteFixture.writes.length
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-order': 'dangling' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-edit-order' }).props.onChange({
    currentTarget: { value: '-7' },
  })
})
const heldBindingDraft = registeredOverlayStore.readLiveSnapshot()?.draft
assert.equal(heldBindingDraft?.kind, 'prompt-binding-edit-field')
const heldBindingBasis = structuredClone(heldBindingDraft.basis)
assert.equal(heldBindingBasis.revision, profileRevisionBefore)
remoteFixture.externalRotateResourceAuthority()
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const afterSourceRotation = injectedBusiness?.()?.hooks.contextManager.getSnapshot()
assert.notEqual(afterSourceRotation.changes.resourceAuthorityId,
  beforeSourceRotation.changes.resourceAuthorityId)
assert.equal(afterSourceRotation.profiles.data.persistence.revision, profileRevisionBefore)
assert.equal(afterSourceRotation.profiles.stale, false)
assert.deepEqual(registeredOverlayStore.readLiveSnapshot()?.draft?.basis, heldBindingBasis)
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-edit-form': '' })
    .props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 30; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, beforeResourceIndependentWrite + 1)
assert.deepEqual(remoteFixture.writes.at(-1).basis, heldBindingBasis)
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

// M8A2 Fix4 GREEN: M7C old Edit/Delete/Default callbacks must not pair
// old rendered Profile/default intent with a new Settings revision.
const staleProfileEdit = buttonByLabel(tree, 'Edit', 0).props.onClick
const staleProfileDelete = buttonByLabel(tree, 'Delete profile').props.onClick
const staleDefaultToggle = buttonByLabel(tree, 'Set as default').props.onClick
remoteFixture.externalRename('main', 'External writer changed visible Profile')
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const beforeOldProfileBegin = remoteFixture.writes.length
await act(async () => { staleProfileEdit() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null,
  'M8A2 Fix4 GREEN: old M7C Edit may not reuse the latest Settings Basis')
await act(async () => { staleProfileDelete() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null,
  'M8A2 Fix4 GREEN: old M7C Delete may not reuse the latest Settings Basis')
assert.equal(remoteFixture.writes.length, beforeOldProfileBegin)
remoteFixture.externalSetDefault('external-default')
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
await act(async () => {
  staleDefaultToggle()
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
assert.equal(remoteFixture.writes.length, beforeOldProfileBegin,
  'M8A2 Fix4 GREEN: old Default toggle must issue zero Profile writes')
assert.equal(remoteFixture.getDefault(), 'external-default')

// Fix5 RED: a historical Profile whose Settings path key is __proto__ is
// readable but cannot enter an Edit/Delete flow that Host will always reject.
// Ordinary special keys such as constructor remain valid authoring targets.
for (const id of ['__proto__', 'constructor']) {
  Object.defineProperty(remoteFixture.profiles, id, {
    value: { name: 'Special profile ' + id, basePreset: 'native', skills: {}, prompts: {} },
    enumerable: true, configurable: true, writable: true,
  })
}
await act(async () => { await injectedBusiness?.()?.refresh() })
await settleUI()
const unsafeProfileRow = tree.root.findAll(node =>
  node.type === 'button' && Object.hasOwn(node.props, 'aria-current')
  && renderedText(node).includes('__proto__')
)[0]
assert.ok(unsafeProfileRow, 'historical __proto__ Profile remains readable')
await act(async () => { unsafeProfileRow.props.onClick() })
await settleUI()
const unsafeProfileEdit = buttonByLabel(tree, 'Edit', 0)
const unsafeProfileDelete = buttonByLabel(tree, 'Delete profile')
assert.equal(unsafeProfileEdit.props.disabled, true,
  'Host-unsafe Profile ID must have no editable field action')
assert.equal(unsafeProfileDelete.props.disabled, true,
  'Host-unsafe Profile ID must have no structural Delete action')
const priorUnsafeWrites = remoteFixture.writes.length
await act(async () => {
  unsafeProfileEdit.props.onClick()
  unsafeProfileDelete.props.onClick()
})
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null,
  'a retained disabled unsafe Profile handler must not create a draft')
assert.equal(remoteFixture.writes.length, priorUnsafeWrites)
const safeSpecialProfileRow = tree.root.findAll(node =>
  node.type === 'button' && Object.hasOwn(node.props, 'aria-current')
  && renderedText(node).includes('constructor')
)[0]
assert.ok(safeSpecialProfileRow)
await act(async () => { safeSpecialProfileRow.props.onClick() })
await settleUI()
assert.equal(buttonByLabel(tree, 'Delete profile').props.disabled, false,
  'constructor is a valid Profile path key and must not be overblocked')
await act(async () => { buttonByLabel(tree, 'Delete profile').props.onClick() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.kind, 'confirm-delete')
await act(async () => { buttonByLabel(tree, 'Cancel').props.onClick() })

// M8B B1-2b independent REAL published Renderer behavioral RED:
// A Save handler captured during a previous Drawer open session must not
// authorize a write after Close -> Reopen, even when the same Profile draft
// and original Settings Basis are deliberately retained. A new visible
// handler from the reopened session may still commit the preserved draft.
// This intentionally exercises existing M7C UI, before Skill UI exists.
await act(async () => { buttonByLabel(tree, 'Edit', 0).props.onClick() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.kind, 'edit-field')
await act(async () => {
  tree.root.findByProps({ id: 'cm-edit-name' }).props.onChange({
    currentTarget: { value: 'Fresh reopened edit' },
  })
})
const b12bOldSessionSave = tree.root.findAllByType('form')[0].props.onSubmit
const b12bOriginalToken = registeredOverlayStore.readLiveSnapshot()?.draft?.token
const b12bOriginalBasis = registeredOverlayStore.readLiveSnapshot()?.draft?.basis
const b12bWritesBefore = remoteFixture.writes.length
await act(async () => { trigger().props.onClick() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, false)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.token, b12bOriginalToken,
  'B1-2b control: Close preserves the active Profile draft')
await act(async () => { trigger().props.onClick() })
await settleUI()
assert.equal(registeredOverlayStore.readLiveSnapshot()?.open, true)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.token, b12bOriginalToken)
assert.deepEqual(registeredOverlayStore.readLiveSnapshot()?.draft?.basis, b12bOriginalBasis,
  'B1-2b control: Reopen does not recapture Settings revision')
await act(async () => {
  b12bOldSessionSave({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
assert.equal(remoteFixture.writes.length, b12bWritesBefore,
  'B1-2b RED: pre-Close Save callback must not write through reopened session')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft?.token, b12bOriginalToken,
  'B1-2b RED: obsolete Save cannot consume the preserved draft')
// Positive continuation is executed once a later GREEN blocks the stale Save:
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, b12bWritesBefore + 1,
  'B1-2b control: a freshly rendered reopened Save may commit once')
assert.equal(remoteFixture.writes.at(-1)?.kind, 'name')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null)

// M8B F01-SR1 regression: a pre-Close Profile Begin and immediate default
// handler must not act after Reopen, even though Settings is unchanged.
const f01OldProfileBegin = tree.root.findByProps({
  'data-context-manager-new-profile': '',
}).props.onClick
const f01OldDefault = buttonByLabel(tree, 'Set as default').props.onClick
const f01ProfileTokenBefore = registeredOverlayStore.readLiveSnapshot()?.nextDraftToken
const f01ProfileWritesBefore = remoteFixture.writes.length
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
await settleUI()
await act(async () => {
  f01OldProfileBegin()
  f01OldDefault()
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null,
  'F01-SR1: old Profile Begin must not occupy a reopened Drawer')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.nextDraftToken, f01ProfileTokenBefore)
assert.equal(remoteFixture.writes.length, f01ProfileWritesBefore,
  'F01-SR1: old immediate default callback must issue zero Profile RPCs')

// M8A2 Profile PromptBinding Save shares the same opening-session safety as
// M7C Profile, but still permits the fresh reopened handler to Save once.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-new-binding': '' }).props.onClick()
})
await act(async () => {
  tree.root.findByProps({ id: 'cm-binding-create-id' }).props.onChange({
    currentTarget: { value: 'f01-reopen-binding' },
  })
  tree.root.findByProps({ id: 'cm-binding-create-resource' }).props.onChange({
    currentTarget: { value: 'not-a-required-resource' },
  })
})
const f01BindingDraft = registeredOverlayStore.readLiveSnapshot()?.draft
assert.equal(f01BindingDraft?.kind, 'prompt-binding-create')
const f01OldBindingSave = tree.root.findByProps({
  'data-context-manager-binding-create-form': '',
}).props.onSubmit
const f01BindingWritesBefore = remoteFixture.writes.length
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
await settleUI()
assert.strictEqual(registeredOverlayStore.readLiveSnapshot()?.draft, f01BindingDraft,
  'F01-SR1: Binding Token and original Basis must survive Close/Reopen')
await act(async () => {
  f01OldBindingSave({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
assert.equal(remoteFixture.writes.length, f01BindingWritesBefore,
  'F01-SR1: an obsolete Binding Save cannot reuse the retained Profile draft')
assert.strictEqual(registeredOverlayStore.readLiveSnapshot()?.draft, f01BindingDraft)
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-binding-create-form': '' })
    .props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.writes.length, f01BindingWritesBefore + 1)
assert.equal(remoteFixture.writes.at(-1)?.kind, 'binding-add')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null)

// Resource Controller retains its independent authority and Stamp. The
// old Resource form callback must not submit across a Drawer reopen either.
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'resources' }).props.onClick()
})
await settleUI()
const f01ResourceStart = tree.root.findByProps({ 'data-context-manager-new-resource': '' })
assert.equal(f01ResourceStart.props.disabled, false,
  'F01-SR1 control: real Resource Create must be available in reopened Drawer')
await act(async () => { f01ResourceStart.props.onClick() })
await act(async () => {
  tree.root.findByProps({ id: 'cm-resource-create-id' }).props.onChange({
    currentTarget: { value: 'f01-reopen-resource' },
  })
  tree.root.findByProps({ id: 'cm-resource-create-name' }).props.onChange({
    currentTarget: { value: 'F01 retained Resource' },
  })
  tree.root.findByProps({ id: 'cm-resource-create-content' }).props.onChange({
    currentTarget: { value: 'exact\\ncontent' },
  })
})
const f01ResourceDraft = registeredOverlayStore.readLiveSnapshot()?.resourceDraft
assert.equal(f01ResourceDraft?.kind, 'create')
const f01OldResourceSave = tree.root.findAllByType('form')[0].props.onSubmit
const f01ResourceWritesBefore = remoteFixture.resourceWrites.length
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
await settleUI()
assert.strictEqual(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, f01ResourceDraft)
await act(async () => {
  f01OldResourceSave({ preventDefault() {} })
  for (let i = 0; i < 20; i += 1) await Promise.resolve()
})
assert.equal(remoteFixture.resourceWrites.length, f01ResourceWritesBefore,
  'F01-SR1: obsolete Resource Save cannot write after a new open session')
await act(async () => {
  tree.root.findAllByType('form')[0].props.onSubmit({ preventDefault() {} })
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
})
await settleUI()
assert.equal(remoteFixture.resourceWrites.length, f01ResourceWritesBefore + 1)
assert.equal(remoteFixture.resourceWrites.at(-1)?.kind, 'resource-create')
assert.equal(remoteFixture.resources.get('f01-reopen-resource')?.content, 'exact\\ncontent')
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null)

const f01OldResourceBegin = tree.root.findByProps({
  'data-context-manager-new-resource': '',
}).props.onClick
const f01ResourceTokenBefore = registeredOverlayStore.readLiveSnapshot()?.nextResourceDraftToken
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
await settleUI()
await act(async () => { f01OldResourceBegin() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.resourceDraft, null)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.nextResourceDraftToken, f01ResourceTokenBefore,
  'F01-SR1: old Resource Begin is not authorized by a later Drawer session')
await act(async () => {
  tree.root.findByProps({ 'data-context-manager-tab': 'profiles' }).props.onClick()
})
await settleUI()
const f01OldBindingBegin = tree.root.findByProps({
  'data-context-manager-new-binding': '',
}).props.onClick
const f01BindingTokenBefore = registeredOverlayStore.readLiveSnapshot()?.nextDraftToken
await act(async () => { trigger().props.onClick() })
await act(async () => { trigger().props.onClick() })
await settleUI()
await act(async () => { f01OldBindingBegin() })
assert.equal(registeredOverlayStore.readLiveSnapshot()?.draft, null)
assert.equal(registeredOverlayStore.readLiveSnapshot()?.nextDraftToken, f01BindingTokenBefore,
  'F01-SR1: old Binding Begin cannot start a draft after Reopen')

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
assert.equal(registeredOverlayStore.readLiveSnapshot(), undefined,
  'M8A2 live Store reader must be revoked on plugin disposal')
await sessionFiber.dispose()
await rendererFiber.dispose()
}
