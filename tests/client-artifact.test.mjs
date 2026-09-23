import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const clientPath = path.join(root, 'lib/client.js')

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

test('M7A client artifact is a single DSH loader factory with only retained baseline externals', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load\(\{\s*id:\s*["']dsh-context-manager["']/)
  assert.doesNotMatch(source, /require\.async\s*\(/)

  const externalRequires = [...source.matchAll(/require\((["'])([^"']+)\1\)/g)].map(match => match[2])
  assert.deepEqual([...new Set(externalRequires)].sort(), ['react'])
})

test('M7A loader artifact mounts Remote before registering two additive slots and unwinds safely', async () => {
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
    await import(pathToFileURL(clientPath).href + '?m7a-loader-contract')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }

  assert.ok(registration)
  assert.equal(registration.id, 'dsh-context-manager')
  assert.equal(typeof registration.factory, 'function')

  const plugin = registration.factory((specifier) => {
    assert.equal(specifier, 'react')
    return fakeReact()
  })
  assert.deepEqual(plugin.inject, ['remote', 'slots'])
  assert.equal(typeof plugin.apply, 'function')

  const lifecycle = []
  const entries = []
  const remote = {
    async $mount(contribution) {
      lifecycle.push('remote:mount')
      assert.equal(contribution.package, 'dsh-context-manager')
      assert.equal(contribution.descriptors.length, 31)
      return async () => { lifecycle.push('remote:dispose') }
    },
  }
  const slots = {
    inject(name, factory) {
      lifecycle.push('slot:inject:' + name)
      const disposeRegistration = factory()
      return () => {
        lifecycle.push('slot:inject-dispose:' + name)
        disposeRegistration()
      }
    },
    register(options, component) {
      entries.push({ options, component })
      lifecycle.push('slot:register:' + options.name)
      return () => { lifecycle.push('slot:register-dispose:' + options.name) }
    },
  }

  const dispose = await plugin.apply({ remote, slots })
  assert.deepEqual(entries.map(entry => entry.options.name), [
    'sidebar.footer.action',
    'shell.overlay',
  ])
  assert.equal(entries[0].options.id, 'context-manager')
  assert.equal(entries[1].options.id, 'context-manager-drawer')

  const triggerFace = entries[0].options.inject()
  const drawerFace = entries[1].options.inject()
  assert.equal(triggerFace.controller, drawerFace.controller)

  const closedDrawer = entries[1].component(drawerFace)
  assert.equal(closedDrawer, null)

  const trigger = entries[0].component({ ...triggerFace, wide: true })
  assert.equal(trigger.type, 'button')
  assert.equal(trigger.props['aria-expanded'], false)
  trigger.props.onClick()

  const openDrawer = entries[1].component(drawerFace)
  assert.equal(openDrawer.type, 'div')
  assert.equal(openDrawer.props['data-context-manager-backdrop'], '')

  await dispose()
  assert.deepEqual(lifecycle.slice(-5), [
    'slot:inject-dispose:shell.overlay',
    'slot:register-dispose:shell.overlay',
    'slot:inject-dispose:sidebar.footer.action',
    'slot:register-dispose:sidebar.footer.action',
    'remote:dispose',
  ])
})
