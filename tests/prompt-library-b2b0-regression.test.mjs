import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { ContextManagerError, ContextManagerPromptLibrary } from '../lib/index.js'

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
