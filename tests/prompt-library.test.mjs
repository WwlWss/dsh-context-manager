import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'

import {
  ContextManagerError,
  ContextManagerPromptLibrary,
} from '../lib/index.js'

class MemoryTable {
  constructor(records = new Map()) {
    this.records = records
  }

  get(key) {
    return this.records.get(key)
  }

  entries() {
    return new Map(this.records).entries()
  }

  async put(key, value) {
    this.records.set(key, structuredClone(value))
  }

  async delete(key) {
    return this.records.delete(key)
  }

  async update(key, update) {
    const current = this.records.get(key)
    if (current === undefined) throw new Error(`missing key ${key}`)
    const next = update(current)
    this.records.set(key, structuredClone(next))
    return this.records.get(key)
  }
}

class MemoryStorageDomain extends Service {
  constructor(ctx, state) {
    super(ctx, 'storageDomain')
    this.state = state
  }

  async open(spec) {
    this.state.openedSpecs.push(spec)
    this.state.openCount += 1
    const state = this.state
    const table = state.table
    let closed = false
    return {
      table(name) {
        assert.equal(name, 'resources')
        return table
      },
      async close() {
        if (closed) return
        closed = true
        state.closeCount += 1
      },
    }
  }
}

function memoryState() {
  return {
    table: new MemoryTable(),
    openedSpecs: [],
    openCount: 0,
    closeCount: 0,
  }
}

async function boot(state = memoryState()) {
  const ctx = new Context()
  await ctx.plugin(MemoryStorageDomain, state)
  await ctx.plugin(ContextManagerPromptLibrary)
  return {
    ctx,
    library: ctx.dshContextPromptLibrary,
    state,
  }
}

async function rejectsCode(promise, code) {
  await assert.rejects(promise, error => {
    assert.ok(error instanceof ContextManagerError)
    assert.equal(error.code, code)
    return true
  })
}

test('opens exactly one model-inert storage domain with the expected stable shape', async (t) => {
  const { ctx, state } = await boot()
  t.after(() => ctx.fiber.dispose())

  assert.equal(state.openCount, 1)
  assert.equal(state.openedSpecs[0].name, 'dsh_context_manager_prompts')
  assert.equal(state.openedSpecs[0].version, 1)
  assert.deepEqual(Object.keys(state.openedSpecs[0].tables), ['resources'])
})

test('create preserves ids and prompt text literally and starts revision at one', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())

  const id = '  /Prompt/__proto__/日本語  '
  const content = '  leading\r\n中文\n日本語 {{variable}} {{unknown}}\ntrailing  '
  const created = await library.createPrompt(id, {
    name: '  Name  ',
    description: '',
    content,
  })

  assert.equal(created.id, id)
  assert.equal(created.resource.name, '  Name  ')
  assert.equal(created.resource.description, '')
  assert.equal(created.resource.content, content)
  assert.equal(created.resource.revision, 1)
  assert.deepEqual(library.list().map(item => item.id), [id])
})

test('duplicate create is explicit and never overwrites the first resource', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())

  await library.createPrompt('same', { name: 'first', content: 'A' })
  await rejectsCode(
    library.createPrompt('same', { name: 'second', content: 'B' }),
    'prompt-resource-exists',
  )
  assert.equal(library.get('same').resource.content, 'A')
  assert.equal(library.get('same').resource.revision, 1)
})

test('narrow writes fence on the current resource revision', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())

  const created = await library.createPrompt('revision', { name: 'n', content: 'v1' })
  const updated = await library.setPromptContent('revision', 'v2', created.resource.revision)
  assert.equal(updated.resource.content, 'v2')
  assert.equal(updated.resource.revision, 2)

  await rejectsCode(
    library.setPromptName('revision', 'stale', 1),
    'prompt-resource-conflict',
  )
  assert.equal(library.get('revision').resource.name, 'n')
  assert.equal(library.get('revision').resource.revision, 2)
})

test('replace and leaf edits preserve unknown future siblings', async (t) => {
  const state = memoryState()
  state.table.records.set('future', {
    name: 'old',
    description: 'old description',
    content: 'old content',
    revision: 7,
    futureField: { opaque: ['keep', 1] },
  })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())

  const replaced = await library.replacePrompt('future', {
    name: 'new',
    content: 'new content',
  }, 7)
  assert.equal(replaced.resource.revision, 8)
  assert.equal(Object.hasOwn(replaced.resource, 'description'), false)
  assert.deepEqual(replaced.resource.futureField, { opaque: ['keep', 1] })

  const described = await library.setPromptDescription('future', 'desc', 8)
  assert.equal(described.resource.revision, 9)
  assert.deepEqual(described.resource.futureField, { opaque: ['keep', 1] })

  const cleared = await library.setPromptDescription('future', undefined, 9)
  assert.equal(cleared.resource.revision, 10)
  assert.equal(Object.hasOwn(cleared.resource, 'description'), false)
  assert.deepEqual(cleared.resource.futureField, { opaque: ['keep', 1] })
})

test('get and list return detached snapshots that cannot mutate authoritative storage', async (t) => {
  const state = memoryState()
  state.table.records.set('detached', {
    name: 'n',
    content: 'c',
    revision: 1,
    futureField: { nested: ['safe'] },
  })
  const { ctx, library } = await boot(state)
  t.after(() => ctx.fiber.dispose())

  const first = library.get('detached')
  first.resource.futureField.nested.push('mutated outside')
  assert.deepEqual(library.get('detached').resource.futureField, { nested: ['safe'] })

  const listed = library.list()[0]
  listed.resource.futureField.nested.push('also detached')
  assert.deepEqual(library.get('detached').resource.futureField, { nested: ['safe'] })
})

test('delete is revision-fenced and removes only the named resource', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())

  await library.createPrompt('a', { name: 'a', content: 'A' })
  await library.createPrompt('b', { name: 'b', content: 'B' })
  await rejectsCode(library.deletePrompt('a', 2), 'prompt-resource-conflict')
  assert.equal(library.get('a').resource.content, 'A')

  await library.deletePrompt('a', 1)
  assert.deepEqual(library.list().map(item => item.id), ['b'])
  assert.throws(() => library.get('a'), error => {
    assert.ok(error instanceof ContextManagerError)
    assert.equal(error.code, 'prompt-resource-not-found')
    return true
  })
})

test('structured input rejects unknown authored fields instead of silently storing them', async (t) => {
  const { ctx, library } = await boot()
  t.after(() => ctx.fiber.dispose())

  await rejectsCode(
    library.createPrompt('bad', { name: 'n', content: 'c', invented: true }),
    'invalid-prompt-resource',
  )
  assert.equal(library.list().length, 0)
})

test('unload closes the owned domain so the same durable domain can be mounted again', async () => {
  const state = memoryState()
  const first = await boot(state)
  await first.ctx.fiber.dispose()
  assert.equal(state.closeCount, 1)

  const second = await boot(state)
  try {
    assert.equal(state.openCount, 2)
  } finally {
    await second.ctx.fiber.dispose()
  }
  assert.equal(state.closeCount, 2)
})

class MalformedStorageDomain extends Service {
  constructor(ctx) {
    super(ctx, 'storageDomain')
  }

  async open() {
    return {
      table() {
        return { get() {} }
      },
      async close() {},
    }
  }
}

test('malformed present storageDomain fails loud instead of becoming unavailable', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(MalformedStorageDomain)
    await assert.rejects(
      ctx.plugin(ContextManagerPromptLibrary),
      error => error instanceof TypeError && /storageDomain table\.entries\(\)/.test(error.message),
    )
  } finally {
    await ctx.fiber.dispose()
  }
})
