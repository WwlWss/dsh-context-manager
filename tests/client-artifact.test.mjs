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
  }
}

function contextManagerRemoteFace() {
  const change = Object.freeze({
    instanceId: 'client-test-host',
    generation: 1,
    profiles: 1,
    promptResources: 0,
    presets: 1,
    runtime: 1,
  })
  return {
    async protocol() { return { ok: true, value: { apiVersion: 1 } } },
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

test('M7B0 client artifact is a single DSH loader factory with only retained baseline externals', async () => {
  const source = await readFile(clientPath, 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load\(\{\s*id:\s*["']dsh-context-manager["']/)
  assert.doesNotMatch(source, /require\.async\s*\(/)

  const externalRequires = [...source.matchAll(/require\((["'])([^"']+)\1\)/g)].map(match => match[2])
  assert.deepEqual([...new Set(externalRequires)].sort(), ['react'])
})

test('M7B0 loader artifact mounts Remote and locale before registering two additive slots and unwinds safely', async () => {
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
    await import(pathToFileURL(clientPath).href + '?m7b0-loader-contract')
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
  assert.deepEqual(plugin.inject, ['remote', 'slots', 'locale'])
  assert.equal(typeof plugin.apply, 'function')

  const lifecycle = []
  const entries = []
  const remote = {
    contextManager: contextManagerRemoteFace(),
    async $mount(contribution) {
      lifecycle.push('remote:mount')
      assert.equal(contribution.package, 'dsh-context-manager')
      assert.equal(contribution.descriptors.length, 31)
      return async () => { lifecycle.push('remote:dispose') }
    },
  }
  const locale = {
    register(namespace, dictionaries) {
      lifecycle.push('locale:register:' + namespace)
      assert.equal(namespace, 'context-manager')
      assert.equal(dictionaries.en.title, 'Context Manager')
      assert.equal(dictionaries.zh.title, '上下文管理器')
      return () => { lifecycle.push('locale:dispose:' + namespace) }
    },
    bind(namespace) {
      assert.equal(namespace, 'context-manager')
      return key => ({
        title: 'Context Manager',
        compactTitle: 'CM',
        close: 'Close',
        closeAria: 'Close Context Manager',
        foundationMessage: 'Web client foundation is active. Profile controls arrive in later milestones.',
      })[key] ?? key
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

  const dispose = await plugin.apply(pluginCapableContext({ remote, slots, locale }))
  assert.deepEqual(entries.map(entry => entry.options.name), [
    'sidebar.footer.action',
    'shell.overlay',
  ])
  assert.equal(entries[0].options.id, 'context-manager')
  assert.equal(entries[1].options.id, 'context-manager-drawer')

  assert.equal(entries[0].options.inject, undefined)
  assert.equal(entries[1].options.inject, undefined)
  assert.equal(entries[0].options.store, entries[1].options.store)
  assert.equal(entries[0].options.locale, 'context-manager')
  assert.equal(entries[1].options.locale, 'context-manager')

  const instance = entries[0].options.store.create()
  const useStore = selector => selector(instance.getSnapshot())
  const t = locale.bind('context-manager')

  const closedDrawer = entries[1].component({ useStore, actions: instance.actions, t })
  assert.equal(closedDrawer, null)

  const trigger = entries[0].component({ wide: true, useStore, actions: instance.actions, t })
  assert.equal(trigger.type, 'button')
  assert.equal(trigger.props['aria-expanded'], false)
  trigger.props.onClick()

  const openDrawer = entries[1].component({ useStore, actions: instance.actions, t })
  assert.equal(openDrawer.type, 'div')
  assert.equal(openDrawer.props['data-context-manager-backdrop'], '')

  await dispose()
  assert.deepEqual(lifecycle.slice(-6), [
    'slot:inject-dispose:shell.overlay',
    'slot:register-dispose:shell.overlay',
    'slot:inject-dispose:sidebar.footer.action',
    'slot:register-dispose:sidebar.footer.action',
    'locale:dispose:context-manager',
    'remote:dispose',
  ])
})


test('M7B1 client artifact rolls back a mounted Remote when child model fiber creation throws', async () => {
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
    await import(pathToFileURL(clientPath).href + '?m7b1-child-create-rollback')
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }

  assert.ok(registration)
  const plugin = registration.factory((specifier) => {
    assert.equal(specifier, 'react')
    return fakeReact()
  })

  const lifecycle = []
  const remote = {
    contextManager: contextManagerRemoteFace(),
    async $mount() {
      lifecycle.push('remote:mount')
      return async () => { lifecycle.push('remote:dispose') }
    },
  }
  const ctx = {
    remote,
    plugin() {
      lifecycle.push('model:plugin')
      throw new Error('child model setup failed')
    },
    locale: {
      register() {
        throw new Error('locale must not register after child setup failure')
      },
      bind() {
        throw new Error('locale must not bind after child setup failure')
      },
    },
    slots: {
      inject() {
        throw new Error('slots must not inject after child setup failure')
      },
      register() {
        throw new Error('slots must not register after child setup failure')
      },
    },
  }

  await assert.rejects(
    plugin.apply(ctx),
    /child model setup failed/,
  )
  assert.deepEqual(lifecycle, [
    'remote:mount',
    'model:plugin',
    'remote:dispose',
  ])
})
