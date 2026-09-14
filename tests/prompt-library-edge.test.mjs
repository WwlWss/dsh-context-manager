import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { ContextManagerError, ContextManagerPromptLibrary } from '../lib/index.js'

class EdgeTable {
  constructor() { this.records = new Map() }
  get(key) { return this.records.get(key) }
  entries() { return new Map(this.records).entries() }
  async put(key, value) { this.records.set(key, structuredClone(value)) }
  async delete(key) { return this.records.delete(key) }
  async update(key, update) {
    const next = update(this.records.get(key))
    this.records.set(key, structuredClone(next))
    return this.records.get(key)
  }
}

class EdgeStorageDomain extends Service {
  constructor(ctx, state) { super(ctx, 'storageDomain'); this.state = state }
  async open() {
    const state = this.state
    return { table() { return state.table }, async close() { state.closeCount += 1 } }
  }
}

async function rejectsInvalid(promise) {
  await assert.rejects(promise, error => error instanceof ContextManagerError && error.code === 'invalid-prompt-resource')
}

test('structured prompt authoring rejects additional lossy JSON shapes', async () => {
  const state = { table: new EdgeTable(), closeCount: 0 }
  const ctx = new Context()
  try {
    await ctx.plugin(EdgeStorageDomain, state)
    await ctx.plugin(ContextManagerPromptLibrary)
    const library = ctx.dshContextPromptLibrary

    await rejectsInvalid(library.createPrompt('infinity', { name: 'n', content: 'c', extra: Number.POSITIVE_INFINITY }))
    await rejectsInvalid(library.createPrompt('negative-zero', { name: 'n', content: 'c', extra: -0 }))

    const sparse = []
    sparse.length = 1
    await rejectsInvalid(library.createPrompt('sparse', { name: 'n', content: 'c', extra: sparse }))

    const nested = {}
    nested[['s', 'elf'].join('')] = nested
    await rejectsInvalid(library.createPrompt('ancestor', { name: 'n', content: 'c', extra: nested }))
    assert.equal(library.list().length, 0)
  } finally {
    await ctx.fiber.dispose()
  }
})

class InvalidTableStorageDomain extends Service {
  constructor(ctx, state) { super(ctx, 'storageDomain'); this.state = state }
  async open() {
    const state = this.state
    return {
      table() { return { get() {} } },
      async close() { state.closeCount += 1 },
    }
  }
}

test('prompt service releases an opened native domain when adapter validation fails', async () => {
  const state = { closeCount: 0 }
  const ctx = new Context()
  try {
    await ctx.plugin(InvalidTableStorageDomain, state)
    await assert.rejects(
      async () => { await ctx.plugin(ContextManagerPromptLibrary) },
      error => error instanceof TypeError && /storageDomain table\.entries\(\)/.test(error.message),
    )
    assert.equal(state.closeCount, 1)
  } finally {
    await ctx.fiber.dispose()
  }
})
