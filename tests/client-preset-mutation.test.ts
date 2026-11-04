import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createContextManagerPresetMutationController } from '../src/client/preset-mutation-controller.js'
import type { ContextManagerClientPresetMutationRemote } from '../src/client/preset-remote-port.js'

const accepted = (id: string) => ({
  ok: true as const,
  value: { ok: true as const, value: { id } },
})
const refused = () => ({
  ok: true as const,
  value: {
    ok: false as const,
    error: { code: 'preset-authoring-unavailable' as const, message: 'native refused' },
  },
})
const unsettled = () => ({
  ok: false as const,
  error: { code: 'NETWORK_LOST', message: 'transport outcome unknown' },
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

function fixture() {
  const calls: Array<{ kind: 'copy' | 'remove'; args: readonly unknown[] }> = []
  let fresh = true
  let allow = true
  let lifetime: 'attached' | 'detached' = 'attached'
  let copyImplementation: (from: string, id: string, name: string | null) => Promise<unknown> =
    async (_from, id) => accepted(id)
  let removeImplementation: (id: string) => Promise<unknown> = async id => accepted(id)
  const remote = {
    async copyPreset(from: string, id: string, name: string | null) {
      calls.push({ kind: 'copy', args: [from, id, name] })
      return copyImplementation(from, id, name)
    },
    async removePreset(id: string) {
      calls.push({ kind: 'remove', args: [id] })
      return removeImplementation(id)
    },
  }
  const controller = createContextManagerPresetMutationController({
    getRemote: () => remote as unknown as ContextManagerClientPresetMutationRemote,
    getLifecycle: () => lifetime,
    getProtocolStatus: () => 'compatible' as const,
    getRoster: () => allow ? ({
      status: 'ready' as const,
      ids: ['source', 'user-preset'],
      authorable: true,
    }) : undefined,
    rehydrate: async () => fresh,
  })
  return {
    controller,
    calls,
    setFresh(value: boolean) { fresh = value },
    setAvailable(value: boolean) { allow = value },
    detach() { lifetime = 'detached'; controller.reset() },
    setCopy(fn: (from: string, id: string, name: string | null) => Promise<unknown>) {
      copyImplementation = fn
    },
    setRemove(fn: (id: string) => Promise<unknown>) {
      removeImplementation = fn
    },
  }
}

test('M8C P06/P07 exact native copy parameters, null is distinct from empty name', async () => {
  const f = fixture()
  const first = await f.controller.controller.copyPreset('source', ' 日本語 ', null)
  assert.deepEqual(first, { status: 'applied', refresh: 'fresh' })
  const second = await f.controller.controller.copyPreset('source', 'target2', '')
  assert.deepEqual(second, { status: 'applied', refresh: 'fresh' })
  assert.deepEqual(f.calls, [
    { kind: 'copy', args: ['source', ' 日本語 ', null] },
    { kind: 'copy', args: ['source', 'target2', ''] },
  ])
})

test('M8C P12 one global Preset lane rejects concurrent copy/remove before RPC', async () => {
  const f = fixture()
  const gate = deferred<ReturnType<typeof accepted>>()
  f.setCopy(async () => gate.promise)
  const pending = f.controller.controller.copyPreset('source', 'target', null)
  const second = await f.controller.controller.removePreset('user-preset')
  assert.equal(second.status, 'rejected')
  assert.deepEqual(f.calls, [
    { kind: 'copy', args: ['source', 'target', null] },
  ])
  gate.resolve(accepted('target'))
  assert.deepEqual(await pending, { status: 'applied', refresh: 'fresh' })
})

test('M8C P17 confirmed native receipt retains applied/degraded when roster cannot rehydrate', async () => {
  const f = fixture()
  f.setFresh(false)
  const result = await f.controller.controller.removePreset('user-preset')
  assert.deepEqual(result, { status: 'applied', refresh: 'degraded' })
  assert.equal(f.calls.length, 1, 'recovery never dispatches a second write')
})

test('M8C P18 transport refusal is outcome unknown and cannot auto retry', async () => {
  const f = fixture()
  f.setCopy(async () => unsettled())
  const result = await f.controller.controller.copyPreset('source', 'target', null)
  assert.equal(result.status, 'unknown')
  assert.equal(f.calls.length, 1)
})

test('M8C P11 native business refusal cannot be relabeled successful after recovery', async () => {
  const f = fixture()
  f.setRemove(async () => refused())
  const result = await f.controller.controller.removePreset('user-preset')
  assert.equal(result.status, 'rejected')
  assert.equal(f.calls.length, 1)
})

test('M8C P16 detach supersedes old mutation result and blocks new dispatch', async () => {
  const f = fixture()
  const gate = deferred<ReturnType<typeof accepted>>()
  f.setRemove(async () => gate.promise)
  const pending = f.controller.controller.removePreset('user-preset')
  f.detach()
  gate.resolve(accepted('user-preset'))
  const result = await pending
  assert.ok(result.status === 'detached' || result.status === 'superseded')
  const next = await f.controller.controller.copyPreset('source', 'target', null)
  assert.equal(next.status, 'detached')
  assert.equal(f.calls.length, 1)
})

test('M8C P02 no authoritative roster fails closed without native write', async () => {
  const f = fixture()
  f.setAvailable(false)
  const result = await f.controller.controller.removePreset('user-preset')
  assert.equal(result.status, 'rejected')
  assert.equal(f.calls.length, 0)
})
