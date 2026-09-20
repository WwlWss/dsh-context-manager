import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'

import { TYPERT } from '../lib/typert.host.js'
import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  ContextManagerRemoteService,
} from '../lib/index.js'

const ctx = new Context()
await ctx.plugin(TypertRegistry)
await ctx.plugin(ContextManagerRemoteService)
await ctx.plugin(TypertGatewayService)

const disposeContribution = ctx.typert.register(TYPERT)
try {
  const strict = ctx.typert.local.get('contextManager/protocol')
  assert.ok(strict, 'generated strict descriptor must be registered')
  assert.equal(strict.id, 'dsh-context-manager#contextManager/protocol')
  assert.equal(strict.service, 'dshContextRemote')
  assert.equal(strict.namespace, 'contextManager')
  assert.equal(strict.method, 'protocol')
  assert.equal(strict.result.mode, 'strict')

  const value = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'protocol',
    args: {},
  })
  assert.deepEqual(value, { apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION })
} finally {
  await disposeContribution()
  await ctx.dispose()
}
