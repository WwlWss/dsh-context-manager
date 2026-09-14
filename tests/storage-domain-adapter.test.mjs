import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context, Service } from '@deepseek-ai/cordis'
import { openPromptStorage } from '../lib/adapters/storage-domain.js'

class InvalidTableStorageDomain extends Service {
  constructor(ctx, state) {
    super(ctx, 'storageDomain')
    this.state = state
  }

  async open() {
    const state = this.state
    return {
      table() {
        return { get() {} }
      },
      async close() {
        state.closeCount += 1
      },
    }
  }
}

test('an opened native domain is closed when table capability validation fails', async () => {
  const state = { closeCount: 0 }
  const ctx = new Context()
  try {
    await ctx.plugin(InvalidTableStorageDomain, state)
    await assert.rejects(
      openPromptStorage(ctx, {
        name: 'test_prompt_storage',
        version: 1,
        tables: { resources: { valueSchema: { parse: value => value } } },
      }, 'resources'),
      error => error instanceof TypeError && /storageDomain table\.entries\(\)/.test(error.message),
    )
    assert.equal(state.closeCount, 1)
  } finally {
    await ctx.fiber.dispose()
  }
})
