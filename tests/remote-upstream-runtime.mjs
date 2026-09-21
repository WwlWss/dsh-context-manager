import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'

import { TYPERT } from '../lib/typert.host.js'
import { TYPERT_REMOTE } from '../lib/typert.remote-client.js'
import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  ContextManagerRemoteService,
} from '../lib/index.js'

function assertDualStrictCodec(codec, subject) {
  assert.equal(codec.mode, 'strict', `${subject} must stay strict`)
  assert.equal(typeof codec.schema?.parse, 'function', `${subject} must retain the legacy schema ABI`)
  assert.equal(typeof codec.create, 'function', `${subject} must expose the current factory ABI`)
  assert.equal(codec.create(), codec.schema, `${subject} factory must return the generated schema`)
}

const ctx = new Context()
const registryFiber = ctx.plugin(TypertRegistry)
await registryFiber
const remoteFiber = ctx.plugin(ContextManagerRemoteService)
await remoteFiber
const gatewayFiber = ctx.plugin(TypertGatewayService)
await gatewayFiber

const disposeContribution = ctx.typert.register(TYPERT)
try {
  const strict = ctx.typert.local.get('contextManager/protocol')
  assert.ok(strict, 'generated strict descriptor must be registered')
  assert.equal(strict.id, 'dsh-context-manager#contextManager/protocol')
  assert.equal(strict.service, 'dshContextRemote')
  assert.equal(strict.namespace, 'contextManager')
  assert.equal(strict.method, 'protocol')
  assertDualStrictCodec(strict.result, 'Host protocol result')

  assert.equal(TYPERT_REMOTE.package, 'dsh-context-manager')
  assert.equal(TYPERT_REMOTE.descriptors.length, 1)
  assert.equal(TYPERT_REMOTE.descriptors[0].id, strict.id)
  assertDualStrictCodec(TYPERT_REMOTE.descriptors[0].result, 'Remote protocol result')

  const value = await ctx.typertGateway.invoke({
    namespace: 'contextManager',
    method: 'protocol',
    args: {},
  })
  assert.deepEqual(value, { apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION })
} finally {
  await disposeContribution()
  await gatewayFiber.dispose()
  await remoteFiber.dispose()
  await registryFiber.dispose()
}
