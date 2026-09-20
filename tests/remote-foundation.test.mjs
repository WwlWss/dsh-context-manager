import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { test } from 'node:test'

import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  ContextManagerRemoteService,
} from '../lib/index.js'

test('M6A protocol service exposes only stable wire metadata', async () => {
  const ctx = new Context()
  await ctx.plugin(ContextManagerRemoteService)

  assert.deepEqual(ctx.dshContextRemote.protocol(), {
    apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION,
  })
  assert.equal(ctx.dshContextRemote.typertRemote.serviceKey, 'dshContextRemote')
  assert.equal(ctx.dshContextRemote.typertRemote.namespace, 'contextManager')

  await ctx.dispose()
})
