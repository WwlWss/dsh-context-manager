import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  type ContextManagerRemoteChangeSnapshot,
  type ContextManagerRemotePresetSnapshot,
  type ContextManagerRemoteProfilesSnapshot,
  type ContextManagerRemotePromptPlacementCapability,
  type ContextManagerRemoteProtocol,
} from '../src/remote/types.js'
import {
  CONTEXT_MANAGER_BASELINE_SURFACES,
  createContextManagerClientModel,
} from '../src/client/model.js'
import type { ContextManagerClientReadRemote } from '../src/client/remote-port.js'

type Step<T> = () => Promise<RemoteResult<T>>

function ok<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function fail<T>(code = 'test-remote-failure', message = 'test remote failure'): RemoteResult<T> {
  return {
    ok: false,
    error: {
      name: 'RemoteError',
      message,
      code,
      details: undefined,
      isDSHRemoteError: true,
    },
  } as unknown as RemoteResult<T>
}

function changes(
  instanceId = 'host-a',
  generation = 1,
  profiles = 1,
  presets = 1,
  runtime = 1,
): ContextManagerRemoteChangeSnapshot {
  return {
    instanceId,
    generation,
    profiles,
    promptResources: 0,
    presets,
    runtime,
  }
}

function profiles(revision: number): ContextManagerRemoteProfilesSnapshot {
  return {
    schemaVersion: 1,
    schemaCompatible: true,
    profiles: {},
    diagnostics: [],
    persistence: {
      available: true,
      registered: true,
      writable: true,
      revision,
    },
  }
}

function presets(label = 'default'): ContextManagerRemotePresetSnapshot {
  return {
    directory: {
      status: 'available',
      defaultId: label,
      authorable: true,
      presets: [],
    },
    profiles: {},
  }
}

function placement(
  status: 'available' | 'unavailable' = 'unavailable',
): ContextManagerRemotePromptPlacementCapability {
  if (status === 'unavailable') return { status: 'unavailable' }
  return {
    status: 'available',
    placements: {
      'before-persona': 'system-prompt',
      'after-persona': 'system-prompt',
      'before-tool-guidance': 'system-prompt',
      'after-tool-guidance': 'system-prompt',
      'runtime-context': 'runtime-context',
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

class ScriptedRemote implements ContextManagerClientReadRemote {
  readonly calls = {
    protocol: 0,
    changes: 0,
    profiles: 0,
    presets: 0,
    promptPlacement: 0,
  }

  readonly protocolSteps: Array<Step<ContextManagerRemoteProtocol>> = []
  readonly changesSteps: Array<Step<ContextManagerRemoteChangeSnapshot>> = []
  readonly profilesSteps: Array<Step<ContextManagerRemoteProfilesSnapshot>> = []
  readonly presetsSteps: Array<Step<ContextManagerRemotePresetSnapshot>> = []
  readonly placementSteps: Array<Step<ContextManagerRemotePromptPlacementCapability>> = []

  defaultProtocol: ContextManagerRemoteProtocol = {
    apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION,
  }
  defaultChanges = changes()
  defaultProfiles = profiles(7)
  defaultPresets = presets()
  defaultPlacement = placement()

  private async take<T>(
    queue: Array<Step<T>>,
    fallback: T,
  ): Promise<RemoteResult<T>> {
    const step = queue.shift()
    return step === undefined ? ok(fallback) : step()
  }

  protocol(): Promise<RemoteResult<ContextManagerRemoteProtocol>> {
    this.calls.protocol += 1
    return this.take(this.protocolSteps, this.defaultProtocol)
  }

  changes(): Promise<RemoteResult<ContextManagerRemoteChangeSnapshot>> {
    this.calls.changes += 1
    return this.take(this.changesSteps, this.defaultChanges)
  }

  profiles(): Promise<RemoteResult<ContextManagerRemoteProfilesSnapshot>> {
    this.calls.profiles += 1
    return this.take(this.profilesSteps, this.defaultProfiles)
  }

  presets(): Promise<RemoteResult<ContextManagerRemotePresetSnapshot>> {
    this.calls.presets += 1
    return this.take(this.presetsSteps, this.defaultPresets)
  }

  promptPlacement(): Promise<RemoteResult<ContextManagerRemotePromptPlacementCapability>> {
    this.calls.promptPlacement += 1
    return this.take(this.placementSteps, this.defaultPlacement)
  }
}

async function waitFor(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  throw new Error(`timed out waiting for: ${message}`)
}

async function attachAndReady(remote = new ScriptedRemote()) {
  const model = createContextManagerClientModel()
  const detach = model.attach(remote)
  await waitFor(() => {
    const snapshot = model.state.getSnapshot()
    return snapshot.sync.status !== 'syncing'
      && snapshot.protocol.status !== 'checking'
      && snapshot.profiles.status !== 'loading'
      && snapshot.presets.status !== 'loading'
      && snapshot.promptPlacement.status !== 'loading'
  }, 'initial model hydration')
  return { model, remote, detach }
}

test('protocol mismatch blocks authoritative reads', async () => {
  const remote = new ScriptedRemote()
  remote.defaultProtocol = { apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }

  const { model, detach } = await attachAndReady(remote)
  const snapshot = model.state.getSnapshot()

  assert.deepEqual(snapshot.protocol, {
    status: 'incompatible',
    expected: CONTEXT_MANAGER_REMOTE_API_VERSION,
    actual: CONTEXT_MANAGER_REMOTE_API_VERSION + 1,
  })
  assert.equal(remote.calls.changes, 0)
  assert.equal(remote.calls.profiles, 0)
  assert.equal(remote.calls.presets, 0)
  assert.equal(remote.calls.promptPlacement, 0)
  assert.equal(snapshot.instanceId, undefined)

  detach()
  model.dispose()
})

test('stable bracket adopts all baseline surfaces and only persistence revision is writable revision', async () => {
  const remote = new ScriptedRemote()
  remote.defaultChanges = changes('host-a', 50, 999, 12, 8)
  remote.defaultProfiles = profiles(7)

  const { model, detach } = await attachAndReady(remote)
  const snapshot = model.state.getSnapshot()

  assert.equal(snapshot.instanceId, 'host-a')
  assert.equal(snapshot.changes?.profiles, 999)
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.profiles.stale, false)
  assert.equal(snapshot.presets.status, 'ready')
  assert.equal(snapshot.promptPlacement.status, 'ready')
  assert.equal(model.getProfileRevision(), 7)

  detach()
  model.dispose()
})

test('cursor instability retries only the affected surface', async () => {
  const remote = new ScriptedRemote()
  remote.changesSteps.push(
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
  )
  remote.profilesSteps.push(
    async () => ok(profiles(1)),
    async () => ok(profiles(2)),
  )

  const { model, detach } = await attachAndReady(remote)

  assert.equal(remote.calls.protocol, 2)
  assert.equal(remote.calls.profiles, 2)
  assert.equal(remote.calls.presets, 1)
  assert.equal(remote.calls.promptPlacement, 1)
  assert.equal(model.getProfileRevision(), 2)

  detach()
  model.dispose()
})

test('one failed surface does not poison unrelated authoritative surfaces', async () => {
  const remote = new ScriptedRemote()
  remote.profilesSteps.push(async () => fail('profiles-unavailable'))

  const { model, detach } = await attachAndReady(remote)
  const snapshot = model.state.getSnapshot()

  assert.equal(snapshot.profiles.status, 'error')
  assert.equal(snapshot.profiles.error?.kind, 'remote')
  assert.equal(snapshot.presets.status, 'ready')
  assert.equal(snapshot.promptPlacement.status, 'ready')
  assert.equal(model.getProfileRevision(), undefined)

  detach()
  model.dispose()
})

test('a changes failure prevents bracket data from being adopted', async () => {
  const remote = new ScriptedRemote()
  remote.changesSteps.push(async () => fail('changes-unavailable'))

  const { model, detach } = await attachAndReady(remote)
  const snapshot = model.state.getSnapshot()

  assert.equal(remote.calls.profiles, 0)
  assert.equal(remote.calls.presets, 0)
  assert.equal(remote.calls.promptPlacement, 0)
  assert.equal(snapshot.profiles.status, 'error')
  assert.equal(snapshot.presets.status, 'error')
  assert.equal(snapshot.promptPlacement.status, 'error')
  assert.equal(snapshot.sync.status, 'error')

  detach()
  model.dispose()
})

test('Host instance change during hydration clears the old batch and rehydrates from the new instance', async () => {
  const remote = new ScriptedRemote()
  remote.changesSteps.push(
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
  )
  remote.profilesSteps.push(
    async () => ok(profiles(10)),
    async () => ok(profiles(20)),
  )
  remote.presetsSteps.push(
    async () => ok(presets('old')),
    async () => ok(presets('new')),
  )
  remote.placementSteps.push(
    async () => ok(placement('unavailable')),
    async () => ok(placement('available')),
  )

  const { model, detach } = await attachAndReady(remote)
  const snapshot = model.state.getSnapshot()

  assert.equal(snapshot.instanceId, 'host-b')
  assert.equal(model.getProfileRevision(), 20)
  assert.equal(snapshot.presets.data?.directory.status, 'available')
  if (snapshot.presets.data?.directory.status === 'available') {
    assert.equal(snapshot.presets.data.directory.defaultId, 'new')
  }
  assert.equal(snapshot.promptPlacement.data?.status, 'available')
  assert.equal(remote.calls.profiles, 2)
  assert.equal(remote.calls.presets, 2)
  assert.equal(remote.calls.promptPlacement, 2)

  detach()
  model.dispose()
})

test('a late older refresh cannot overwrite a newer refresh of the same surface', async () => {
  const { model, remote, detach } = await attachAndReady()

  const gate = deferred<RemoteResult<ContextManagerRemoteProfilesSnapshot>>()
  remote.profilesSteps.push(
    async () => gate.promise,
    async () => ok(profiles(22)),
  )
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
  )

  const first = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.profiles >= 2,
    'first explicit profile read to start',
  )
  const second = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.profiles >= 3,
    'second explicit profile read to start',
  )

  await second
  assert.equal(model.getProfileRevision(), 22)

  gate.resolve(ok(profiles(11)))
  await first

  assert.equal(model.getProfileRevision(), 22)

  detach()
  model.dispose()
})

test('a late older protocol failure cannot overwrite a newer successful reconcile', async () => {
  const { model, remote, detach } = await attachAndReady()

  const gate = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  remote.protocolSteps.push(
    async () => gate.promise,
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
  )
  remote.profilesSteps.push(async () => ok(profiles(22)))

  const first = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.protocol >= 2,
    'older reconcile protocol check to start',
  )

  const second = model.reconcile(['profiles'])
  await second

  assert.equal(model.getProfileRevision(), 22)
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  assert.equal(model.state.getSnapshot().sync.status, 'syncing')

  gate.resolve(fail('old-protocol-failure'))
  await first

  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.protocol.status, 'compatible')
  assert.equal(snapshot.sync.status, 'idle')
  assert.equal(model.getProfileRevision(), 22)

  detach()
  model.dispose()
})

test('sync stays syncing until the last overlapping reconcile settles', async () => {
  const { model, remote, detach } = await attachAndReady()

  const gate = deferred<RemoteResult<ContextManagerRemotePresetSnapshot>>()
  remote.presetsSteps.push(async () => gate.promise)
  remote.profilesSteps.push(async () => ok(profiles(33)))

  const slow = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.presets >= 2,
    'slow preset read to start',
  )

  const fast = model.reconcile(['profiles'])
  await fast

  assert.equal(model.getProfileRevision(), 33)
  assert.equal(model.state.getSnapshot().sync.status, 'syncing')

  gate.resolve(ok(presets('settled')))
  await slow

  assert.equal(model.state.getSnapshot().sync.status, 'idle')

  detach()
  model.dispose()
})

test('detach invalidates an in-flight batch and leaves no data-less surface stuck loading', async () => {
  const model = createContextManagerClientModel()
  const remote = new ScriptedRemote()
  const gate = deferred<RemoteResult<ContextManagerRemoteProfilesSnapshot>>()
  remote.profilesSteps.push(async () => gate.promise)

  const detach = model.attach(remote)
  await waitFor(() => remote.calls.profiles === 1, 'profile read to start')
  detach()
  gate.resolve(ok(profiles(99)))

  await new Promise(resolve => setTimeout(resolve, 0))
  const snapshot = model.state.getSnapshot()

  assert.equal(snapshot.attachment, 'detached')
  assert.equal(snapshot.profiles.status, 'idle')
  assert.equal(snapshot.profiles.data, undefined)

  model.dispose()
})

test('persistent cursor churn is bounded and reported as unstable', async () => {
  const { model, remote, detach } = await attachAndReady()

  remote.changesSteps.push(
    async () => ok(changes('host-a', 10, 10, 1, 1)),
    async () => ok(changes('host-a', 11, 11, 1, 1)),
    async () => ok(changes('host-a', 12, 12, 1, 1)),
    async () => ok(changes('host-a', 13, 13, 1, 1)),
    async () => ok(changes('host-a', 14, 14, 1, 1)),
    async () => ok(changes('host-a', 15, 15, 1, 1)),
  )
  remote.profilesSteps.push(
    async () => ok(profiles(10)),
    async () => ok(profiles(11)),
    async () => ok(profiles(12)),
  )

  const result = await model.reconcile(['profiles'])
  const snapshot = model.state.getSnapshot()

  assert.equal(result.status, 'completed')
  assert.equal(snapshot.profiles.status, 'error')
  assert.equal(snapshot.profiles.error?.kind, 'unstable-snapshot')
  assert.equal(snapshot.profiles.error?.kind === 'unstable-snapshot'
    ? snapshot.profiles.error.attempts
    : undefined, 3)
  assert.equal(remote.calls.profiles, 4)

  detach()
  model.dispose()
})

test('the baseline surface list stays explicit and mutation-free', () => {
  assert.deepEqual(CONTEXT_MANAGER_BASELINE_SURFACES, [
    'profiles',
    'presets',
    'promptPlacement',
  ])
})
