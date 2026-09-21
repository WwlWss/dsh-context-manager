import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const registryPackage = process.env.DSH_CLIENT_REGISTRY_PACKAGE
if (!registryPackage) throw new Error('DSH_CLIENT_REGISTRY_PACKAGE is required')

const { SlotRegistry } = await import(`${registryPackage}/client`)
const React = await import('react')

let loaderRegistration
const previousWindow = globalThis.window
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      loaderRegistration = value
    },
  },
}

try {
  await import(pathToFileURL(path.resolve('lib/client.js')).href + '?retained-client-runtime')
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}

assert.ok(loaderRegistration)
assert.equal(loaderRegistration.id, 'dsh-context-manager')
const plugin = loaderRegistration.factory((specifier) => {
  if (specifier === 'react') return React
  throw new Error(`unexpected Client module-table request: ${specifier}`)
})

const ctx = new Context()
const slotsFiber = ctx.plugin(SlotRegistry)
await slotsFiber.await()

let mountedContribution
let remoteDisposed = false
ctx.provide('remote', {
  async $mount(contribution) {
    mountedContribution = contribution
    return async () => { remoteDisposed = true }
  },
})

const disposeRoot = ctx.slots.register({
  name: 'root',
  children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  },
}, () => null)

const pluginFiber = ctx.plugin({
  inject: [...plugin.inject],
  apply: plugin.apply,
})
await pluginFiber.await()

assert.equal(mountedContribution?.package, 'dsh-context-manager')
assert.equal(mountedContribution?.descriptors?.length, 31)

const footer = ctx.slots.entriesOfSlot('sidebar.footer.action')
const overlay = ctx.slots.entriesOfSlot('shell.overlay')
assert.equal(footer.length, 1)
assert.equal(overlay.length, 1)
assert.equal(footer[0].options.id, 'context-manager')
assert.equal(overlay[0].options.id, 'context-manager-drawer')

await pluginFiber.dispose()
assert.equal(ctx.slots.entriesOfSlot('sidebar.footer.action').length, 0)
assert.equal(ctx.slots.entriesOfSlot('shell.overlay').length, 0)
assert.equal(remoteDisposed, true)

disposeRoot()
await slotsFiber.dispose()
