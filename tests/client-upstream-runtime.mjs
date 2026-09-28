import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children } }
    },
  }
}

function createLocale() {
  const dictionaries = new Map()
  let active = 'en'
  return {
    setActive(next) { active = next },
    register(namespace, values) {
      dictionaries.set(namespace, values)
      return () => { dictionaries.delete(namespace) }
    },
    bind(namespace) {
      return (key) => dictionaries.get(namespace)?.[active]?.[key] ?? key
    },
    has(namespace) { return dictionaries.has(namespace) },
  }
}

function componentText(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  const children = node.props?.children ?? []
  return children.map(componentText).join('')
}

let registration
const previousWindow = globalThis.window
globalThis.window = {
  __ModuleLoader__: {
    load(value) { registration = value },
  },
}

let source
try {
  source = await readFile(path.resolve('lib/client.js'), 'utf8')
  new Function('window', source)(globalThis.window)
} finally {
  if (previousWindow === undefined) delete globalThis.window
  else globalThis.window = previousWindow
}

assert.ok(registration)
assert.equal(registration.id, 'dsh-context-manager')
assert.equal(source.includes('useSyncExternalStore'), false)
assert.equal(source.includes('ContextManagerInteractionController'), false)
assert.equal(source.includes('data-plugin-css'), true)
for (const literal of ['#fff', '#111', '#666', '#d0d0d0', 'rgba(0, 0, 0']) {
  assert.equal(source.includes(literal), false, `client artifact must not contain literal color ${literal}`)
}

const plugin = registration.factory((specifier) => {
  assert.equal(specifier, 'react')
  return fakeReact()
})
assert.deepEqual(plugin.inject, ['remote', 'slots', 'locale'])

const ctx = new Context()
const slots = new SlotRegistry(ctx)
let rendererHost
slots.install({
  renderRoot(host) {
    rendererHost = host
    return null
  },
})
let disposeRoot = slots.register({
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
const locale = createLocale()
const disposePlugin = await plugin.apply({ remote, slots, locale })

assert.equal(mountedContribution?.package, 'dsh-context-manager')
assert.equal(mountedContribution?.descriptors?.length, 31)
assert.equal(locale.has('context-manager'), true)

const footer = slots.entriesOfSlot('sidebar.footer.action')
const overlay = slots.entriesOfSlot('shell.overlay')
assert.equal(footer.length, 1)
assert.equal(overlay.length, 1)
assert.equal(footer[0].options.id, 'context-manager')
assert.equal(footer[0].options.order, 100)
assert.equal(overlay[0].options.id, 'context-manager-drawer')
assert.equal(footer[0].inject, undefined)
assert.equal(overlay[0].inject, undefined)
assert.equal(footer[0].store, overlay[0].store)
assert.equal(footer[0].locale, 'context-manager')
assert.equal(overlay[0].locale, 'context-manager')
assert.equal(typeof footer[0].options.label, 'function')
assert.equal(footer[0].options.label(), 'Context Manager')
locale.setActive('zh')
assert.equal(footer[0].options.label(), '上下文管理器')
locale.setActive('en')

slots.renderSlot('root', {})
assert.ok(rendererHost)
const instance = rendererHost.storeOf(footer[0])
assert.ok(instance)
assert.equal(rendererHost.storeOf(overlay[0]), instance)
let notifications = 0
const unsubscribeStore = instance.subscribe(() => { notifications += 1 })
const useStore = selector => selector(instance.getSnapshot())
const t = locale.bind('context-manager')

let trigger = footer[0].component({ wide: true, useStore, actions: instance.actions, t })
assert.equal(trigger.type, 'button')
assert.equal(trigger.props['aria-expanded'], false)
assert.equal(componentText(trigger), 'Context Manager')
assert.equal(overlay[0].component({ useStore, actions: instance.actions, t }), null)

trigger.props.onClick()
assert.equal(instance.getSnapshot().open, true)
assert.equal(notifications, 1)
instance.actions.open()
assert.equal(notifications, 1)
trigger = footer[0].component({ wide: true, useStore, actions: instance.actions, t })
assert.equal(trigger.props['aria-expanded'], true)

let drawer = overlay[0].component({ useStore, actions: instance.actions, t })
assert.equal(drawer.type, 'div')
assert.equal(drawer.props['data-context-manager-backdrop'], '')
assert.match(componentText(drawer), /Context Manager/)
assert.match(componentText(drawer), /Close/)

locale.setActive('zh')
drawer = overlay[0].component({ useStore, actions: instance.actions, t: locale.bind('context-manager') })
assert.match(componentText(drawer), /上下文管理器/)
assert.match(componentText(drawer), /关闭/)
drawer.props.onClick()
assert.equal(instance.getSnapshot().open, false)
assert.equal(notifications, 2)
unsubscribeStore()
instance.actions.open()
assert.equal(instance.getSnapshot().open, true)
assert.equal(notifications, 2)

// Declaration collapse/redeclare must tear down and restore both additive entries.
disposeRoot()
assert.equal(slots.entriesOfSlot('sidebar.footer.action').length, 0)
assert.equal(slots.entriesOfSlot('shell.overlay').length, 0)

disposeRoot = slots.register({
  name: 'root',
  children: {
    'sidebar.footer.action': { kind: 'list', scope: 'root' },
    'shell.overlay': { kind: 'list', scope: 'root' },
  },
}, () => null)

const restoredFooter = slots.entriesOfSlot('sidebar.footer.action')
const restoredOverlay = slots.entriesOfSlot('shell.overlay')
assert.equal(restoredFooter.length, 1)
assert.equal(restoredOverlay.length, 1)
assert.equal(restoredFooter[0].options.id, 'context-manager')
assert.equal(restoredOverlay[0].options.id, 'context-manager-drawer')
assert.equal(restoredFooter[0].store, restoredOverlay[0].store)

// The real SlotRegistry drops the last-held root instance on collapse and
// resolves a fresh framework-owned instance after the declaration is restored.
const restoredInstance = rendererHost.storeOf(restoredFooter[0])
assert.ok(restoredInstance)
assert.notEqual(restoredInstance, instance)
assert.equal(rendererHost.storeOf(restoredOverlay[0]), restoredInstance)
assert.equal(restoredInstance.getSnapshot().open, false)

await disposePlugin()
assert.equal(slots.entriesOfSlot('sidebar.footer.action').length, 0)
assert.equal(slots.entriesOfSlot('shell.overlay').length, 0)
assert.equal(locale.has('context-manager'), false)
assert.equal(remoteDisposed, true)
disposeRoot()
