import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  type ContextManagerRemoteChangeSnapshot,
  type ContextManagerRemoteErrorCode,
  type ContextManagerRemotePresetSnapshot,
  type ContextManagerRemoteProfilesSnapshot,
  type ContextManagerRemoteProfileInput,
  type ContextManagerRemoteProfileMutationBasis,
  type ContextManagerRemotePromptBinding,
  type ContextManagerRemotePromptPlacement,
  type ContextManagerRemotePromptPlacementCapability,
  type ContextManagerRemoteProtocol,
  type ContextManagerRemoteResult,
  type ContextManagerRemoteSkillMode,
} from '../src/remote/types.js'
import {
  CONTEXT_MANAGER_BASELINE_SURFACES,
  createContextManagerClientModel,
} from '../src/client/model.js'
import type { ContextManagerClientBusinessRemote } from '../src/client/remote-port.js'

type Step<T> = () => Promise<RemoteResult<T>>
type ProfileMutationStep = Step<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>

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

function businessOk<T>(value: T): ContextManagerRemoteResult<T> {
  return { ok: true, value }
}

function businessFail<T>(
  code: ContextManagerRemoteErrorCode,
  message = 'test business failure',
  revision?: { readonly expected: number; readonly actual: number },
  instance?: { readonly expected: string; readonly actual: string },
): ContextManagerRemoteResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(revision === undefined
        ? {}
        : {
            expectedRevision: revision.expected,
            actualRevision: revision.actual,
          }),
      ...(instance === undefined
        ? {}
        : {
            expectedInstanceId: instance.expected,
            actualInstanceId: instance.actual,
          }),
    },
  }
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

class ScriptedRemote implements ContextManagerClientBusinessRemote {
  readonly calls = {
    protocol: 0,
    changes: 0,
    profiles: 0,
    presets: 0,
    promptPlacement: 0,
    profileMutation: 0,
  }

  readonly profileMutationCalls: Array<{
    readonly kind: string
    readonly args: readonly unknown[]
    readonly basis: ContextManagerRemoteProfileMutationBasis
  }> = []

  readonly protocolSteps: Array<Step<ContextManagerRemoteProtocol>> = []
  readonly changesSteps: Array<Step<ContextManagerRemoteChangeSnapshot>> = []
  readonly profilesSteps: Array<Step<ContextManagerRemoteProfilesSnapshot>> = []
  readonly presetsSteps: Array<Step<ContextManagerRemotePresetSnapshot>> = []
  readonly placementSteps: Array<Step<ContextManagerRemotePromptPlacementCapability>> = []
  readonly profileMutationSteps: ProfileMutationStep[] = []

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

  private mutate(
    kind: string,
    args: readonly unknown[],
    basis: ContextManagerRemoteProfileMutationBasis,
  ): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>> {
    this.calls.profileMutation += 1
    this.profileMutationCalls.push({ kind, args, basis })
    return this.take(
      this.profileMutationSteps,
      businessOk(profiles(basis.revision + 1)),
    )
  }

  createProfile(id: string, input: ContextManagerRemoteProfileInput, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('create-profile', [id, input], basis)
  }

  deleteProfile(id: string, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('delete-profile', [id], basis)
  }

  setDefaultProfile(id: string | null, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('set-default-profile', [id], basis)
  }

  setProfileName(profileId: string, name: string, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('set-profile-name', [profileId, name], basis)
  }

  setProfileDescription(
    profileId: string,
    description: string | null,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate('set-profile-description', [profileId, description], basis)
  }

  setProfileBasePreset(profileId: string, basePreset: string, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('set-profile-base-preset', [profileId, basePreset], basis)
  }

  setSkillMode(
    profileId: string,
    skillName: string,
    mode: ContextManagerRemoteSkillMode,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate('set-skill-mode', [profileId, skillName, mode], basis)
  }

  removeSkillBinding(profileId: string, skillName: string, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('remove-skill-binding', [profileId, skillName], basis)
  }

  addPromptBinding(
    profileId: string,
    bindingId: string,
    input: ContextManagerRemotePromptBinding,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate('add-prompt-binding', [profileId, bindingId, input], basis)
  }

  setPromptBindingResourceId(
    profileId: string,
    bindingId: string,
    resourceId: string,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate(
      'set-prompt-binding-resource-id',
      [profileId, bindingId, resourceId],
      basis,
    )
  }

  setPromptBindingEnabled(
    profileId: string,
    bindingId: string,
    enabled: boolean,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate(
      'set-prompt-binding-enabled',
      [profileId, bindingId, enabled],
      basis,
    )
  }

  setPromptBindingPlacement(
    profileId: string,
    bindingId: string,
    placement: ContextManagerRemotePromptPlacement,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate(
      'set-prompt-binding-placement',
      [profileId, bindingId, placement],
      basis,
    )
  }

  setPromptBindingOrder(
    profileId: string,
    bindingId: string,
    order: number,
    basis: ContextManagerRemoteProfileMutationBasis,
  ) {
    return this.mutate(
      'set-prompt-binding-order',
      [profileId, bindingId, order],
      basis,
    )
  }

  removePromptBinding(profileId: string, bindingId: string, basis: ContextManagerRemoteProfileMutationBasis) {
    return this.mutate('remove-prompt-binding', [profileId, bindingId], basis)
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

function requireProfileMutationBasis(
  model: ReturnType<typeof createContextManagerClientModel>,
) {
  const basis = model.captureProfileMutationBasis()
  assert.ok(basis, 'expected a fresh profile mutation basis')
  return basis
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
    // Initial authority discovery; the model must then re-run protocol().
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    // First authoritative bracket: profiles changes during the read.
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    // Retry bracket is stable and only re-reads profiles.
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
    // Discover and protocol-confirm Host A.
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    // Host changes after the A surface reads, invalidating that batch.
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    // Protocol-confirmed Host B bracket.
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

test('initial Host authority is protocol-guarded again before any business read', async () => {
  const remote = new ScriptedRemote()
  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }),
  )
  remote.changesSteps.push(
    async () => ok(changes('host-b', 1, 1, 1, 1)),
  )

  const { model, detach } = await attachAndReady(remote)
  const snapshot = model.state.getSnapshot()

  assert.equal(remote.calls.protocol, 2)
  assert.equal(remote.calls.changes, 1)
  assert.equal(remote.calls.profiles, 0)
  assert.equal(remote.calls.presets, 0)
  assert.equal(remote.calls.promptPlacement, 0)
  assert.equal(snapshot.instanceId, undefined)
  assert.deepEqual(snapshot.protocol, {
    status: 'incompatible',
    expected: CONTEXT_MANAGER_REMOTE_API_VERSION,
    actual: CONTEXT_MANAGER_REMOTE_API_VERSION + 1,
  })

  detach()
  model.dispose()
})

test('Host replacement after protocol cannot adopt new-Host data without a new protocol guard', async () => {
  const { model, remote, detach } = await attachAndReady()
  const initialProfileCalls = remote.calls.profiles

  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }),
  )
  remote.changesSteps.push(
    async () => ok(changes('host-b', 1, 1, 1, 1)),
  )

  const result = await model.reconcile(['profiles'])
  const snapshot = model.state.getSnapshot()

  assert.equal(result.status, 'incompatible')
  assert.equal(remote.calls.profiles, initialProfileCalls)
  assert.equal(snapshot.instanceId, undefined)
  assert.equal(snapshot.profiles.status, 'idle')
  assert.deepEqual(snapshot.protocol, {
    status: 'incompatible',
    expected: CONTEXT_MANAGER_REMOTE_API_VERSION,
    actual: CONTEXT_MANAGER_REMOTE_API_VERSION + 1,
  })

  detach()
  model.dispose()
})

test('a stale old-Host changes completion cannot reclaim authority after Host replacement', async () => {
  const { model, remote, detach } = await attachAndReady()
  const staleChanges = deferred<RemoteResult<ContextManagerRemoteChangeSnapshot>>()
  const baseChangesCalls = remote.calls.changes

  remote.changesSteps.push(
    async () => staleChanges.promise,
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
  )
  remote.profilesSteps.push(async () => ok(profiles(44)))

  const stale = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.changes === baseChangesCalls + 1,
    'stale old-Host changes read to start',
  )

  const fresh = model.reconcile(['profiles'])
  await fresh

  let snapshot = model.state.getSnapshot()
  assert.equal(snapshot.instanceId, 'host-b')
  assert.equal(model.getProfileRevision(), 44)

  staleChanges.resolve(ok(changes('host-a', 2, 2, 2, 2)))
  await stale

  snapshot = model.state.getSnapshot()
  assert.equal(snapshot.instanceId, 'host-b')
  assert.equal(model.getProfileRevision(), 44)
  assert.equal(snapshot.presets.status, 'idle')
  assert.equal(snapshot.protocol.status, 'compatible')

  detach()
  model.dispose()
})

test('a superseded incompatible protocol result retries locally without reclaiming global protocol ownership', async () => {
  const { model, remote, detach } = await attachAndReady()
  const staleProtocol = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const localRetry = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const baseProtocolCalls = remote.calls.protocol

  remote.protocolSteps.push(
    async () => staleProtocol.promise,
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => localRetry.promise,
  )

  const stale = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 1,
    'stale protocol check to start',
  )

  const fresh = model.reconcile(['profiles'])
  await fresh
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')

  staleProtocol.resolve(ok({
    apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1,
  }))
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 3,
    'stale reconcile local protocol retry to start',
  )

  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  localRetry.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }))
  await stale

  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.protocol.status, 'compatible')
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.presets.status, 'ready')
  assert.equal(snapshot.presets.stale, false)
  assert.equal(snapshot.sync.status, 'idle')

  detach()
  model.dispose()
})

test('a stale higher-run completion cannot override a rehydrated Host instance', async () => {
  const { model, remote, detach } = await attachAndReady()

  const oldProfileGate = deferred<RemoteResult<ContextManagerRemoteProfilesSnapshot>>()
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
    async () => ok(changes('host-b', 1, 1, 1, 1)),
  )
  remote.profilesSteps.push(
    async () => oldProfileGate.promise,
    async () => ok(profiles(44)),
  )

  const resetting = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.profiles >= 2,
    'old-host profile read to start',
  )

  const staleProtocol = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  remote.protocolSteps.push(async () => staleProtocol.promise)
  const stale = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.protocol >= 3,
    'stale higher-run protocol check to start',
  )

  oldProfileGate.resolve(ok(profiles(11)))
  await resetting

  let snapshot = model.state.getSnapshot()
  assert.equal(snapshot.instanceId, 'host-b')
  assert.equal(model.getProfileRevision(), 44)
  assert.equal(snapshot.protocol.status, 'compatible')
  assert.equal(snapshot.sync.status, 'syncing')

  staleProtocol.resolve(fail('old-host-protocol-failure'))
  await stale

  snapshot = model.state.getSnapshot()
  assert.equal(snapshot.instanceId, 'host-b')
  assert.equal(model.getProfileRevision(), 44)
  assert.equal(snapshot.protocol.status, 'compatible')
  assert.equal(snapshot.presets.status, 'idle')
  assert.equal(snapshot.sync.status, 'idle')

  detach()
  model.dispose()
})

test('adopting a newer unrequested surface cursor marks cached data stale immediately', async () => {
  const { model, remote, detach } = await attachAndReady()

  assert.equal(model.getProfileRevision(), 7)
  assert.equal(model.state.getSnapshot().profiles.stale, false)

  const basis = requireProfileMutationBasis(model)

  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
  )
  remote.presetsSteps.push(async () => ok(presets('newer')))

  await model.reconcile(['presets'])

  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.changes?.profiles, 2)
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.profiles.stale, true)
  assert.equal(snapshot.profiles.data?.persistence.revision, 7)
  assert.equal(model.getProfileRevision(), undefined)
  assert.equal(snapshot.presets.status, 'ready')
  assert.equal(snapshot.presets.stale, false)

  detach()
  model.dispose()
})

test('an unrelated generation advance does not stale a surface whose own cursor is unchanged', async () => {
  const { model, remote, detach } = await attachAndReady()

  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 1, 2, 1)),
    async () => ok(changes('host-a', 2, 1, 2, 1)),
  )
  remote.presetsSteps.push(async () => ok(presets('newer')))

  await model.reconcile(['presets'])

  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.changes?.generation, 2)
  assert.equal(snapshot.changes?.profiles, 1)
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.profiles.stale, false)
  assert.equal(model.getProfileRevision(), 7)

  detach()
  model.dispose()
})

test('a protocol-superseded same-surface reconcile cannot orphan an older loading owner', async () => {
  const { model, remote, detach } = await attachAndReady()
  const profileGate = deferred<RemoteResult<ContextManagerRemoteProfilesSnapshot>>()
  const supersededProtocol = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const baseProtocolCalls = remote.calls.protocol
  const baseProfileCalls = remote.calls.profiles

  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => supersededProtocol.promise,
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => fail('superseded-profile-protocol-2'),
    async () => fail('superseded-profile-protocol-3'),
  )
  remote.profilesSteps.push(async () => profileGate.promise)
  remote.presetsSteps.push(async () => ok(presets('newer')))

  const older = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.profiles === baseProfileCalls + 1,
    'older profile read to become loading owner',
  )
  assert.equal(model.state.getSnapshot().profiles.status, 'loading')

  const superseded = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 2,
    'same-surface successor protocol check to start',
  )

  const newerDisjoint = model.reconcile(['presets'])
  await newerDisjoint
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')

  supersededProtocol.resolve(fail('superseded-profile-protocol-1'))
  await superseded

  assert.equal(remote.calls.profiles, baseProfileCalls + 1)
  assert.equal(model.state.getSnapshot().profiles.status, 'loading')

  profileGate.resolve(ok(profiles(11)))
  await older

  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.profiles.stale, false)
  assert.equal(model.getProfileRevision(), 11)
  assert.equal(snapshot.sync.status, 'idle')

  detach()
  model.dispose()
})

test('an older delayed compatible run cannot reclaim a surface from a newer same-surface owner', async () => {
  const { model, remote, detach } = await attachAndReady()
  const olderProtocol = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const baseProtocolCalls = remote.calls.protocol
  const baseProfileCalls = remote.calls.profiles

  remote.protocolSteps.push(
    async () => olderProtocol.promise,
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
  )
  remote.profilesSteps.push(async () => ok(profiles(22)))

  const older = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 1,
    'older delayed protocol check to start',
  )

  const newer = model.reconcile(['profiles'])
  await newer
  assert.equal(model.getProfileRevision(), 22)
  assert.equal(remote.calls.profiles, baseProfileCalls + 1)

  olderProtocol.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }))
  await older

  assert.equal(remote.calls.profiles, baseProfileCalls + 1)
  assert.equal(model.getProfileRevision(), 22)
  assert.equal(model.state.getSnapshot().profiles.stale, false)

  detach()
  model.dispose()
})

test('the latest same-surface protocol error claims the surface and blocks an older completion', async () => {
  const { model, remote, detach } = await attachAndReady()
  const olderProfile = deferred<RemoteResult<ContextManagerRemoteProfilesSnapshot>>()
  const baseProfileCalls = remote.calls.profiles

  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => fail('latest-profile-protocol-error'),
  )
  remote.profilesSteps.push(async () => olderProfile.promise)

  const older = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.profiles === baseProfileCalls + 1,
    'older profile read to start',
  )

  const failing = model.reconcile(['profiles'])
  await failing

  let snapshot = model.state.getSnapshot()
  assert.equal(snapshot.profiles.status, 'error')
  assert.equal(snapshot.profiles.error?.kind, 'remote')
  assert.equal(snapshot.profiles.error?.code, 'latest-profile-protocol-error')

  olderProfile.resolve(ok(profiles(11)))
  await older

  snapshot = model.state.getSnapshot()
  assert.equal(snapshot.profiles.status, 'error')
  assert.equal(snapshot.profiles.error?.code, 'latest-profile-protocol-error')
  assert.equal(model.getProfileRevision(), undefined)

  detach()
  model.dispose()
})

test('an older stable bracket retries after a newer disjoint reconcile observes its surface cursor advance', async () => {
  const { model, remote, detach } = await attachAndReady()
  const oldAfter = deferred<RemoteResult<ContextManagerRemoteChangeSnapshot>>()
  const baseChangesCalls = remote.calls.changes

  remote.changesSteps.push(
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    async () => oldAfter.promise,
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
  )
  remote.profilesSteps.push(
    async () => ok(profiles(11)),
    async () => ok(profiles(22)),
  )
  remote.presetsSteps.push(async () => ok(presets('newer')))

  const olderProfiles = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.changes === baseChangesCalls + 2,
    'older profile closing changes read to start',
  )

  const newerPresets = model.reconcile(['presets'])
  await newerPresets

  let snapshot = model.state.getSnapshot()
  assert.equal(snapshot.changes?.profiles, 2)
  assert.equal(snapshot.presets.status, 'ready')

  oldAfter.resolve(ok(changes('host-a', 1, 1, 1, 1)))
  await olderProfiles

  snapshot = model.state.getSnapshot()
  assert.equal(snapshot.changes?.profiles, 2)
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(model.getProfileRevision(), 22)

  detach()
  model.dispose()
})

test('a stale failed read retries when a newer disjoint reconcile already observed its surface cursor advance', async () => {
  const { model, remote, detach } = await attachAndReady()
  const oldAfter = deferred<RemoteResult<ContextManagerRemoteChangeSnapshot>>()
  const baseChangesCalls = remote.calls.changes

  remote.changesSteps.push(
    async () => ok(changes('host-a', 1, 1, 1, 1)),
    async () => oldAfter.promise,
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
  )
  remote.profilesSteps.push(
    async () => fail('stale-profile-read'),
    async () => ok(profiles(22)),
  )
  remote.presetsSteps.push(async () => ok(presets('newer')))

  const olderProfiles = model.reconcile(['profiles'])
  await waitFor(
    () => remote.calls.changes === baseChangesCalls + 2,
    'older failed profile closing changes read to start',
  )

  await model.reconcile(['presets'])
  assert.equal(model.state.getSnapshot().changes?.profiles, 2)

  oldAfter.resolve(ok(changes('host-a', 1, 1, 1, 1)))
  await olderProfiles

  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.profiles.error, undefined)
  assert.equal(model.getProfileRevision(), 22)

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

test('an older reconcile cannot reclaim global protocol ownership through bounded negative retries', async () => {
  const { model, remote, detach } = await attachAndReady()
  const firstFailure = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const secondFailure = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const thirdFailure = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const baseProtocolCalls = remote.calls.protocol

  remote.protocolSteps.push(
    async () => firstFailure.promise,
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }),
    async () => secondFailure.promise,
    async () => thirdFailure.promise,
  )
  remote.profilesSteps.push(async () => ok(profiles(22)))

  const older = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 1,
    'older reconcile protocol check to start',
  )

  const newer = model.reconcile(['profiles'])
  await newer

  assert.equal(model.getProfileRevision(), 22)
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  assert.equal(model.state.getSnapshot().sync.status, 'syncing')

  firstFailure.resolve(fail('old-protocol-failure-1'))
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 3,
    'older reconcile second protocol attempt to start',
  )
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')

  secondFailure.resolve(fail('old-protocol-failure-2'))
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 4,
    'older reconcile third protocol attempt to start',
  )
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')

  thirdFailure.resolve(fail('old-protocol-failure-3'))
  await older

  const snapshot = model.state.getSnapshot()
  assert.equal(remote.calls.protocol, baseProtocolCalls + 4)
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

test('a synchronous loading subscriber can detach before any stale attachment surface RPC starts', async () => {
  const { model, remote, detach } = await attachAndReady()
  const baseProfileCalls = remote.calls.profiles

  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (snapshot.profiles.status !== 'loading') return
    unsubscribe()
    detach()
  })

  const result = await model.reconcile(['profiles'])
  const snapshot = model.state.getSnapshot()

  assert.equal(result.status, 'detached')
  assert.equal(remote.calls.profiles, baseProfileCalls)
  assert.equal(snapshot.attachment, 'detached')
  assert.notEqual(snapshot.profiles.status, 'loading')

  unsubscribe()
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


test('profile mutation uses persistence revision and rehydrates instead of adopting mutation payload', async () => {
  const { model, remote, detach } = await attachAndReady()
  const profileGate = deferred<RemoteResult<ContextManagerRemoteProfilesSnapshot>>()

  remote.profileMutationSteps.push(async () => ok(businessOk(profiles(99))))
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 2)),
    async () => ok(changes('host-a', 2, 2, 2, 2)),
  )
  remote.profilesSteps.push(async () => profileGate.promise)

  const basis = requireProfileMutationBasis(model)
  const mutation = model.mutations.setProfileName(basis, 'main', 'Renamed')
  await waitFor(() => remote.calls.profiles >= 2, 'post-mutation profile read to start')

  assert.deepEqual(remote.profileMutationCalls[0]?.basis, {
    instanceId: 'host-a',
    revision: 7,
  })
  assert.equal(model.getProfileRevision(), undefined)
  assert.notEqual(model.state.getSnapshot().profiles.data?.persistence.revision, 99)

  profileGate.resolve(ok(profiles(8)))
  assert.deepEqual(await mutation, { status: 'applied', refresh: 'fresh' })
  assert.equal(model.getProfileRevision(), 8)
  assert.equal(remote.calls.profileMutation, 1)

  detach()
  model.dispose()
})

test('profile mutation refuses to write without a fresh persistence revision', async () => {
  const { model, remote, detach } = await attachAndReady()
  const basis = requireProfileMutationBasis(model)

  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 1)),
    async () => ok(changes('host-a', 2, 2, 2, 1)),
  )
  remote.presetsSteps.push(async () => ok(presets('newer')))
  await model.reconcile(['presets'])

  assert.equal(model.getProfileRevision(), undefined)
  const before = remote.calls.profileMutation
  const result = await model.mutations.setProfileName(basis, 'main', 'Should not write')

  assert.equal(result.status, 'rejected')
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'precondition'
      ? result.error.code
      : undefined,
    'profile-basis-unavailable',
  )
  assert.equal(remote.calls.profileMutation, before)

  detach()
  model.dispose()
})

test('a stale draft basis is rejected locally after authoritative profiles advance', async () => {
  const { model, remote, detach } = await attachAndReady()
  const draftBasis = requireProfileMutationBasis(model)

  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
  )
  remote.profilesSteps.push(async () => ok(profiles(8)))
  await model.reconcile(['profiles'])

  assert.deepEqual(model.captureProfileMutationBasis(), {
    instanceId: 'host-a',
    revision: 8,
  })

  const before = remote.calls.profileMutation
  const result = await model.mutations.setProfileName(
    draftBasis,
    'main',
    'Stale draft',
  )

  assert.equal(result.status, 'rejected')
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'precondition'
      ? result.error.code
      : undefined,
    'profile-basis-stale',
  )
  assert.equal(remote.calls.profileMutation, before)

  detach()
  model.dispose()
})

test('profile mutations are single-flight and do not silently queue or rebase', async () => {
  const { model, remote, detach } = await attachAndReady()
  const gate = deferred<
    RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
  >()

  remote.profileMutationSteps.push(async () => gate.promise)
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 2)),
    async () => ok(changes('host-a', 2, 2, 2, 2)),
  )
  remote.profilesSteps.push(async () => ok(profiles(8)))

  const basis = requireProfileMutationBasis(model)
  const first = model.mutations.setProfileName(basis, 'main', 'First')
  await waitFor(() => remote.calls.profileMutation === 1, 'first mutation to start')

  const second = await model.mutations.setProfileDescription(basis, 'main', 'Second')
  assert.equal(second.status, 'rejected')
  assert.equal(
    second.status === 'rejected' && second.error.kind === 'precondition'
      ? second.error.code
      : undefined,
    'busy',
  )
  assert.equal(remote.calls.profileMutation, 1)

  gate.resolve(ok(businessOk(profiles(8))))
  assert.deepEqual(await first, { status: 'applied', refresh: 'fresh' })
  assert.equal(remote.calls.profileMutation, 1)

  detach()
  model.dispose()
})

test('profile conflict is never retried and preserves conflict revisions while refreshing reads', async () => {
  const { model, remote, detach } = await attachAndReady()

  remote.profileMutationSteps.push(async () => ok(businessFail(
    'profile-conflict',
    'conflict',
    { expected: 7, actual: 8 },
  )))
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 2)),
    async () => ok(changes('host-a', 2, 2, 2, 2)),
  )
  remote.profilesSteps.push(async () => ok(profiles(8)))

  const result = await model.mutations.setProfileName(requireProfileMutationBasis(model), 'main', 'Conflicting')

  assert.equal(result.status, 'rejected')
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'business'
      ? result.error.code
      : undefined,
    'profile-conflict',
  )
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'business'
      ? result.error.expectedRevision
      : undefined,
    7,
  )
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'business'
      ? result.error.actualRevision
      : undefined,
    8,
  )
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'fresh')
  assert.equal(remote.calls.profileMutation, 1)
  assert.equal(model.getProfileRevision(), 8)

  detach()
  model.dispose()
})

test('known business refusal stays isolated from authoritative read surfaces', async () => {
  const { model, remote, detach } = await attachAndReady()
  remote.profileMutationSteps.push(async () => ok(businessFail('persistence-read-only')))

  const result = await model.mutations.setProfileName(requireProfileMutationBasis(model), 'main', 'Denied')
  const snapshot = model.state.getSnapshot()

  assert.equal(result.status, 'rejected')
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'business'
      ? result.error.code
      : undefined,
    'persistence-read-only',
  )
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'not-requested')
  assert.equal(snapshot.profiles.status, 'ready')
  assert.equal(snapshot.profiles.stale, false)
  assert.equal(model.getProfileRevision(), 7)

  detach()
  model.dispose()
})

test('transport failure is outcome-unknown, safety-refreshes, and never retries the write', async () => {
  const { model, remote, detach } = await attachAndReady()

  remote.profileMutationSteps.push(async () => fail('gateway-lost', 'gateway lost'))
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 2)),
    async () => ok(changes('host-a', 2, 2, 2, 2)),
  )
  remote.profilesSteps.push(async () => ok(profiles(8)))

  const result = await model.mutations.setProfileName(requireProfileMutationBasis(model), 'main', 'Uncertain')

  assert.equal(result.status, 'unknown')
  assert.equal(
    result.status === 'unknown' && result.error.kind === 'remote'
      ? result.error.code
      : undefined,
    'gateway-lost',
  )
  assert.equal(result.status === 'unknown' ? result.refresh : undefined, 'fresh')
  assert.equal(remote.calls.profileMutation, 1)
  assert.equal(model.getProfileRevision(), 8)

  detach()
  model.dispose()
})

test('rejected mutation call is outcome-unknown and never auto-retried', async () => {
  const { model, remote, detach } = await attachAndReady()

  remote.profileMutationSteps.push(async () => {
    throw new Error('connection withdrawn')
  })
  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 2, 2)),
    async () => ok(changes('host-a', 2, 2, 2, 2)),
  )
  remote.profilesSteps.push(async () => ok(profiles(8)))

  const result = await model.mutations.setProfileName(requireProfileMutationBasis(model), 'main', 'Uncertain')

  assert.equal(result.status, 'unknown')
  assert.equal(
    result.status === 'unknown' && result.error.kind === 'call-rejected'
      ? result.error.message
      : undefined,
    'connection withdrawn',
  )
  assert.equal(remote.calls.profileMutation, 1)

  detach()
  model.dispose()
})

test('profile mutation does not start while protocol compatibility is not current', async () => {
  const { model, remote, detach } = await attachAndReady()
  const protocolGate = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const baseProtocolCalls = remote.calls.protocol
  const beforeMutationCalls = remote.calls.profileMutation

  const basis = requireProfileMutationBasis(model)
  remote.protocolSteps.push(async () => protocolGate.promise)
  const refresh = model.reconcile(['presets'])
  await waitFor(
    () => remote.calls.protocol === baseProtocolCalls + 1,
    'protocol recheck to enter checking state',
  )
  assert.equal(model.state.getSnapshot().protocol.status, 'checking')

  const result = await model.mutations.setProfileName(basis, 'main', 'Blocked')
  assert.equal(result.status, 'rejected')
  assert.equal(
    result.status === 'rejected' && result.error.kind === 'precondition'
      ? result.error.code
      : undefined,
    'protocol-unavailable',
  )
  assert.equal(remote.calls.profileMutation, beforeMutationCalls)

  protocolGate.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION }))
  await refresh

  detach()
  model.dispose()
})

test('confirmed mutation success remains applied when rehydration degrades', async () => {
  const { model, remote, detach } = await attachAndReady()

  remote.profileMutationSteps.push(async () => ok(businessOk(profiles(8))))
  remote.changesSteps.push(async () => fail('rehydration-failed'))

  const result = await model.mutations.setProfileName(
    requireProfileMutationBasis(model),
    'main',
    'Applied',
  )

  assert.deepEqual(result, { status: 'applied', refresh: 'degraded' })
  assert.equal(remote.calls.profileMutation, 1)

  detach()
  model.dispose()
})

test('Host instance conflict rehydrates the new authority and supersedes the old operation', async () => {
  const { model, remote, detach } = await attachAndReady()
  const basis = requireProfileMutationBasis(model)

  remote.profileMutationSteps.push(async () => {
    remote.defaultChanges = changes('host-b', 1, 1, 1, 1)
    return ok(businessFail(
      'host-instance-conflict',
      'host changed',
      undefined,
      { expected: 'host-a', actual: 'host-b' },
    ))
  })

  const result = await model.mutations.setProfileName(
    basis,
    'main',
    'Must not carry across Host lifetime',
  )

  assert.deepEqual(result, { status: 'superseded' })
  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.instanceId, 'host-b')
  assert.equal(snapshot.protocol.status, 'compatible')
  assert.deepEqual(model.captureProfileMutationBasis(), {
    instanceId: 'host-b',
    revision: 7,
  })
  assert.equal(remote.calls.profileMutation, 1)

  detach()
  model.dispose()
})

test('a late old-Host completion is superseded after detach and reattach', async () => {
  const { model, remote, detach } = await attachAndReady()
  const gate = deferred<
    RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
  >()
  remote.profileMutationSteps.push(async () => gate.promise)

  const mutation = model.mutations.setProfileName(
    requireProfileMutationBasis(model),
    'main',
    'Old host',
  )
  await waitFor(() => remote.calls.profileMutation === 1, 'old Host mutation to start')

  detach()

  const nextRemote = new ScriptedRemote()
  nextRemote.defaultChanges = changes('host-b')
  const detachNext = model.attach(nextRemote)
  await waitFor(() => (
    model.state.getSnapshot().instanceId === 'host-b'
    && model.captureProfileMutationBasis() !== undefined
  ), 'new Host attachment to hydrate')

  gate.resolve(ok(businessOk(profiles(8))))
  assert.deepEqual(await mutation, { status: 'superseded' })
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'idle')
  assert.equal(model.state.getSnapshot().instanceId, 'host-b')

  detachNext()
  model.dispose()
})

test('detach resets mutation state and a late confirmed completion cannot republish old operation state', async () => {
  const { model, remote, detach } = await attachAndReady()
  const gate = deferred<
    RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>
  >()
  remote.profileMutationSteps.push(async () => gate.promise)

  const mutation = model.mutations.setProfileName(
    requireProfileMutationBasis(model),
    'main',
    'Late',
  )
  await waitFor(() => remote.calls.profileMutation === 1, 'mutation to start')
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'running')

  detach()
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'idle')

  gate.resolve(ok(businessOk(profiles(8))))
  assert.deepEqual(await mutation, { status: 'detached' })
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'idle')

  model.dispose()
})

test('all profile mutation wrappers forward the exact arguments and immutable basis', async () => {
  const { model, remote, detach } = await attachAndReady()
  const basis = requireProfileMutationBasis(model)
  const prompt = {
    resourceId: 'resource',
    enabled: true,
    placement: 'after-persona' as const,
    order: 4,
  }

  const cases: readonly {
    readonly kind: string
    readonly args: readonly unknown[]
    readonly invoke: () => Promise<unknown>
  }[] = [
    {
      kind: 'create-profile',
      args: ['new', { name: 'New', basePreset: 'standard' }],
      invoke: () => model.mutations.createProfile(
        basis,
        'new',
        { name: 'New', basePreset: 'standard' },
      ),
    },
    {
      kind: 'delete-profile',
      args: ['main'],
      invoke: () => model.mutations.deleteProfile(basis, 'main'),
    },
    {
      kind: 'set-default-profile',
      args: ['main'],
      invoke: () => model.mutations.setDefaultProfile(basis, 'main'),
    },
    {
      kind: 'set-profile-name',
      args: ['main', 'Renamed'],
      invoke: () => model.mutations.setProfileName(basis, 'main', 'Renamed'),
    },
    {
      kind: 'set-profile-description',
      args: ['main', 'Desc'],
      invoke: () => model.mutations.setProfileDescription(basis, 'main', 'Desc'),
    },
    {
      kind: 'set-profile-base-preset',
      args: ['main', 'future'],
      invoke: () => model.mutations.setProfileBasePreset(basis, 'main', 'future'),
    },
    {
      kind: 'set-skill-mode',
      args: ['main', 'docker', 'manual'],
      invoke: () => model.mutations.setSkillMode(basis, 'main', 'docker', 'manual'),
    },
    {
      kind: 'remove-skill-binding',
      args: ['main', 'docker'],
      invoke: () => model.mutations.removeSkillBinding(basis, 'main', 'docker'),
    },
    {
      kind: 'add-prompt-binding',
      args: ['main', 'binding', prompt],
      invoke: () => model.mutations.addPromptBinding(basis, 'main', 'binding', prompt),
    },
    {
      kind: 'set-prompt-binding-resource-id',
      args: ['main', 'binding', 'resource-2'],
      invoke: () => model.mutations.setPromptBindingResourceId(
        basis,
        'main',
        'binding',
        'resource-2',
      ),
    },
    {
      kind: 'set-prompt-binding-enabled',
      args: ['main', 'binding', false],
      invoke: () => model.mutations.setPromptBindingEnabled(
        basis,
        'main',
        'binding',
        false,
      ),
    },
    {
      kind: 'set-prompt-binding-placement',
      args: ['main', 'binding', 'before-persona'],
      invoke: () => model.mutations.setPromptBindingPlacement(
        basis,
        'main',
        'binding',
        'before-persona',
      ),
    },
    {
      kind: 'set-prompt-binding-order',
      args: ['main', 'binding', 9],
      invoke: () => model.mutations.setPromptBindingOrder(
        basis,
        'main',
        'binding',
        9,
      ),
    },
    {
      kind: 'remove-prompt-binding',
      args: ['main', 'binding'],
      invoke: () => model.mutations.removePromptBinding(
        basis,
        'main',
        'binding',
      ),
    },
  ]

  for (const item of cases) {
    remote.profileMutationSteps.push(
      async () => ok(businessFail('persistence-read-only')),
    )
    const before = remote.profileMutationCalls.length
    await item.invoke()
    const call = remote.profileMutationCalls[before]
    assert.equal(call?.kind, item.kind)
    assert.deepEqual(call?.args, item.args)
    assert.deepEqual(call?.basis, basis)
  }

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
