import assert from 'node:assert/strict'

import { Context } from '@deepseek-ai/cordis'
import TypertGateway from '@deepseek-ai/dsh-api-gateway'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'

import { ContextManagerRemoteController } from '../lib/index.js'
import { TYPERT } from '../lib/typert.host.js'

const ctx = new Context()
await ctx.plugin(TypertRegistry)
await ctx.plugin(TypertGateway)
await ctx.plugin(ContextManagerRemoteController)

const dispose = ctx.typert.register(TYPERT)
const endpoint = 'contextManager/protocol'
const generatedInvocation = TYPERT.invocations.find(candidate =>
  candidate.namespace === 'contextManager' && candidate.method === 'protocol')
assert.ok(generatedInvocation, 'generated Host contribution must carry the protocol invocation')
assert.equal(generatedInvocation.result.mode, 'strict')
assert.equal('schema' in generatedInvocation.result, true, 'legacy strict codec field must remain present')
assert.equal('create' in generatedInvocation.result, true, 'current lazy strict codec field must be present')
assert.throws(
  () => generatedInvocation.result.schema.parse({ apiVersion: 'bad', transport: 'typert', strict: true }),
  'legacy schema codec must reject an invalid protocol result',
)
assert.throws(
  () => generatedInvocation.result.create().parse({ apiVersion: 'bad', transport: 'typert', strict: true }),
  'current lazy codec must reject an invalid protocol result',
)

const descriptor = ctx.typert.local.get(endpoint)

assert.ok(descriptor, 'generated Host contribution must register the strict endpoint')
assert.equal(descriptor.namespace, 'contextManager')
assert.equal(descriptor.method, 'protocol')
assert.equal(descriptor.result.mode, 'strict')

const result = await ctx.typertGateway.invoke({
  namespace: 'contextManager',
  method: 'protocol',
  args: {},
})

assert.deepEqual(result, {
  apiVersion: 1,
  transport: 'typert',
  strict: true,
})

dispose()
assert.equal(ctx.typert.local.get(endpoint), undefined, 'disposing the contribution must withdraw strict metadata')

const srcFallbackResult = await ctx.typertGateway.invoke({
  namespace: 'contextManager',
  method: 'protocol',
  args: {},
})
assert.deepEqual(srcFallbackResult, result, 'runtime decorator remains callable after strict metadata withdrawal')

const disposeReload = ctx.typert.register(TYPERT)
assert.ok(ctx.typert.local.get(endpoint), 'strict metadata must be re-registerable after disposal')
disposeReload()

await ctx.fiber.dispose()
