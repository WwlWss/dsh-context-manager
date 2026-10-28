import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  ContextManagerRemoteErrorCode,
  ContextManagerRemoteResult,
  ContextManagerRemoteMutationReceipt,
  ContextManagerRemoteDeleteReceipt,
  ContextManagerRemoteResourceMutationBasis,
  ContextManagerRemoteResourceCreateBasis,
} from '../src/remote/types.js'
import type { ContextManagerClientPromptResourceReadStamp } from '../src/client/model-types.js'
import type { ContextManagerClientResourceMutationRemote } from '../src/client/remote-port.js'
import {
  createContextManagerResourceMutationController,
  type ContextManagerResourceMutationControllerDeps,
} from '../src/client/resource-mutation-controller.js'

function ok<T>(value: T): RemoteResult<T> { return { ok: true, value } }
function accepted<T>(value: T): ContextManagerRemoteResult<T> { return { ok: true, value } }
function rejected<T>(code: ContextManagerRemoteErrorCode): ContextManagerRemoteResult<T> {
  return { ok: false, error: { code, message: 'Expected test business refusal' } }
}
function transportFail<T>(): RemoteResult<T> {
  return {
    ok: false,
    error: {
      name: 'RemoteError',
      message: 'Connection dropped',
      code: 'test-disconnected',
      details: undefined,
      isDSHRemoteError: true,
    },
  } as unknown as RemoteResult<T>
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

type WriteReply = RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>
type DeleteReply = RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteDeleteReceipt>>
type Recorded = {
  readonly method: string
  readonly id: string
  readonly args: readonly unknown[]
  readonly basis: ContextManagerRemoteResourceMutationBasis | ContextManagerRemoteResourceCreateBasis
}

function fixture() {
  const stamp: ContextManagerClientPromptResourceReadStamp = {
    instanceId: 'profile-owner-A',
    resourceAuthorityId: 'library-A',
    resourceId: 'alpha',
    incarnationId: 'incarnation-A',
    revision: 5,
    source: 'document',
  }
  let currentStamp: ContextManagerClientPromptResourceReadStamp | undefined = { ...stamp }
  let authority: string | undefined = 'library-A'
  let lifecycle: 'attached' | 'detached' | 'disposed' = 'attached'
  let protocol: 'compatible' | 'checking' | 'incompatible' = 'compatible'
  let cached = false
  let freshRecovery = true
  let onInvalidate: (() => void) | undefined
  let nextWrite: (() => Promise<WriteReply>) | undefined
  let nextDelete: (() => Promise<DeleteReply>) | undefined
  const calls: Recorded[] = []
  const invalidated: string[] = []
  const recoveries: Array<{ id: string; refreshDocument: boolean; authority: string }> = []
  const write = (method: string, id: string, args: readonly unknown[], basis: Recorded['basis']): Promise<WriteReply> => {
    calls.push({ method, id, args, basis })
    const fn = nextWrite
    nextWrite = undefined
    return fn ? fn() : Promise.resolve(ok(accepted({ id, revision: 6 })))
  }
  const remote: ContextManagerClientResourceMutationRemote = {
    createPromptResource: (id, input, basis) => write('create', id, [input], basis),
    replacePromptResource: (id, input, basis) => write('replace', id, [input], basis),
    deletePromptResource: (id, basis) => {
      calls.push({ method: 'delete', id, args: [], basis })
      const fn = nextDelete
      nextDelete = undefined
      return fn ? fn() : Promise.resolve(ok(accepted({ id })))
    },
    setPromptResourceName: (id, name, basis) => write('name', id, [name], basis),
    setPromptResourceDescription: (id, value, basis) => write('description', id, [value], basis),
    setPromptResourceContent: (id, content, basis) => write('content', id, [content], basis),
  }
  let attachedRemote: ContextManagerClientResourceMutationRemote | undefined = remote
  const deps: ContextManagerResourceMutationControllerDeps = {
    getRemote: () => attachedRemote,
    getLifecycle: () => lifecycle,
    getProtocolStatus: () => protocol,
    getCurrentCreateBasis: () => authority === undefined ? undefined : { resourceAuthorityId: authority },
    getCurrentReadStamp: (id, source) => id === currentStamp?.resourceId && source === currentStamp.source ? currentStamp : undefined,
    invalidate: id => {
      invalidated.push(id)
      onInvalidate?.()
    },
    rehydrate: async request => {
      recoveries.push({ id: request.id, refreshDocument: request.refreshDocument, authority: request.resourceAuthorityId })
      return freshRecovery
    },
    isDocumentCached: () => cached,
  }
  const handle = createContextManagerResourceMutationController(deps)
  return {
    stamp, handle, calls, invalidated, recoveries,
    setReadStamp(v: ContextManagerClientPromptResourceReadStamp | undefined) { currentStamp = v },
    setAuthority(v: string | undefined) { authority = v },
    setLifecycle(v: 'attached' | 'detached' | 'disposed') { lifecycle = v },
    setProtocol(v: 'compatible' | 'checking' | 'incompatible') { protocol = v },
    setCached(v: boolean) { cached = v },
    setRecovery(v: boolean) { freshRecovery = v },
    onInvalidate(fn?: () => void) { onInvalidate = fn },
    onWrite(fn: () => Promise<WriteReply>) { nextWrite = fn },
    onDelete(fn: () => Promise<DeleteReply>) { nextDelete = fn },
    setRemote(v: ContextManagerClientResourceMutationRemote | undefined) { attachedRemote = v },
    basis() { return { resourceAuthorityId: 'library-A' } },
  }
}

function preconditionCode(result: Awaited<ReturnType<ReturnType<typeof fixture>['handle']['controller']['setPromptResourceName']>>) {
  return result.status === 'rejected' && result.error.kind === 'precondition'
    ? result.error.code : undefined
}

test('all six Resource methods forward exact v3 wire basis and preserve null clearing', async () => {
  const f = fixture()
  const { controller } = f.handle
  const input = { name: 'Name', description: 'Desc', content: 'Body' }
  assert.equal((await controller.createPromptResource(f.basis(), 'beta', input)).status, 'applied')
  assert.equal((await controller.replacePromptResource(f.stamp, input)).status, 'applied')
  assert.equal((await controller.deletePromptResource(f.stamp)).status, 'applied')
  assert.equal((await controller.setPromptResourceName(f.stamp, 'Renamed')).status, 'applied')
  assert.equal((await controller.setPromptResourceDescription(f.stamp, null)).status, 'applied')
  assert.equal((await controller.setPromptResourceContent(f.stamp, 'Changed')).status, 'applied')
  assert.deepEqual(f.calls.map(x => x.method), ['create', 'replace', 'delete', 'name', 'description', 'content'])
  assert.deepEqual(f.calls[0]?.basis, { resourceAuthorityId: 'library-A' })
  for (const call of f.calls.slice(1)) {
    assert.deepEqual(call.basis, {
      resourceAuthorityId: 'library-A', resourceId: 'alpha', incarnationId: 'incarnation-A', revision: 5,
    })
    assert.equal('instanceId' in call.basis, false)
    assert.equal('source' in call.basis, false)
  }
  assert.deepEqual(f.calls[4]?.args, [null])
  assert.deepEqual(f.recoveries.map(x => x.refreshDocument), [false, true, false, false, false, true])
  assert.deepEqual(f.invalidated, ['beta', 'beta', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha', 'alpha'])
})

test('resource single-flight rejects a second Resource request without clobbering running state', async () => {
  const f = fixture()
  const gate = deferred<WriteReply>()
  f.onWrite(() => gate.promise)
  const pending = f.handle.controller.setPromptResourceName(f.stamp, 'First')
  assert.equal(f.calls.length, 1)
  assert.equal(f.handle.controller.state.getSnapshot().resource.status, 'running')
  const busy = await f.handle.controller.setPromptResourceContent(f.stamp, 'Second')
  assert.equal(preconditionCode(busy), 'busy')
  assert.equal(f.handle.controller.state.getSnapshot().resource.status, 'running')
  assert.equal(f.calls.length, 1)
  gate.resolve(ok(accepted({ id: 'alpha', revision: 6 })))
  assert.deepEqual(await pending, { status: 'applied', refresh: 'fresh' })
  assert.equal(f.calls.length, 1)
})

test('client refuses stale incarnation/revision and unavailable source, but does not equate Profile instance to Resource authority', async () => {
  const f = fixture()
  f.setReadStamp({ ...f.stamp, revision: 6 })
  assert.equal(preconditionCode(await f.handle.controller.setPromptResourceName(f.stamp, 'old')), 'resource-basis-stale')
  f.setReadStamp(undefined)
  assert.equal(preconditionCode(await f.handle.controller.setPromptResourceName(f.stamp, 'old')), 'resource-basis-unavailable')
  f.setReadStamp({ ...f.stamp, instanceId: 'profile-owner-B' })
  assert.equal((await f.handle.controller.setPromptResourceName(f.stamp, 'still-safe')).status, 'applied')
  assert.equal(f.calls.length, 1)
})

test('Resource Authority transition supersedes delayed RPC without issuing a second write', async () => {
  const f = fixture()
  const gate = deferred<WriteReply>()
  f.onWrite(() => gate.promise)
  f.handle.observeResourceAuthority('library-A')
  const pending = f.handle.controller.setPromptResourceName(f.stamp, 'First')
  f.setAuthority('library-B')
  f.handle.observeResourceAuthority('library-B')
  gate.resolve(ok(accepted({ id: 'alpha', revision: 6 })))
  assert.deepEqual(await pending, { status: 'superseded' })
  assert.equal(f.calls.length, 1)
  assert.equal(f.recoveries.length, 0)
})

test('synchronous running subscriber can detach before the Remote write begins', async () => {
  const f = fixture()
  const off = f.handle.controller.state.subscribe(() => {
    if (f.handle.controller.state.getSnapshot().resource.status === 'running') {
      f.setLifecycle('detached')
      f.setRemote(undefined)
    }
  })
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Blocked')
  off()
  assert.equal(result.status, 'detached')
  assert.equal(f.calls.length, 0)
})

test('post-invalidation Authority transition fences dispatch and never calls the old Remote', async () => {
  const f = fixture()
  f.handle.observeResourceAuthority('library-A')
  f.onInvalidate(() => {
    f.setAuthority('library-B')
    f.handle.observeResourceAuthority('library-B')
  })
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Blocked')
  assert.equal(result.status, 'superseded')
  assert.equal(f.calls.length, 0)
})

test('confirmed success with failed read recovery stays applied-degraded', async () => {
  const f = fixture()
  f.setRecovery(false)
  assert.deepEqual(await f.handle.controller.setPromptResourceName(f.stamp, 'Name'), { status: 'applied', refresh: 'degraded' })
  assert.equal(f.calls.length, 1)
})

test('revision conflict is rejected and recovered without any write retry', async () => {
  const f = fixture()
  f.onWrite(async () => ok(rejected('prompt-resource-conflict')))
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Conflict')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.error.kind === 'business' ? result.error.code : undefined, 'prompt-resource-conflict')
  assert.equal(f.calls.length, 1)
  assert.equal(f.recoveries.length, 1)
})

test('transport outcome unknown remains unknown even when authoritative reads are fresh', async () => {
  const f = fixture()
  f.onWrite(async () => transportFail())
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Same content')
  assert.equal(result.status, 'unknown')
  assert.equal(result.status === 'unknown' ? result.refresh : undefined, 'fresh')
  assert.equal(f.calls.length, 1)
})

test('immutable captured stamp is used on the Host wire even if a synchronous observer mutates the draft object', async () => {
  const f = fixture()
  const editableStamp = { ...f.stamp }
  const off = f.handle.controller.state.subscribe(() => {
    if (f.handle.controller.state.getSnapshot().resource.status === 'running') {
      editableStamp.revision = 12345
      editableStamp.incarnationId = 'attacker'
    }
  })
  const result = await f.handle.controller.setPromptResourceName(editableStamp, 'Safe')
  off()
  assert.equal(result.status, 'applied')
  assert.deepEqual(f.calls[0]?.basis, {
    resourceAuthorityId: 'library-A',
    resourceId: 'alpha',
    incarnationId: 'incarnation-A',
    revision: 5,
  })
})

test('create and replace capture payload values before synchronous publication can change caller draft', async () => {
  const f = fixture()
  const input = { name: 'Original', description: 'unchanged', content: 'Original content' }
  const unsubscribe = f.handle.controller.state.subscribe(() => {
    if (f.handle.controller.state.getSnapshot().resource.status === 'running') {
      input.name = 'Mutated by a subscriber'
      input.content = 'Unexpected content'
    }
  })
  assert.equal((await f.handle.controller.createPromptResource(f.basis(), 'beta', input)).status, 'applied')
  unsubscribe()
  assert.deepEqual(f.calls[0]?.args[0], {
    name: 'Original', description: 'unchanged', content: 'Original content',
  })

  const edit = { name: 'Replace', content: 'Body' }
  const off = f.handle.controller.state.subscribe(() => {
    if (f.handle.controller.state.getSnapshot().resource.status === 'running') {
      edit.content = 'Unexpected replacement'
    }
  })
  assert.equal((await f.handle.controller.replacePromptResource(f.stamp, edit)).status, 'applied')
  off()
  assert.deepEqual(f.calls[1]?.args[0], { name: 'Replace', content: 'Body' })
})

test('local rejected edit publishes a settled resource operation without Remote dispatch', async () => {
  const f = fixture()
  f.setReadStamp({ ...f.stamp, revision: 6 })
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Stale')
  assert.equal(preconditionCode(result), 'resource-basis-stale')
  const operation = f.handle.controller.state.getSnapshot().resource
  assert.equal(operation.status, 'settled')
  assert.equal(operation.status === 'settled' ? operation.result.status : undefined, 'rejected')
  assert.equal(f.calls.length, 0)
})

test('P2 RED: a definitive invalid-resource refusal performs read-only recovery after dispatch', async () => {
  const f = fixture()
  f.setCached(true)
  f.onWrite(async () => ok(rejected('invalid-prompt-resource')))
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Correctable')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'fresh')
  assert.equal(result.status === 'rejected' && result.error.kind === 'business'
    ? result.error.code : undefined, 'invalid-prompt-resource')
  assert.equal(f.calls.length, 1, 'business refusal must never cause a second mutation')
  assert.equal(f.recoveries.length, 1, 'invalid refusal must rehydrate already invalidated surfaces')
  assert.equal(f.recoveries[0]?.refreshDocument, true)
})

test('P2 RED: write-preflight invalidate with transient protocol checking refuses without claiming authority supersession', async () => {
  const f = fixture()
  f.setRecovery(false)
  f.onInvalidate(() => f.setProtocol('checking'))
  const result = await f.handle.controller.setPromptResourceName(f.stamp, 'Not dispatched')
  assert.equal(result.status, 'rejected')
  assert.equal(preconditionCode(result), 'protocol-unavailable')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'degraded')
  assert.equal(f.calls.length, 0)
  assert.equal(f.recoveries.length, 1, 'own invalidation needs a recovery attempt')
  assert.equal(f.handle.controller.state.getSnapshot().resource.status, 'settled')
})

test('P2 RED: a known business refusal with recovery failure preserves the original code', async () => {
  const f = fixture()
  f.setRecovery(false)
  f.onWrite(async () => ok(rejected('prompt-resource-path-not-editable')))
  const result = await f.handle.controller.replacePromptResource(f.stamp, {
    name: 'Replacement', content: 'Content',
  })
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.error.kind === 'business'
    ? result.error.code : undefined, 'prompt-resource-path-not-editable')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'degraded')
  assert.equal(f.calls.length, 1)
  assert.equal(f.recoveries.length, 1)
})
