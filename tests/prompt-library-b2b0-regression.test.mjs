import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import {
  ContextManagerChangeTracker,
  ContextManagerError,
  ContextManagerPromptLibrary,
  ContextManagerRemoteService,
} from '../lib/index.js'

class MemoryTable {
  constructor(records = new Map()) { this.records = records }
  get(id) { return this.records.get(id) }
  entries() { return new Map(this.records).entries() }
  async put(id, resource) { this.records.set(id, structuredClone(resource)) }
  async delete(id) { return this.records.delete(id) }
  async update(id, mapper) {
    const current = this.records.get(id)
    if (current === undefined) throw new Error('missing test resource')
    const next = mapper(current)
    this.records.set(id, structuredClone(next))
    return this.records.get(id)
  }
}
class MemoryStorage extends Service {
  constructor(ctx, table) { super(ctx, 'storageDomain'); this.tableValue = table }
  async open() {
    const table = this.tableValue
    return { table: () => table, close: async () => {} }
  }
}
async function boot(table) {
  const ctx = new Context()
  await ctx.plugin(MemoryStorage, table)
  await ctx.plugin(ContextManagerPromptLibrary)
  return { ctx, library: ctx.dshContextPromptLibrary }
}

function createBasis(library) {
  return { resourceAuthorityId: library.resourceWriteAuthority() }
}
function mutationBasis(library, id) {
  const resource = library.get(id).resource
  return {
    resourceAuthorityId: library.resourceWriteAuthority(),
    resourceId: id,
    incarnationId: resource.__dshCmResourceIncarnation ?? null,
    revision: resource.revision,
  }
}

const isIncarnationConflict = error => error instanceof ContextManagerError
  && error.code === 'prompt-resource-incarnation-conflict'
const isAuthorityConflict = error => error instanceof ContextManagerError
  && error.code === 'prompt-resource-authority-conflict'

test('B2-B0 RED: delete+recreate at equal revision must refuse a stale draft', async (t) => {
  const { ctx, library } = await boot(new MemoryTable())
  t.after(() => ctx.fiber.dispose())

  await library.createPrompt('same-id', { name: 'original', content: 'first' }, createBasis(library))
  const oldBasis = mutationBasis(library, 'same-id')
  const oldRevision = oldBasis.revision
  await library.deletePrompt('same-id', oldBasis)
  await library.createPrompt('same-id', { name: 'replacement', content: 'second' }, createBasis(library))
  assert.equal(library.get('same-id').resource.revision, oldRevision)

  await assert.rejects(
    library.replacePrompt('same-id', { name: 'stale edit', content: 'unsafe' }, oldBasis),
    isIncarnationConflict,
  )
  assert.equal(library.get('same-id').resource.content, 'second')
})

test('B2-B0 RED: reopening a storage-backed library with equal revision must reject the old authority', async (t) => {
  const table = new MemoryTable()
  const first = await boot(table)
  await first.library.createPrompt('same-id', { name: 'original', content: 'first' }, createBasis(first.library))
  const oldBasis = mutationBasis(first.library, 'same-id')
  const oldRevision = oldBasis.revision
  await first.ctx.fiber.dispose()

  const second = await boot(table)
  t.after(() => second.ctx.fiber.dispose())
  assert.equal(second.library.get('same-id').resource.revision, oldRevision)

  await assert.rejects(
    second.library.replacePrompt('same-id', { name: 'stale edit', content: 'unsafe' }, oldBasis),
    isAuthorityConflict,
  )
  assert.equal(second.library.get('same-id').resource.content, 'first')
})

test('B2-B0: newly created incarnation is stable through edits and unique after recreation', async (t) => {
  const { ctx, library } = await boot(new MemoryTable())
  t.after(() => ctx.fiber.dispose())
  await library.createPrompt('alpha', { name: 'A', content: 'original' }, createBasis(library))
  const first = mutationBasis(library, 'alpha')
  assert.match(first.incarnationId, /^[0-9a-f-]{36}$/i)
  await library.setPromptContent('alpha', 'edited', first)
  const edited = mutationBasis(library, 'alpha')
  assert.equal(edited.incarnationId, first.incarnationId)
  assert.equal(edited.revision, first.revision + 1)
  await library.deletePrompt('alpha', edited)
  await library.createPrompt('alpha', { name: 'B', content: 'new' }, createBasis(library))
  const next = mutationBasis(library, 'alpha')
  assert.notEqual(next.incarnationId, first.incarnationId)
  assert.equal(next.revision, 1)
  await assert.rejects(library.setPromptName('alpha', 'stale', first), isIncarnationConflict)
  assert.equal(library.get('alpha').resource.name, 'B')
})

test('B2-B0: legacy resource acquires incarnation on its first successful leaf edit only', async (t) => {
  const table = new MemoryTable(new Map([['legacy', {
    name: 'Legacy', content: 'original', revision: 8, opaque: { preserve: [1, 2] },
  }]]))
  const { ctx, library } = await boot(table)
  t.after(() => ctx.fiber.dispose())
  const original = mutationBasis(library, 'legacy')
  assert.equal(original.incarnationId, null)
  assert.equal(library.get('legacy').resource.__dshCmResourceIncarnation, undefined)
  await library.setPromptName('legacy', 'Renamed', original)
  const upgraded = mutationBasis(library, 'legacy')
  assert.equal(typeof upgraded.incarnationId, 'string')
  assert.equal(upgraded.revision, 9)
  assert.deepEqual(library.get('legacy').resource.opaque, { preserve: [1, 2] })
  await assert.rejects(library.setPromptContent('legacy', 'unsafe', original), isIncarnationConflict)
  assert.equal(library.get('legacy').resource.content, 'original')
  await library.setPromptContent('legacy', 'updated', upgraded)
  assert.equal(mutationBasis(library, 'legacy').incarnationId, upgraded.incarnationId)
})

test('B2-B0: malformed incarnation and reserved authoring keys fail closed without writes', async (t) => {
  const table = new MemoryTable()
  const { ctx, library } = await boot(table)
  t.after(() => ctx.fiber.dispose())
  await assert.rejects(library.createPrompt('bad', {
    name: 'bad', content: 'body', __dshCmResourceIncarnation: 'user-injected',
  }, createBasis(library)), e => e instanceof ContextManagerError && e.code === 'invalid-prompt-resource')
  assert.equal(table.records.has('bad'), false)
  await library.createPrompt('safe', { name: 'safe', content: 'body' }, createBasis(library))
  const basis = mutationBasis(library, 'safe')
  await assert.rejects(library.replacePrompt('safe', {
    name: 'unsafe', content: 'unsafe', __dshCmResourceIncarnation: 'user-injected',
  }, basis), e => e instanceof ContextManagerError && e.code === 'invalid-prompt-resource')
  assert.equal(library.get('safe').resource.content, 'body')
  table.records.set('corrupt', {
    name: 'corrupt', content: 'text', revision: 3, __dshCmResourceIncarnation: 42,
  })
  assert.equal(library.list().find(item => item.id === 'corrupt')?.status, 'invalid')
  await assert.rejects(
    library.setPromptName('corrupt', 'cannot edit', {
      ...createBasis(library), resourceId: 'corrupt', incarnationId: null, revision: 3,
    }),
    e => e instanceof ContextManagerError && e.code === 'prompt-resource-path-not-editable',
  )
  assert.equal(table.records.get('corrupt').name, 'corrupt')
})

test('B2-B0: stale revision and mismatched resource ID reject independently of incarnation', async (t) => {
  const { ctx, library } = await boot(new MemoryTable())
  t.after(() => ctx.fiber.dispose())
  await library.createPrompt('one', { name: 'one', content: 'one' }, createBasis(library))
  await library.createPrompt('two', { name: 'two', content: 'two' }, createBasis(library))
  const one = mutationBasis(library, 'one')
  await assert.rejects(
    library.replacePrompt('one', { name: 'changed', content: 'changed' }, { ...one, revision: 9 }),
    e => e instanceof ContextManagerError && e.code === 'prompt-resource-conflict',
  )
  await assert.rejects(
    library.deletePrompt('two', one),
    e => e instanceof ContextManagerError && e.code === 'invalid-prompt-resource',
  )
  assert.equal(library.get('one').resource.content, 'one')
  assert.equal(library.get('two').resource.content, 'two')
})

test('B2-B0: actual PromptLibrary plus Remote leaf calls preserve opaque data and reject stale legacy basis', async (t) => {
  const table = new MemoryTable(new Map([['real', {
    name: 'Original',
    description: 'first description',
    content: 'first body',
    revision: 5,
    opaque: { keep: ['a', 'b'] },
  }]]))
  const { ctx, library } = await boot(table)
  t.after(() => ctx.fiber.dispose())
  await ctx.plugin(ContextManagerChangeTracker)
  await ctx.plugin(ContextManagerRemoteService)
  const remote = ctx.dshContextRemote

  const authority = remote.changes().resourceAuthorityId
  assert.equal(authority, library.resourceWriteAuthority())
  const legacy = {
    resourceAuthorityId: authority,
    resourceId: 'real',
    incarnationId: null,
    revision: 5,
  }

  let saved = await remote.setPromptResourceName('real', 'Renamed', legacy)
  assert.deepEqual(saved, { ok: true, value: { id: 'real', revision: 6 } })
  const first = library.get('real').resource
  assert.match(first.__dshCmResourceIncarnation, /^[0-9a-f-]{36}$/i)
  assert.deepEqual(first.opaque, { keep: ['a', 'b'] })
  assert.equal(first.description, 'first description')
  assert.equal(first.content, 'first body')

  const rejectedLegacy = await remote.setPromptResourceContent('real', 'stale body', legacy)
  assert.equal(rejectedLegacy.ok, false)
  assert.equal(rejectedLegacy.error.code, 'prompt-resource-incarnation-conflict')

  const basis = (revision) => ({
    ...legacy, revision, incarnationId: library.get('real').resource.__dshCmResourceIncarnation,
  })
  saved = await remote.setPromptResourceDescription('real', null, basis(6))
  assert.deepEqual(saved, { ok: true, value: { id: 'real', revision: 7 } })
  assert.equal(Object.hasOwn(library.get('real').resource, 'description'), false)
  saved = await remote.setPromptResourceContent('real', 'unicode 文本', basis(7))
  assert.deepEqual(saved, { ok: true, value: { id: 'real', revision: 8 } })
  assert.equal(library.get('real').resource.content, 'unicode 文本')
  assert.deepEqual(library.get('real').resource.opaque, { keep: ['a', 'b'] })
  assert.equal(library.get('real').resource.__dshCmResourceIncarnation, first.__dshCmResourceIncarnation)

  const wrongAuthority = await remote.setPromptResourceContent('real', 'illegal', {
    ...basis(8), resourceAuthorityId: 'old-provider',
  })
  assert.equal(wrongAuthority.ok, false)
  assert.equal(wrongAuthority.error.code, 'prompt-resource-authority-conflict')
  const wrongRevision = await remote.setPromptResourceContent('real', 'illegal', basis(7))
  assert.equal(wrongRevision.ok, false)
  assert.equal(wrongRevision.error.code, 'prompt-resource-conflict')
  assert.equal(table.records.get('real').content, 'unicode 文本')
  assert.equal(table.records.get('real').revision, 8)
})
