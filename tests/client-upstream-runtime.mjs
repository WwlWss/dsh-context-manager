import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children } }
    },
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
  }
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

let registration
const previousWindow = globalThis.window
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      registration = value
    },
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
assert.equal(registration.id, 'dsh-context-manager')

const plugin = registration.factory((specifier) => {
  assert.equal(specifier, 'react')
  return fakeReact()
})

assert.deepEqual(plugin.inject, ['remote', 'slots'])

const core = new SlotCore()
const disposeRoot = core.register({
  name: 'root',
  children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  },
}, () => null)

let mountedContribution
let remoteDisposed = false
const remote = {
  async $mount(contribution) {
    mountedContribution = contribution
    return async () => { remoteDisposed = true }
  },
}

const disposePlugin = await plugin.apply({
  remote,
  slots: createSlotsFace(core),
})

assert.equal(mountedContribution?.package, 'dsh-context-manager')
assert.equal(mountedContribution?.descriptors?.length, 31)

const footer = core.entriesOfSlot('sidebar.footer.action')
const overlay = core.entriesOfSlot('shell.overlay')
assert.equal(footer.length, 1)
assert.equal(overlay.length, 1)
assert.equal(footer[0].options.id, 'context-manager')
assert.equal(overlay[0].options.id, 'context-manager-drawer')

const triggerFace = footer[0].options.inject()
const drawerFace = overlay[0].options.inject()
assert.equal(triggerFace.controller, drawerFace.controller)

const trigger = footer[0].component({ ...triggerFace, wide: true })
assert.equal(trigger.type, 'button')
assert.equal(trigger.props['aria-expanded'], false)
trigger.props.onClick()

const drawer = overlay[0].component(drawerFace)
assert.equal(drawer.type, 'div')
assert.equal(drawer.props['data-context-manager-backdrop'], '')

await disposePlugin()
assert.equal(core.entriesOfSlot('sidebar.footer.action').length, 0)
assert.equal(core.entriesOfSlot('shell.overlay').length, 0)
assert.equal(remoteDisposed, true)

disposeRoot()
