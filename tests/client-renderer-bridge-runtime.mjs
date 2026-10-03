import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as Cordis from '@deepseek-ai/cordis'
import * as ClientStore from '@deepseek-ai/dsh-client-store'
import * as ClientSlots from '@deepseek-ai/dsh-client-ui-slots'
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import TestRenderer from 'react-test-renderer'

const { Context } = Cordis
const { SlotCore } = ClientSlots

const { act } = TestRenderer

async function loadRendererClientPlugin() {
  let registration
  const rendererPath = fileURLToPath(
    import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/client'),
  )
  const source = await readFile(rendererPath, 'utf8')
  const loaderWindow = {
    __ModuleLoader__: {
      load(value) { registration = value },
    },
  }
  new Function('window', source)(loaderWindow)

  assert.ok(registration)
  assert.equal(registration.id, '@deepseek-ai/dsh-client-ui-renderer')

  const externals = new Map([
    ['react', React],
    ['react/jsx-runtime', ReactJsxRuntime],
    ['react-dom', ReactDOM],
    ['react-dom/client', ReactDOMClient],
    ['@deepseek-ai/cordis', Cordis],
    ['@deepseek-ai/dsh-client-store', ClientStore],
    ['@deepseek-ai/dsh-client-ui-slots', ClientSlots],
  ])

  return registration.factory((specifier) => {
    const resolved = externals.get(specifier)
    if (resolved === undefined) {
      throw new Error(
        `unexpected retained ui-renderer module-table request: ${specifier}`,
      )
    }
    return resolved
  })
}

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children } }
    },
  }
}

function contextManagerRemoteFace() {
  const change = Object.freeze({
    instanceId: 'renderer-bridge-host',
    generation: 1,
    profiles: 1,
    promptResources: 0,
    presets: 1,
    runtime: 1,
  })
  return {
    async protocol() { return { ok: true, value: { apiVersion: 2 } } },
    async changes() { return { ok: true, value: change } },
    async profiles() {
      return {
        ok: true,
        value: {
          schemaVersion: 1,
          schemaCompatible: true,
          profiles: {},
          diagnostics: [],
          persistence: {
            available: true,
            registered: true,
            writable: true,
            revision: 1,
          },
        },
      }
    },
    async presets() {
      return {
        ok: true,
        value: {
          directory: { status: 'unavailable' },
          profiles: {},
        },
      }
    },
    async promptPlacement() {
      return {
        ok: true,
        value: { status: 'unavailable' },
      }
    },
  }
}

function pluginCapableContext(base) {
  const ctx = { ...base }
  ctx.plugin = (definition) => {
    assert.deepEqual(definition.inject, ['remote', 'remote.contextManager'])
    let disposer
    const startup = Promise.resolve().then(async () => {
      disposer = await definition.apply(ctx)
    })
    return {
      then(resolve, reject) {
        return startup.then(
          () => resolve === undefined ? undefined : resolve(undefined),
          reject,
        )
      },
      async dispose() {
        await startup
        const current = disposer
        disposer = undefined
        await current?.()
      },
    }
  }
  return ctx
}

function createSlotsFace(core) {
  return {
    inject(name, factory) {
      let active
      let activeEpoch = -1
      const reconcile = () => {
        const spec = core.specDynamic(name)
        const epoch = core.declarationEpoch(name)
        if (active !== undefined && activeEpoch === epoch) return
        const previous = active
        active = undefined
        activeEpoch = -1
        previous?.()
        if (spec === undefined) return
        active = factory()
        activeEpoch = epoch
      }
      const unsubscribe = core.subscribeDeclaration(name, reconcile)
      reconcile()
      return () => {
        unsubscribe()
        const previous = active
        active = undefined
        activeEpoch = -1
        previous?.()
      }
    },
    register(options, component) {
      return core.register(options, component)
    },
  }
}

function createLocale() {
  const dictionaries = new Map()
  return {
    register(namespace, values) {
      dictionaries.set(namespace, values)
      return () => { dictionaries.delete(namespace) }
    },
    bind(namespace) {
      return key => dictionaries.get(namespace)?.en?.[key] ?? key
    },
  }
}

async function settleBusinessState(face) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const snapshot = face.hooks.contextManager.getSnapshot()
    if (snapshot.sync.status !== 'syncing') return snapshot
    await Promise.resolve()
  }
  throw new Error('Context Manager Client model did not settle')
}

let registration
const previousWindow = globalThis.window
globalThis.window = {
  __ModuleLoader__: {
    load(value) { registration = value },
  },
}
try {
  const source = await readFile(path.resolve('lib/client.js'), 'utf8')
  new Function('window', source)(globalThis.window)
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}
assert.ok(registration)

const plugin = registration.factory((specifier) => {
  assert.equal(specifier, 'react')
  return fakeReact()
})

const extractionCore = new SlotCore()
const disposeExtractionRoot = extractionCore.register({
  name: 'root',
  children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  },
}, () => null)

const remote = {
  contextManager: contextManagerRemoteFace(),
  async $mount() {
    return async () => {}
  },
}
const disposePlugin = await plugin.apply(pluginCapableContext({
  remote,
  slots: createSlotsFace(extractionCore),
  locale: createLocale(),
}))
const overlay = extractionCore.entriesOfSlot('shell.overlay')
assert.equal(overlay.length, 1)
assert.equal(typeof overlay[0].inject, 'function')
const businessFace = overlay[0].inject()

await businessFace.refresh()
let businessSnapshot = await settleBusinessState(businessFace)
assert.equal(businessSnapshot.attachment, 'attached')
assert.equal(businessSnapshot.protocol.status, 'compatible')
assert.equal(businessFace.hooks.profileMutation.getSnapshot().profile.status, 'idle')

const rendererPlugin = await loadRendererClientPlugin()
assert.deepEqual(rendererPlugin.inject, [])

const rendererCtx = new Context()
const rendererFiber = rendererCtx.plugin({
  name: 'm7b1-2-real-renderer-probe',
  inject: [...rendererPlugin.inject],
  apply: rendererPlugin.apply,
})
await rendererFiber.await()
const slots = rendererCtx.get('slots')
assert.ok(slots)

let latestProbe
function Probe(props) {
  const attachment = props.useContextManager(snapshot => snapshot.attachment)
  const protocol = props.useContextManager(snapshot => snapshot.protocol.status)
  const mutation = props.useProfileMutation(snapshot => snapshot.profile.status)
  latestProbe = `${attachment}:${protocol}:${mutation}`
  return React.createElement('span', {
    'data-business-bridge-probe': true,
  }, latestProbe)
}

const disposeRoot = slots.register({
  name: 'root',
  children: {
    'm7b1-2.bridge-probe': { kind: 'single', scope: 'root' },
  },
}, props => props.renderSlot('m7b1-2.bridge-probe', {}))
const disposeProbe = slots.register({
  name: 'm7b1-2.bridge-probe',
  inject: () => businessFace,
}, Probe)

let rendered
await act(async () => {
  rendered = TestRenderer.create(slots.renderSlot('root', {}))
})
assert.equal(latestProbe, 'attached:compatible:idle')

const currentBasis = businessFace.captureProfileMutationBasis()
assert.ok(currentBasis)
let staleResult
await act(async () => {
  staleResult = await businessFace.profileMutations.setProfileName({
    instanceId: currentBasis.instanceId,
    revision: currentBasis.revision + 1,
  }, 'main', 'Changed')
})
assert.equal(staleResult.status, 'rejected')
assert.equal(staleResult.error.kind, 'precondition')
assert.equal(staleResult.error.code, 'profile-basis-stale')
assert.equal(latestProbe, 'attached:compatible:settled')

await act(async () => {
  await disposePlugin()
})
businessSnapshot = businessFace.hooks.contextManager.getSnapshot()
assert.equal(businessSnapshot.attachment, 'detached')
assert.equal(businessSnapshot.protocol.status, 'unchecked')
assert.equal(latestProbe, 'detached:unchecked:idle')
assert.equal(businessFace.captureProfileMutationBasis(), undefined)
assert.equal((await businessFace.refresh()).status, 'disposed')
assert.equal((await businessFace.profileMutations.setProfileName(
  currentBasis,
  'main',
  'After dispose',
)).status, 'disposed')

await act(async () => {
  rendered.unmount()
})
disposeProbe()
disposeRoot()
await rendererFiber.dispose()
disposeExtractionRoot()
