import assert from 'node:assert/strict'
import test from 'node:test'

import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'

import { ContextManagerRemoteController } from '../lib/index.js'

test('M6A production controller installs the public Remote marker without decorator syntax', async () => {
  const ctx = new Context()
  await ctx.plugin(ContextManagerRemoteController)

  const service = ctx.dshContextRemote
  assert.ok(service)

  const methods = remoteMethods(service)
  assert.deepEqual(methods, [{
    method: 'protocol',
    invocation: { kind: 'direct' },
  }])

  assert.deepEqual(service.protocol(), {
    apiVersion: 1,
    transport: 'typert',
    strict: true,
  })

  await ctx.fiber.dispose()
})
