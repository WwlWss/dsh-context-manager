import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { ContextManagerError, ContextManagerPromptLibrary } from '../lib/index.js'

class MemoryTable {
  constructor(records = new Map()) { this.records = records }
  get(key) { return this.records.get(key) }
  entries() { return new Map(this.records).entries() }
  async put(key, value) { this.records.set(key, structuredClone(value)) }
  async delete(key) { return this.records.delete(key) }
  async update(key, update) {
    const current = this.records.get(key)
    if (current === undefined) throw new Error(`missing key ${key}`)
    const next = update(current)
    this.records.set(key, structuredClone(next))
    return this.records.get(key)
  }
}

class MemoryStorageDomain extends Service {
  constructor(ctx, state) { super(ctx, 'storageDomain'); this.state = state }
  async open(spec) {
    this.state.openedSpecs.push(spec)
    this.state.openCount += 1
    const state = this.state
    let closed = false
    return {
      table(name) { assert.equal(name, 'resources'); return state.table },
      async close() { if (!closed) { closed = true; state.closeCount += 1 } },
    }
  }
}

function memoryState() { return { table: new MemoryTable(), openedSpecs: [], openCount: 0, closeCount: 0 } }
async function boot(state = memoryState()) {
  const ctx = new Context()
  await ctx.plugin(MemoryStorageDomain, state)
  await ctx.plugin(ContextManagerPromptLibrary)
  return { ctx, library: ctx.dshContextPromptLibrary, state }
}
async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof ContextManagerError)
    assert.equal(error.code, code)
    return true
  })
}

test('opens one opaque storage domain with the stable identity', async (t) => {
  const { ctx, state } = await boot()
  t.after(() => ctx.fiber.dispose())
  assert.equal(state.openCount, 1)
  assert.equal(state.openedSpecs[0].name, 'dsh_context_manager_prompts')
  assert.equal(state.openedSpecs[0].version, 1)
  assert.equal(state.openedSpecs[0].tables.resources.valueSchema.parse({ malformed: true }).malformed, true)
})

test('create preserves arbitrary ids, exact text, and unknown JSON extensions', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())
  const id = `  /Prompt/${['__', 'proto', '__'].join('')}/日本語  `
  const content = '  leading\r\n中文\n日本語 {{variable}} {{unknown}}\ntrailing  '
  const created = await library.createPrompt(id, { name: '  Name  ', description: '', content, futureField: { nested: ['keep'] } })
  assert.deepEqual(created, { id, revision: 1 })
  const stored = library.get(id)
  assert.equal(stored.resource.content, content)
  assert.deepEqual(stored.resource.futureField, { nested: ['keep'] })
  assert.deepEqual(library.list(), [{ status: 'usable', id, name: '  Name  ', description: '', revision: 1 }])
  assert.equal(Object.hasOwn(library.list()[0], 'content'), false)
})

test('duplicate create and stale revisions are explicit', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())
  await library.createPrompt('same', { name: 'first', content: 'A' })
  await rejectsCode(library.createPrompt('same', { name: 'second', content: 'B' }), 'prompt-resource-exists')
  const updated = await library.setPromptContent('same', 'B', 1)
  assert.deepEqual(updated, { id: 'same', revision: 2 })
  await rejectsCode(library.setPromptName('same', 'stale', 1), 'prompt-resource-conflict')
})

test('replace merges old and new unknown siblings and reserves revision', async (t) => {
  const state = memoryState()
  state.table.records.set('future', { name: 'old', description: 'old', content: 'old', revision: 7, futureField: { old: true }, stableField: 'keep' })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())
  const receipt = await library.replacePrompt('future', { name: 'new', content: 'new', futureField: { new: true }, addedField: 42 }, 7)
  assert.deepEqual(receipt, { id: 'future', revision: 8 })
  const resource = library.get('future').resource
  assert.equal(Object.hasOwn(resource, 'description'), false)
  assert.deepEqual(resource.futureField, { new: true })
  assert.equal(resource.stableField, 'keep')
  assert.equal(resource.addedField, 42)
  await rejectsCode(library.replacePrompt('future', { name: 'x', content: 'x', revision: 99 }, 8), 'invalid-prompt-resource')
})

test('malformed stored resources are isolated while usable resources remain available', async (t) => {
  const state = memoryState()
  state.table.records.set('bad', { name: 123, content: 'broken', revision: 4 })
  state.table.records.set('good', { name: 'good', content: 'ok', revision: 2 })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())
  const listed = library.list()
  assert.equal(listed.find(item => item.id === 'bad').status, 'invalid')
  assert.deepEqual(listed.find(item => item.id === 'good'), { status: 'usable', id: 'good', name: 'good', revision: 2 })
  assert.equal(library.get('good').resource.content, 'ok')
  assert.throws(() => library.get('bad'), error => error instanceof ContextManagerError && error.code === 'invalid-prompt-resource')
})

test('path-local setter repairs one malformed field without requiring full Domain validity first', async (t) => {
  const state = memoryState()
  state.table.records.set('repair', { name: 123, content: 'valid', revision: 5, futureField: { keep: true } })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())
  assert.equal(library.list()[0].status, 'invalid')
  assert.deepEqual(await library.setPromptName('repair', 'fixed', 5), { id: 'repair', revision: 6 })
  assert.equal(library.get('repair').resource.name, 'fixed')
  assert.deepEqual(library.get('repair').resource.futureField, { keep: true })
})

test('missing usable revision fence blocks path-local mutation', async (t) => {
  const state = memoryState()
  state.table.records.set('no-fence', { name: 'n', content: 'c', revision: 'bad' })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())
  await rejectsCode(library.setPromptContent('no-fence', 'new', 1), 'prompt-resource-path-not-editable')
})

test('structured writes reject extension values that JSON persistence would change', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())
  await rejectsCode(library.createPrompt('undefined', { name: 'n', content: 'c', future: undefined }), 'invalid-prompt-resource')
  await rejectsCode(library.createPrompt('date', { name: 'n', content: 'c', future: new Date() }), 'invalid-prompt-resource')
  await rejectsCode(library.createPrompt('nan', { name: 'n', content: 'c', future: Number.NaN }), 'invalid-prompt-resource')
  assert.equal(library.list().length, 0)
})

test('get is detached while list carries no body or extension payload', async (t) => {
  const state = memoryState()
  state.table.records.set('detached', { name: 'n', content: 'large body', revision: 1, futureField: { nested: ['safe'] } })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())
  const first = library.get('detached')
  first.resource.futureField.nested.push('outside')
  assert.deepEqual(library.get('detached').resource.futureField, { nested: ['safe'] })
  const listed = library.list()[0]
  assert.equal(Object.hasOwn(listed, 'content'), false)
  assert.equal(Object.hasOwn(listed, 'futureField'), false)
})

test('delete is revision-fenced and removes only the named resource', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())
  await library.createPrompt('a', { name: 'a', content: 'A' })
  await library.createPrompt('b', { name: 'b', content: 'B' })
  await rejectsCode(library.deletePrompt('a', 2), 'prompt-resource-conflict')
  await library.deletePrompt('a', 1)
  assert.deepEqual(library.list().map(item => item.id), ['b'])
})

test('unload closes the owned domain so it can be mounted again', async () => {
  const state = memoryState()
  const first = await boot(state)
  await first.ctx.fiber.dispose()
  assert.equal(state.closeCount, 1)
  const second = await boot(state)
  try { assert.equal(state.openCount, 2) } finally { await second.ctx.fiber.dispose() }
  assert.equal(state.closeCount, 2)
})

class MalformedStorageDomain extends Service {
  constructor(ctx) { super(ctx, 'storageDomain') }
  async open() { return { table() { return { get() {} } }, async close() {} } }
}

test('malformed present storageDomain fails loud', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(MalformedStorageDomain)
    await assert.rejects(async () => { await ctx.plugin(ContextManagerPromptLibrary) }, error => error instanceof TypeError && /storageDomain table\.entries\(\)/.test(error.message))
  } finally {
    await ctx.fiber.dispose()
  }
})
