import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { test } from 'vitest'
import * as React from 'react'

import {
  SlotTestRuntime,
  TestRemote,
} from '@deepseek-ai/dsh-client-test-runtime'

test('same M7A artifact mounts through the retained production SlotRegistry', async () => {
  const runtime = await SlotTestRuntime.create()

  try {
    const remote = 'remote' in runtime && runtime.remote !== undefined
      ? runtime.remote
      : new TestRemote(runtime.ctx)

    let mountedContribution: { package?: string; descriptors?: unknown[] } | undefined
    let remoteDisposed = false

    remote.$mount = async (contribution: { package?: string; descriptors?: unknown[] }) => {
      mountedContribution = contribution
      return async () => { remoteDisposed = true }
    }

    await runtime.declare({
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    })

    let loaderRegistration: {
      id: string
      factory: (require: (specifier: string) => unknown) => {
        inject: readonly string[]
        apply: (ctx: unknown) => unknown
      }
    } | undefined

    const previousLoader = (window as unknown as {
      __ModuleLoader__?: { load(value: unknown): void }
    }).__ModuleLoader__

    ;(window as unknown as {
      __ModuleLoader__: { load(value: unknown): void }
    }).__ModuleLoader__ = {
      load(value) {
        loaderRegistration = value as typeof loaderRegistration
      },
    }

    try {
      const clientSource = await readFile(path.resolve('lib/client.js'), 'utf8')
      new Function('window', clientSource)(window)
    } finally {
      if (previousLoader === undefined) {
        delete (window as unknown as { __ModuleLoader__?: unknown }).__ModuleLoader__
      } else {
        ;(window as unknown as { __ModuleLoader__: unknown }).__ModuleLoader__ = previousLoader
      }
    }

    assert.ok(loaderRegistration)
    assert.equal(loaderRegistration.id, 'dsh-context-manager')

    const plugin = loaderRegistration.factory((specifier) => {
      if (specifier === 'react') return React
      throw new Error(`unexpected Client module-table request: ${specifier}`)
    })

    assert.deepEqual(plugin.inject, ['remote', 'slots'])

    const handle = await runtime.mount(plugin as never)
    assert.equal(mountedContribution?.package, 'dsh-context-manager')
    assert.equal(mountedContribution?.descriptors?.length, 31)
    assert.equal(runtime.slots.entriesOfSlot('sidebar.footer.action').length, 1)
    assert.equal(runtime.slots.entriesOfSlot('shell.overlay').length, 1)

    const footer = runtime.renderSlot('sidebar.footer.action' as never, { wide: true } as never)
    const trigger = footer.view.getByRole('button', { name: 'Context Manager' })
    assert.equal(trigger.getAttribute('aria-expanded'), 'false')

    trigger.click()
    await runtime.flush()

    const overlay = runtime.renderSlot('shell.overlay' as never, {} as never)
    assert.ok(overlay.view.getByRole('dialog', { name: 'Context Manager' }))

    await handle.dispose()
    assert.equal(runtime.slots.entriesOfSlot('sidebar.footer.action').length, 0)
    assert.equal(runtime.slots.entriesOfSlot('shell.overlay').length, 0)
    assert.equal(remoteDisposed, true)
  } finally {
    await runtime.dispose()
  }
})
