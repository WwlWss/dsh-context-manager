import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import { ContextManagerPromptLibrary } from '../lib/index.js'

class StorageDomainFixture extends Service {
  constructor(ctx, state) {
    super(ctx, 'storageDomain')
    this.state = state
  }
  async open() {
    const state = this.state
    return {
      table() { return { get() {} } },
      async close() { state.closed += 1 },
    }
  }
}

test('storage adapter releases an acquired domain after table contract rejection', async () => {
  const ctx = new Context()
  const state = { closed: 0 }
  try {
    await ctx.plugin(StorageDomainFixture, state)
    await assert.rejects(async () => {
      await ctx.plugin(ContextManagerPromptLibrary)
    })
    assert.equal(state.closed, 1)
  } finally {
    await ctx.fiber.dispose()
  }
})
