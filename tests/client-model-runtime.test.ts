import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

import {
  CONTEXT_MANAGER_REMOTE_API_VERSION,
  type ContextManagerRemoteChangeSnapshot,
  type ContextManagerRemoteErrorCode,
  type ContextManagerRemotePresetSnapshot,
  type ContextManagerRemotePresetDocument,
  type ContextManagerRemoteProfilesSnapshot,
  type ContextManagerRemoteProfileInput,
  type ContextManagerRemoteProfileMutationBasis,
  type ContextManagerRemotePromptBinding,
  type ContextManagerRemotePromptPlacement,
  type ContextManagerRemotePromptPlacementCapability,
  type ContextManagerRemoteProtocol,
  type ContextManagerRemoteResult,
  type ContextManagerRemoteSkillMode,
  type ContextManagerRemotePromptResource,
  type ContextManagerRemotePromptResourceListItem,
  type ContextManagerRemotePromptResourceInput,
  type ContextManagerRemoteResourceCreateBasis,
  type ContextManagerRemoteResourceMutationBasis,
  type ContextManagerRemoteMutationReceipt,
  type ContextManagerRemoteDeleteReceipt,
  type ContextManagerRemoteSessionPresetIdentity,
  type ContextManagerRemotePromptRuntimeInspection,
  type ContextManagerRemoteSkillRuntimeInspection,
  type ContextManagerRemotePinnedSkillInspection,
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

function assertResourceFixture(value: { readonly revision: number; readonly incarnationId: string | null }, source: string): void {
  assert.ok(Number.isSafeInteger(value.revision) && value.revision > 0, source + ' requires a positive safe revision')
  assert.ok(value.incarnationId === null || typeof value.incarnationId === 'string', source + ' requires an opaque string or null incarnation')
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
    resourceAuthorityId: 'resource-host-a',
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
    readPreset: 0,
    nativePresetWrite: 0,
    promptPlacement: 0,
    profileMutation: 0,
    resourceMutation: 0,
    listPromptResources: 0,
    getPromptResource: 0,
    sessionPreset: 0,
    promptRuntime: 0,
    skillRuntime: 0,
    pinnedRuntime: 0,
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
  readonly presetBodySteps: Array<Step<ContextManagerRemoteResult<ContextManagerRemotePresetDocument>>> = []
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

  readPreset(id: string): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePresetDocument>>> {
    this.calls.readPreset += 1
    return this.take(this.presetBodySteps, businessOk({ id, content: 'native body:' + id }))
  }

  copyPreset(_from: string, id: string, _name: string | null) {
    this.calls.nativePresetWrite += 1
    const directory = this.defaultPresets.directory
    if (directory.status === 'available') {
      this.defaultPresets = {
        ...this.defaultPresets,
        directory: { ...directory, presets: [...directory.presets, { id, trust: 'user', isDefault: false }] },
      }
      this.defaultChanges = { ...this.defaultChanges,
        generation: this.defaultChanges.generation + 1,
        presets: this.defaultChanges.presets + 1,
      }
    }
    return Promise.resolve(ok(businessOk({ id })))
  }

  removePreset(id: string) {
    this.calls.nativePresetWrite += 1
    const directory = this.defaultPresets.directory
    if (directory.status === 'available') {
      this.defaultPresets = { ...this.defaultPresets,
        directory: { ...directory, presets: directory.presets.filter(row => row.id !== id) },
      }
      this.defaultChanges = { ...this.defaultChanges,
        generation: this.defaultChanges.generation + 1,
        presets: this.defaultChanges.presets + 1,
      }
    }
    return Promise.resolve(ok(businessOk({ id })))
  }

  promptPlacement(): Promise<RemoteResult<ContextManagerRemotePromptPlacementCapability>> {
    this.calls.promptPlacement += 1
    return this.take(this.placementSteps, this.defaultPlacement)
  }

  resourceList: readonly ContextManagerRemotePromptResourceListItem[] = [{ status: 'usable', id: 'alpha', name: 'Alpha', revision: 5, incarnationId: null }]
  resource: ContextManagerRemotePromptResource = { id: 'alpha', name: 'Alpha', content: 'body', revision: 5, incarnationId: null }
  session: ContextManagerRemoteSessionPresetIdentity = { status: 'known', sessionId: 's', presetId: null }
  prompt: ContextManagerRemotePromptRuntimeInspection = { status: 'runtime-unavailable' }
  skill: ContextManagerRemoteSkillRuntimeInspection = { status: 'runtime-unavailable' }
  pinned: ContextManagerRemotePinnedSkillInspection = { status: 'runtime-unavailable' }
  readonly resourceSteps: Array<Step<ContextManagerRemoteResult<ContextManagerRemotePromptResource>>> = []
  readonly listSteps: Array<Step<ContextManagerRemoteResult<readonly ContextManagerRemotePromptResourceListItem[]>>> = []
  readonly sessionSteps: Array<Step<ContextManagerRemoteSessionPresetIdentity>> = []

  listPromptResources() {
    this.calls.listPromptResources += 1
    for (const row of this.resourceList) {
      if (row.status === 'usable') assertResourceFixture(row, 'resource directory fixture')
    }
    return this.take(this.listSteps, businessOk(this.resourceList))
  }
  getPromptResource(_id: string) {
    this.calls.getPromptResource += 1
    assertResourceFixture(this.resource, 'resource document fixture')
    return this.take(this.resourceSteps, businessOk(this.resource))
  }
  sessionPreset(_id: string) {
    this.calls.sessionPreset += 1
    return this.take(this.sessionSteps, this.session)
  }
  inspectPromptRuntime(_id: string) {
    this.calls.promptRuntime += 1
    return Promise.resolve(ok(this.prompt))
  }
  inspectSkillRuntime(_id: string) {
    this.calls.skillRuntime += 1
    return Promise.resolve(ok(this.skill))
  }
  inspectPinnedSkillRuntime(_id: string) {
    this.calls.pinnedRuntime += 1
    return Promise.resolve(ok(this.pinned))
  }

  readonly resourceMutationCalls: Array<{
    readonly kind: string
    readonly id: string
    readonly args: readonly unknown[]
    readonly basis: ContextManagerRemoteResourceCreateBasis | ContextManagerRemoteResourceMutationBasis
  }> = []
  readonly resourceMutationSteps: Array<Step<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>> = []
  readonly resourceDeleteSteps: Array<Step<ContextManagerRemoteResult<ContextManagerRemoteDeleteReceipt>>> = []

  private resourceWrite(
    kind: string,
    id: string,
    args: readonly unknown[],
    basis: ContextManagerRemoteResourceCreateBasis | ContextManagerRemoteResourceMutationBasis,
  ): Promise<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>> {
    this.calls.resourceMutation += 1
    this.resourceMutationCalls.push({ kind, id, args, basis })
    const revision = 'revision' in basis ? basis.revision + 1 : 1
    return this.take(this.resourceMutationSteps, businessOk({ id, revision }))
  }

  createPromptResource(id: string, input: ContextManagerRemotePromptResourceInput, basis: ContextManagerRemoteResourceCreateBasis) {
    return this.resourceWrite('create', id, [input], basis)
  }
  replacePromptResource(id: string, input: ContextManagerRemotePromptResourceInput, basis: ContextManagerRemoteResourceMutationBasis) {
    return this.resourceWrite('replace', id, [input], basis)
  }
  deletePromptResource(id: string, basis: ContextManagerRemoteResourceMutationBasis) {
    this.calls.resourceMutation += 1
    this.resourceMutationCalls.push({ kind: 'delete', id, args: [], basis })
    return this.take(this.resourceDeleteSteps, businessOk({ id }))
  }
  setPromptResourceName(id: string, name: string, basis: ContextManagerRemoteResourceMutationBasis) {
    return this.resourceWrite('name', id, [name], basis)
  }
  setPromptResourceDescription(id: string, description: string | null, basis: ContextManagerRemoteResourceMutationBasis) {
    return this.resourceWrite('description', id, [description], basis)
  }
  setPromptResourceContent(id: string, content: string, basis: ContextManagerRemoteResourceMutationBasis) {
    return this.resourceWrite('content', id, [content], basis)
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
  assert.equal(snapshot.profiles.error?.kind === 'remote' ? snapshot.profiles.error.code : undefined, 'latest-profile-protocol-error')
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

test('a synchronous settled-success subscriber detach changes the returned result to detached', async () => {
  const { model, detach } = await attachAndReady()

  let unsubscribe = () => {}
  unsubscribe = model.mutations.state.subscribe(() => {
    const operation = model.mutations.state.getSnapshot().profile
    if (
      operation.status !== 'settled'
      || operation.result.status !== 'applied'
    ) {
      return
    }
    unsubscribe()
    detach()
  })

  const result = await model.mutations.setProfileName(
    requireProfileMutationBasis(model),
    'main',
    'Commit-point detach',
  )

  assert.deepEqual(result, { status: 'detached' })
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'idle')

  unsubscribe()
  model.dispose()
})

test('a synchronous settled-success subscriber reattach supersedes the old result', async () => {
  const { model, detach } = await attachAndReady()
  const nextRemote = new ScriptedRemote()
  nextRemote.defaultChanges = changes('host-b')
  let detachNext = () => {}

  let unsubscribe = () => {}
  unsubscribe = model.mutations.state.subscribe(() => {
    const operation = model.mutations.state.getSnapshot().profile
    if (
      operation.status !== 'settled'
      || operation.result.status !== 'applied'
    ) {
      return
    }
    unsubscribe()
    detach()
    detachNext = model.attach(nextRemote)
  })

  const result = await model.mutations.setProfileName(
    requireProfileMutationBasis(model),
    'main',
    'Commit-point reattach',
  )

  assert.deepEqual(result, { status: 'superseded' })
  await waitFor(
    () => model.state.getSnapshot().instanceId === 'host-b',
    'replacement Host to hydrate after settled publication',
  )
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'idle')

  unsubscribe()
  detachNext()
  model.dispose()
})

test('a synchronous precondition publication detach supersedes the stale-basis rejection', async () => {
  const { model, remote, detach } = await attachAndReady()
  const draftBasis = requireProfileMutationBasis(model)

  remote.changesSteps.push(
    async () => ok(changes('host-a', 2, 2, 1, 1)),
    async () => ok(changes('host-a', 2, 2, 1, 1)),
  )
  remote.profilesSteps.push(async () => ok(profiles(8)))
  await model.reconcile(['profiles'])

  let unsubscribe = () => {}
  unsubscribe = model.mutations.state.subscribe(() => {
    const operation = model.mutations.state.getSnapshot().profile
    if (
      operation.status !== 'settled'
      || operation.result.status !== 'rejected'
      || operation.result.error.kind !== 'precondition'
      || operation.result.error.code !== 'profile-basis-stale'
    ) {
      return
    }
    unsubscribe()
    detach()
  })

  const before = remote.calls.profileMutation
  const result = await model.mutations.setProfileName(
    draftBasis,
    'main',
    'Stale at terminal publication',
  )

  assert.deepEqual(result, { status: 'detached' })
  assert.equal(remote.calls.profileMutation, before)
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'idle')

  unsubscribe()
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



function advanceResourceFixture(
  remote: ScriptedRemote,
  resource: ContextManagerRemotePromptResource | null,
): void {
  remote.resourceList = resource === null ? [] : [{
    status: 'usable',
    id: resource.id,
    name: resource.name,
    ...(resource.description === undefined ? {} : { description: resource.description }),
    revision: resource.revision,
    incarnationId: resource.incarnationId,
  }]
  if (resource !== null) remote.resource = resource
  remote.defaultChanges = {
    ...remote.defaultChanges,
    generation: remote.defaultChanges.generation + 1,
    promptResources: remote.defaultChanges.promptResources + 1,
    runtime: remote.defaultChanges.runtime + 1,
  }
}

test('lazy resource directory and document reads keep revision and content separate', async () => {
  const { model, remote } = await attachAndReady()
  assert.equal(remote.calls.listPromptResources, 0)
  assert.equal(remote.calls.getPromptResource, 0)
  assert.equal((await model.loadPromptResourceList()).status, 'completed')
  assert.equal(remote.calls.getPromptResource, 0)
  assert.deepEqual(model.capturePromptResourceReadStamp('alpha', 'list'), {
    instanceId: 'host-a', resourceAuthorityId: 'resource-host-a', resourceId: 'alpha', incarnationId: null, revision: 5, source: 'list',
  })
  assert.equal((await model.loadPromptResource('alpha')).status, 'completed')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.content, 'body')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.revision, 5)
  model.dispose()
})

test('resource business failures remain distinct from transport failures', async () => {
  const { model, remote } = await attachAndReady()
  remote.resourceSteps.push(async () => ok(businessFail('prompt-resource-not-found')))
  await model.loadPromptResource('missing')
  assert.deepEqual(model.state.getSnapshot().resources.documents.get('missing')?.error?.kind, 'business')
  remote.resourceSteps.push(async () => fail())
  await model.loadPromptResource('missing')
  assert.deepEqual(model.state.getSnapshot().resources.documents.get('missing')?.error?.kind, 'remote')
  model.dispose()
})

test('newer same-key requests own publication while different diagnostic keys remain isolated', async () => {
  const { model, remote } = await attachAndReady()
  const old = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePromptResource>>>()
  remote.resourceSteps.push(() => old.promise)
  const first = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.getPromptResource === 1, 'first keyed request')
  remote.resource = { id: 'alpha', name: 'New', content: 'new', revision: 6, incarnationId: null }
  const second = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.getPromptResource === 2, 'second keyed request')
  await second
  old.resolve(ok(businessOk({ id: 'alpha', name: 'Old', content: 'old', revision: 5, incarnationId: null })))
  assert.equal((await first).status, 'superseded')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.content, 'new')
  assert.equal((await model.loadSessionPreset('s')).status, 'completed')
  assert.deepEqual(model.state.getSnapshot().diagnostics.sessions.get('s')?.data, {
    status: 'known', sessionId: 's', presetId: null,
  })
  model.dispose()
})

test('resource cursor invalidation stales content but does not contaminate runtime state', async () => {
  const { model, remote } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  await model.loadAgentSkillRuntime('a')
  remote.defaultChanges = { ...remote.defaultChanges, generation: 2, promptResources: 1 }
  await model.loadSessionPreset('s')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.stale, true)
  assert.equal(model.state.getSnapshot().diagnostics.skills.get('a')?.stale, false)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  model.dispose()
})

test('keyed reads cannot publish after detach', async () => {
  const { model, remote, detach } = await attachAndReady()
  const gate = deferred<RemoteResult<ContextManagerRemoteSessionPresetIdentity>>()
  remote.sessionSteps.push(() => gate.promise)
  const request = model.loadSessionPreset('s')
  await waitFor(() => remote.calls.sessionPreset === 1, 'session request')
  detach()
  gate.resolve(ok({ status: 'known', sessionId: 's', presetId: 'obsolete' }))
  assert.equal((await request).status, 'detached')
  assert.equal(model.state.getSnapshot().diagnostics.sessions.get('s'), undefined)
  model.dispose()
})


test('all three Agent diagnostic families are individually lazy and retain domain statuses', async () => {
  const { model, remote } = await attachAndReady()
  assert.equal(remote.calls.promptRuntime, 0)
  assert.equal(remote.calls.skillRuntime, 0)
  assert.equal(remote.calls.pinnedRuntime, 0)
  remote.prompt = { status: 'assembly-bypassed', agentId: 'p' }
  remote.skill = { status: 'agent-not-live', agentId: 's' }
  remote.pinned = { status: 'runtime-unavailable' }
  await model.loadAgentPromptRuntime('p')
  await model.loadAgentSkillRuntime('s')
  await model.loadAgentPinnedRuntime('z')
  assert.deepEqual(model.state.getSnapshot().diagnostics.prompts.get('p')?.data, { status: 'assembly-bypassed', agentId: 'p' })
  assert.deepEqual(model.state.getSnapshot().diagnostics.skills.get('s')?.data, { status: 'agent-not-live', agentId: 's' })
  assert.deepEqual(model.state.getSnapshot().diagnostics.pinned.get('z')?.data, { status: 'runtime-unavailable' })
  assert.equal(remote.calls.promptRuntime, 1)
  assert.equal(remote.calls.skillRuntime, 1)
  assert.equal(remote.calls.pinnedRuntime, 1)
  model.dispose()
})

test('invalid resource summaries have no editable revision stamp and exact string IDs do not collide', async () => {
  const { model, remote } = await attachAndReady()
  remote.resourceList = [{ status: 'invalid', id: '__proto__', message: 'invalid stored resource' }]
  await model.loadPromptResourceList()
  assert.equal(model.capturePromptResourceReadStamp('__proto__', 'list'), undefined)
  remote.resource = { id: '__proto__', name: 'Special', content: 'exact', revision: 2, incarnationId: null }
  await model.loadPromptResource('__proto__')
  assert.equal(model.state.getSnapshot().resources.documents.get('__proto__')?.data?.content, 'exact')
  assert.equal(model.capturePromptResourceReadStamp('__proto__', 'document')?.revision, 2)
  model.dispose()
})

test('a resource list revision change invalidates only a mismatched cached document', async () => {
  const { model, remote } = await attachAndReady()
  await model.loadPromptResource('alpha')
  remote.resourceList = [{ status: 'usable', id: 'alpha', name: 'Alpha', revision: 6, incarnationId: null }]
  await model.loadPromptResourceList()
  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.resources.list.stale, false)
  assert.equal(snapshot.resources.documents.get('alpha')?.stale, true)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'list')?.revision, 6)
  model.dispose()
})

test('a changed resource cursor during a read retries before accepting resource content', async () => {
  const { model, remote } = await attachAndReady()
  const oldChanges = remote.defaultChanges
  remote.defaultChanges = { ...oldChanges, generation: 2, promptResources: 1 }
  remote.changesSteps.push(async () => ok(oldChanges))
  remote.changesSteps.push(async () => ok(remote.defaultChanges))
  remote.resourceSteps.push(async () => ok(businessOk({ id: 'alpha', name: 'Old', content: 'old', revision: 1, incarnationId: null })))
  remote.resource = { id: 'alpha', name: 'New', content: 'new', revision: 2, incarnationId: null }
  const result = await model.loadPromptResource('alpha')
  assert.equal(result.status, 'completed')
  assert.equal(remote.calls.getPromptResource, 2)
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.content, 'new')
  model.dispose()
})

test('lazy-first Host authority replacement invalidates old caches and rehydrates baseline', async () => {
  const { model, remote } = await attachAndReady()
  await model.loadPromptResource('alpha')
  remote.defaultChanges = { instanceId: 'host-b', resourceAuthorityId: 'resource-host-b', generation: 1, profiles: 1, promptResources: 0, presets: 1, runtime: 1 }
  remote.resource = { id: 'alpha', name: 'New Host', content: 'host-b', revision: 1, incarnationId: null }
  assert.equal((await model.loadPromptResource('alpha')).status, 'completed')
  await waitFor(() => {
    const snapshot = model.state.getSnapshot()
    return snapshot.instanceId === 'host-b' && snapshot.profiles.status === 'ready' && snapshot.protocol.status === 'compatible'
  }, 'baseline rehydrated after lazy Host replacement')
  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.resources.documents.get('alpha')?.data?.content, 'host-b')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.instanceId, 'host-b')
  model.dispose()
})

test('lazy protocol incompatibility clears stale Resource write observations', async () => {
  const { model, remote } = await attachAndReady()
  await model.loadPromptResource('alpha')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.revision, 5)
  remote.defaultProtocol = { apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }
  assert.equal((await model.loadPromptResource('alpha')).status, 'incompatible')
  assert.equal(model.state.getSnapshot().protocol.status, 'incompatible')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  model.dispose()
})


test('P1 regression: lazy before-bracket Host change recovers baseline despite synchronous same-key supersession', async () => {
  const { model, remote, detach } = await attachAndReady()
  remote.defaultChanges = changes('host-b')
  let successor: ReturnType<typeof model.loadPromptResource> | undefined
  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (snapshot.instanceId !== 'host-b' || snapshot.profiles.status !== 'idle') return
    unsubscribe()
    successor = model.loadPromptResource('alpha')
  })
  const old = await model.loadPromptResource('alpha')
  assert.equal(old.status, 'superseded')
  assert.ok(successor)
  await successor
  await waitFor(() => {
    const snapshot = model.state.getSnapshot()
    return snapshot.instanceId === 'host-b'
      && snapshot.protocol.status === 'compatible'
      && snapshot.profiles.status === 'ready'
      && snapshot.presets.status === 'ready'
      && snapshot.promptPlacement.status === 'ready'
  }, 'baseline recovery after synchronous lazy supersession')
  unsubscribe()
  detach()
  model.dispose()
})

test('P1 regression: lazy after-bracket Host change still schedules baseline recovery on same-key reentrancy', async () => {
  const { model, remote, detach } = await attachAndReady()
  remote.defaultChanges = changes('host-b')
  remote.changesSteps.push(async () => ok(changes('host-a')))
  let successor: ReturnType<typeof model.loadPromptResource> | undefined
  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (snapshot.instanceId !== 'host-b' || snapshot.profiles.status !== 'idle') return
    unsubscribe()
    successor = model.loadPromptResource('alpha')
  })
  const old = await model.loadPromptResource('alpha')
  assert.equal(old.status, 'superseded')
  assert.ok(successor)
  await successor
  await waitFor(() => {
    const snapshot = model.state.getSnapshot()
    return snapshot.instanceId === 'host-b'
      && snapshot.profiles.status === 'ready'
      && snapshot.presets.status === 'ready'
      && snapshot.promptPlacement.status === 'ready'
  }, 'baseline recovery when after-bracket discovers Host')
  unsubscribe()
  detach()
  model.dispose()
})

test('P2 regression: delayed lazy incompatible result cannot wipe a newer compatible baseline proof', async () => {
  const { model, remote, detach } = await attachAndReady()
  const staleProtocol = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const before = remote.calls.protocol
  remote.protocolSteps.push(() => staleProtocol.promise)
  const old = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.protocol === before + 1, 'old lazy protocol request')
  await model.reconcile(['profiles'])
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  staleProtocol.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }))
  const oldResult = await old
  assert.notEqual(oldResult.status, 'incompatible')
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  assert.equal(model.state.getSnapshot().profiles.status, 'ready')
  assert.equal(model.getProfileRevision(), 7)
  detach()
  model.dispose()
})

test('P2 regression: lazy incompatible must be confirmed by guarded global protocol proof', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResource('alpha')
  const before = remote.calls.protocol
  remote.defaultProtocol = { apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }
  const result = await model.loadPromptResource('alpha')
  assert.equal(result.status, 'incompatible')
  assert.equal(remote.calls.protocol, before + 2)
  assert.equal(model.state.getSnapshot().protocol.status, 'incompatible')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  detach()
  model.dispose()
})


test('P1 recovery ticket does not issue a stale baseline Remote call after synchronous detach', async () => {
  const { model, remote, detach } = await attachAndReady()
  const initialProfileCalls = remote.calls.profiles
  remote.defaultChanges = changes('host-b')
  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (snapshot.instanceId !== 'host-b' || snapshot.profiles.status !== 'idle') return
    unsubscribe()
    detach()
  })
  const result = await model.loadPromptResource('alpha')
  assert.equal(result.status, 'detached')
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(remote.calls.profiles, initialProfileCalls)
  assert.equal(model.state.getSnapshot().attachment, 'detached')
  unsubscribe()
  model.dispose()
})

test('P1 synchronous Host replacement schedules only one baseline recovery for multiple lazy readers', async () => {
  const { model, remote, detach } = await attachAndReady()
  const initialProfileCalls = remote.calls.profiles
  remote.defaultChanges = changes('host-b')
  let successor: ReturnType<typeof model.loadSessionPreset> | undefined
  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (snapshot.instanceId !== 'host-b' || snapshot.profiles.status !== 'idle') return
    unsubscribe()
    successor = model.loadSessionPreset('session-new')
  })
  await model.loadPromptResource('alpha')
  assert.ok(successor)
  await successor
  await waitFor(() => model.state.getSnapshot().profiles.status === 'ready', 'single Host baseline recovery')
  assert.equal(remote.calls.profiles, initialProfileCalls + 1)
  assert.equal(model.state.getSnapshot().instanceId, 'host-b')
  unsubscribe()
  detach()
  model.dispose()
})

test('P2 global verification survives same-key supersession after it has claimed protocol ownership', async () => {
  const { model, remote, detach } = await attachAndReady()
  const verificationGate = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const initialCalls = remote.calls.protocol
  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }),
    () => verificationGate.promise,
  )
  const first = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.protocol === initialCalls + 2, 'global lazy protocol verification started')
  const second = model.loadPromptResource('alpha')
  await second
  verificationGate.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }))
  assert.equal((await first).status, 'incompatible')
  assert.equal(model.state.getSnapshot().protocol.status, 'incompatible')
  assert.equal(model.state.getSnapshot().resources.documents.size, 0)
  detach()
  model.dispose()
})

test('P2 a newer baseline protocol proof supersedes an in-flight lazy global verification', async () => {
  const { model, remote, detach } = await attachAndReady()
  const verificationGate = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const before = remote.calls.protocol
  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }),
    () => verificationGate.promise,
  )
  const old = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.protocol === before + 2, 'lazy verification waiting')
  await model.reconcile(['profiles'])
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  verificationGate.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }))
  assert.equal((await old).status, 'superseded')
  assert.equal(model.state.getSnapshot().protocol.status, 'compatible')
  assert.equal(model.getProfileRevision(), 7)
  detach()
  model.dispose()
})

test('P2 verification cannot overwrite the new attachment after detach and reattach', async () => {
  const { model, remote, detach } = await attachAndReady()
  const gate = deferred<RemoteResult<ContextManagerRemoteProtocol>>()
  const before = remote.calls.protocol
  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }),
    () => gate.promise,
  )
  const old = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.protocol === before + 2, 'old attachment protocol verification')
  detach()
  const nextRemote = new ScriptedRemote()
  nextRemote.defaultChanges = changes('host-c')
  nextRemote.defaultProfiles = profiles(77)
  const detachNext = model.attach(nextRemote)
  gate.resolve(ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }))
  assert.equal((await old).status, 'detached')
  await waitFor(() => {
    const snapshot = model.state.getSnapshot()
    return snapshot.instanceId === 'host-c' && snapshot.profiles.status === 'ready'
      && snapshot.protocol.status === 'compatible'
  }, 'new attachment rehydration')
  assert.equal(model.getProfileRevision(), 77)
  detachNext()
  model.dispose()
})

test('P2 failed verification reports a protocol error rather than claiming incompatible', async () => {
  const { model, remote, detach } = await attachAndReady()
  remote.protocolSteps.push(
    async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }),
    async () => fail('verification-transport-failed'),
  )
  assert.equal((await model.loadPromptResource('alpha')).status, 'completed')
  const snapshot = model.state.getSnapshot()
  assert.equal(snapshot.protocol.status, 'error')
  assert.equal(snapshot.resources.documents.get('alpha')?.error?.kind, 'remote')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  detach()
  model.dispose()
})

test('P2 a synchronous checking subscriber detach prevents the verification RPC itself', async () => {
  const { model, remote, detach } = await attachAndReady()
  const before = remote.calls.protocol
  remote.protocolSteps.push(async () => ok({ apiVersion: CONTEXT_MANAGER_REMOTE_API_VERSION + 1 }))
  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    if (model.state.getSnapshot().protocol.status !== 'checking') return
    unsubscribe()
    detach()
  })
  const result = await model.loadPromptResource('alpha')
  assert.equal(result.status, 'detached')
  assert.equal(remote.calls.protocol, before + 1)
  assert.equal(model.state.getSnapshot().attachment, 'detached')
  unsubscribe()
  model.dispose()
})


test('P1 rapid Host A-B-C changes retire older recovery tickets and rehydrate the latest Host', async () => {
  const { model, remote, detach } = await attachAndReady()
  remote.defaultChanges = changes('host-b')
  let successor: ReturnType<typeof model.loadSessionPreset> | undefined
  let unsubscribe = () => {}
  unsubscribe = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (snapshot.instanceId !== 'host-b' || snapshot.profiles.status !== 'idle') return
    unsubscribe()
    remote.defaultChanges = changes('host-c')
    successor = model.loadSessionPreset('session-c')
  })
  const first = model.loadPromptResource('alpha')
  assert.ok(successor === undefined)
  await first
  assert.ok(successor)
  await successor
  await waitFor(() => {
    const snapshot = model.state.getSnapshot()
    return snapshot.instanceId === 'host-c'
      && snapshot.protocol.status === 'compatible'
      && snapshot.profiles.status === 'ready'
      && snapshot.presets.status === 'ready'
      && snapshot.promptPlacement.status === 'ready'
  }, 'latest Host C rehydration')
  assert.equal(model.state.getSnapshot().instanceId, 'host-c')
  unsubscribe()
  detach()
  model.dispose()
})

test('different keyed reads make independent progress while another resource read is held', async () => {
  const { model, remote, detach } = await attachAndReady()
  const gate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePromptResource>>>()
  remote.resourceSteps.push(() => gate.promise)
  const document = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.getPromptResource === 1, 'held resource request')
  const session = await model.loadSessionPreset('s')
  assert.equal(session.status, 'completed')
  assert.equal(model.state.getSnapshot().diagnostics.sessions.get('s')?.status, 'ready')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.status, 'loading')
  gate.resolve(ok(businessOk(remote.resource)))
  assert.equal((await document).status, 'completed')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.status, 'ready')
  detach()
  model.dispose()
})

test('keyed caches evict old entries at the documented 32-document and 64-session limits', async () => {
  const { model, remote, detach } = await attachAndReady()
  for (let i = 0; i < 33; i += 1) {
    const id = 'resource-' + String(i)
    remote.resource = { id, name: 'Name ' + String(i), content: 'body', revision: i + 1, incarnationId: null }
    assert.equal((await model.loadPromptResource(id)).status, 'completed')
  }
  const documents = model.state.getSnapshot().resources.documents
  assert.equal(documents.size, 32)
  assert.equal(documents.has('resource-0'), false)
  assert.equal(documents.has('resource-32'), true)

  for (let i = 0; i < 65; i += 1) {
    const id = 'session-' + String(i)
    remote.session = { status: 'known', sessionId: id, presetId: null }
    assert.equal((await model.loadSessionPreset(id)).status, 'completed')
  }
  const sessions = model.state.getSnapshot().diagnostics.sessions
  assert.equal(sessions.size, 64)
  assert.equal(sessions.has('session-0'), false)
  assert.equal(sessions.has('session-64'), true)
  detach()
  model.dispose()
})

test('a continuously moving keyed cursor exhausts exactly three stabilizations without publishing a fresh stamp', async () => {
  const { model, remote, detach } = await attachAndReady()
  const before = remote.calls.getPromptResource
  for (let i = 0; i < 3; i += 1) {
    const generation = i * 2 + 2
    remote.changesSteps.push(
      async () => ok({ ...changes('host-a', generation), promptResources: generation }),
      async () => ok({ ...changes('host-a', generation + 1), promptResources: generation + 1 }),
    )
  }
  const result = await model.loadPromptResource('alpha')
  assert.equal(result.status, 'completed')
  assert.equal(remote.calls.getPromptResource, before + 3)
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.error?.kind, 'unstable-snapshot')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  detach()
  model.dispose()
})


test('v3 Resource Authority changes stale only Resource caches even with unchanged numeric cursors', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  await model.loadAgentSkillRuntime('a')
  const oldStamp = model.capturePromptResourceReadStamp('alpha', 'document')
  assert.equal(oldStamp?.resourceAuthorityId, 'resource-host-a')
  remote.defaultChanges = { ...remote.defaultChanges, resourceAuthorityId: 'resource-host-b' }
  await model.loadSessionPreset('s')
  assert.equal(model.state.getSnapshot().resources.list.stale, true)
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.stale, true)
  assert.equal(model.state.getSnapshot().diagnostics.skills.get('a')?.stale, true)
  assert.equal(model.state.getSnapshot().profiles.stale, false)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  await model.loadPromptResource('alpha')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.resourceAuthorityId, 'resource-host-b')
  detach()
  model.dispose()
})

test('v3 directory incarnation change stales an equal-revision cached resource body', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.stale, false)
  remote.resourceList = [{ status: 'usable', id: 'alpha', name: 'replacement', revision: 5,
    incarnationId: '11b15985-e54c-4af1-88bb-e3dfed584678' }]
  await model.loadPromptResourceList()
  assert.equal(model.state.getSnapshot().resources.list.stale, false)
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.stale, true)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'list')?.incarnationId, '11b15985-e54c-4af1-88bb-e3dfed584678')
  detach()
  model.dispose()
})

test('v3 Resource Authority drift across a changes bracket retries even with equal numeric cursor', async () => {
  const { model, remote, detach } = await attachAndReady()
  const before = remote.defaultChanges
  const after = { ...before, resourceAuthorityId: 'resource-host-b' }
  remote.changesSteps.push(async () => ok(before), async () => ok(after))
  remote.defaultChanges = after
  const initialCalls = remote.calls.getPromptResource
  await model.loadPromptResource('alpha')
  assert.equal(remote.calls.getPromptResource, initialCalls + 2)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.resourceAuthorityId, 'resource-host-b')
  detach()
  model.dispose()
})

test('B2-B0 RED: older A change response cannot roll back a newer B storage authority snapshot', async () => {
  const { model, remote, detach } = await attachAndReady()
  const oldA = remote.defaultChanges
  const nextB = {
    ...oldA, resourceAuthorityId: 'resource-host-b',
    generation: oldA.generation + 1,
    promptResources: oldA.promptResources + 1,
    runtime: oldA.runtime + 1,
  }
  const oldBefore = deferred<RemoteResult<ContextManagerRemoteChangeSnapshot>>()
  const slowSession = deferred<RemoteResult<ContextManagerRemoteSessionPresetIdentity>>()
  remote.changesSteps.push(() => oldBefore.promise)
  remote.sessionSteps.push(() => slowSession.promise)
  const initialChangeCalls = remote.calls.changes
  const initialSessionCalls = remote.calls.sessionPreset
  const old = model.loadSessionPreset('delayed-A')
  await waitFor(() => remote.calls.changes === initialChangeCalls + 1, 'old A changes request started')
  remote.defaultChanges = nextB
  const current = await model.loadAgentSkillRuntime('new-B')
  assert.equal(current.status, 'completed')
  assert.equal(model.state.getSnapshot().changes?.resourceAuthorityId, 'resource-host-b')
  assert.equal(model.state.getSnapshot().changes?.generation, nextB.generation)

  oldBefore.resolve(ok(oldA))
  await waitFor(() => remote.calls.sessionPreset > initialSessionCalls, 'old request passed changes bracket')
  assert.equal(model.state.getSnapshot().changes?.resourceAuthorityId, 'resource-host-b')
  assert.equal(model.state.getSnapshot().changes?.generation, nextB.generation)
  slowSession.resolve(ok(remote.session))
  await old
  assert.equal(model.state.getSnapshot().changes?.resourceAuthorityId, 'resource-host-b')
  detach()
  model.dispose()
})


test('B2-B1 create captures Resource Authority without eager Resource directory and recovers metadata only', async () => {
  const { model, remote, detach } = await attachAndReady()
  assert.equal(remote.calls.listPromptResources, 0)
  assert.deepEqual(model.capturePromptResourceCreateBasis(), { resourceAuthorityId: 'resource-host-a' })
  remote.resourceMutationSteps.push(async () => {
    remote.resourceList = [{ status: 'usable', id: 'created', name: 'Created', revision: 1, incarnationId: 'new-uuid' }]
    remote.defaultChanges = { ...remote.defaultChanges, generation: 2, promptResources: 1 }
    return ok(businessOk({ id: 'created', revision: 1 }))
  })
  const result = await model.resourceMutations.createPromptResource(
    { resourceAuthorityId: 'resource-host-a' },
    'created',
    { name: 'Created', content: 'New' },
  )
  assert.deepEqual(result, { status: 'applied', refresh: 'fresh' })
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(remote.calls.getPromptResource, 0)
  assert.equal(model.state.getSnapshot().resources.list.data?.[0]?.id, 'created')
  detach()
  model.dispose()
})

test('B2-B1 write recovery ignores receipt revision and adopts only B1-3 list/document reads', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  const stamp = model.capturePromptResourceReadStamp('alpha', 'document')
  assert.ok(stamp)
  remote.resourceMutationSteps.push(async () => {
    advanceResourceFixture(remote, { id: 'alpha', name: 'Fresh', content: 'latest', revision: 6, incarnationId: 'stable-id' })
    return ok(businessOk({ id: 'alpha', revision: 999 }))
  })
  const result = await model.resourceMutations.setPromptResourceName(stamp, 'Fresh')
  assert.deepEqual(result, { status: 'applied', refresh: 'fresh' })
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.content, 'latest')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.revision, 6)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.incarnationId, 'stable-id')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document')?.revision, 6)
  assert.equal(model.resourceMutations.state.getSnapshot().resource.status, 'settled')
  detach()
  model.dispose()
})

test('B2-B1 a pre-write in-flight document read cannot resurrect old body after recovery', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const stamp = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(stamp)
  const oldRead = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePromptResource>>>()
  remote.resourceSteps.push(() => oldRead.promise)
  const pendingRead = model.loadPromptResource('alpha')
  await waitFor(() => remote.calls.getPromptResource >= 1, 'in-flight old body')
  remote.resourceMutationSteps.push(async () => {
    advanceResourceFixture(remote, { id: 'alpha', name: 'Current', content: 'new body', revision: 6, incarnationId: null })
    return ok(businessOk({ id: 'alpha', revision: 6 }))
  })
  const result = await model.resourceMutations.setPromptResourceName(stamp, 'Current')
  assert.deepEqual(result, { status: 'applied', refresh: 'fresh' })
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.content, 'new body')
  oldRead.resolve(ok(businessOk({ id: 'alpha', name: 'Old', content: 'old body', revision: 5, incarnationId: null })))
  assert.equal((await pendingRead).status, 'superseded')
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.data?.content, 'new body')
  detach()
  model.dispose()
})

test('B2-B1 Profile instance change does not supersede an in-flight Resource write on unchanged storage source', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const stamp = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(stamp)
  const gate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>>()
  remote.resourceMutationSteps.push(() => gate.promise)
  const pending = model.resourceMutations.setPromptResourceName(stamp, 'Good')
  assert.equal(remote.calls.resourceMutation, 1)
  remote.defaultChanges = { ...changes('host-b', 2), resourceAuthorityId: 'resource-host-a', promptResources: 1 }
  await model.refresh()
  assert.equal(model.state.getSnapshot().instanceId, 'host-b')
  remote.resourceList = [{ status: 'usable', id: 'alpha', name: 'Good', revision: 6, incarnationId: null }]
  gate.resolve(ok(businessOk({ id: 'alpha', revision: 6 })))
  assert.deepEqual(await pending, { status: 'applied', refresh: 'fresh' })
  assert.equal(remote.calls.resourceMutation, 1)
  detach()
  model.dispose()
})

test('B2-B1 accepted Resource Authority rotation supersedes a delayed write even without Profile instance change', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const stamp = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(stamp)
  const gate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>>()
  remote.resourceMutationSteps.push(() => gate.promise)
  const pending = model.resourceMutations.setPromptResourceName(stamp, 'Old source')
  assert.equal(remote.calls.resourceMutation, 1)
  remote.defaultChanges = {
    ...remote.defaultChanges, generation: 2, resourceAuthorityId: 'resource-host-b',
    promptResources: 1, runtime: 2,
  }
  await model.loadSessionPreset('s')
  gate.resolve(ok(businessOk({ id: 'alpha', revision: 6 })))
  assert.deepEqual(await pending, { status: 'superseded' })
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(model.resourceMutations.state.getSnapshot().resource.status, 'idle')
  detach()
  model.dispose()
})

test('B2-B1 successful deletion stales the old document and refreshes the directory without a missing-document RPC', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  const stamp = model.capturePromptResourceReadStamp('alpha', 'document')
  assert.ok(stamp)
  const readCalls = remote.calls.getPromptResource
  remote.resourceDeleteSteps.push(async () => {
    advanceResourceFixture(remote, null)
    return ok(businessOk({ id: 'alpha' }))
  })
  assert.deepEqual(await model.resourceMutations.deletePromptResource(stamp), { status: 'applied', refresh: 'fresh' })
  assert.deepEqual(model.state.getSnapshot().resources.list.data, [])
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.stale, true)
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'document'), undefined)
  assert.equal(remote.calls.getPromptResource, readCalls)
  detach()
  model.dispose()
})

test('B2-B1 conflict is not retried and unknown remains unknown after valid read recovery', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const stamp = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(stamp)
  remote.resourceMutationSteps.push(async () => {
    advanceResourceFixture(remote, { id: 'alpha', name: 'Other', content: 'body', revision: 6, incarnationId: 'new-entity' })
    return ok(businessFail('prompt-resource-incarnation-conflict'))
  })
  const conflict = await model.resourceMutations.setPromptResourceName(stamp, 'Mine')
  assert.equal(conflict.status, 'rejected')
  assert.equal(conflict.status === 'rejected' ? conflict.refresh : undefined, 'fresh')
  assert.equal(remote.calls.resourceMutation, 1)
  const nextStamp = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(nextStamp)
  remote.resourceMutationSteps.push(async () => fail())
  const unknown = await model.resourceMutations.setPromptResourceName(nextStamp, 'Mine again')
  assert.equal(unknown.status, 'unknown')
  assert.equal(remote.calls.resourceMutation, 2)
  detach()
  model.dispose()
})


test('P2 RED: a known invalid Resource refusal restores preloaded List and Document without retry', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  const original = model.capturePromptResourceReadStamp('alpha', 'document')
  assert.ok(original)
  const beforeList = remote.calls.listPromptResources
  const beforeDoc = remote.calls.getPromptResource
  remote.resourceMutationSteps.push(async () => ok(businessFail('invalid-prompt-resource')))
  const result = await model.resourceMutations.setPromptResourceName(original, 'Corrected')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.error.kind === 'business'
    ? result.error.code : undefined, 'invalid-prompt-resource')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'fresh')
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(remote.calls.listPromptResources, beforeList + 1)
  assert.equal(remote.calls.getPromptResource, beforeDoc + 1)
  assert.equal(model.state.getSnapshot().resources.list.status, 'ready')
  assert.equal(model.state.getSnapshot().resources.list.stale, false)
  assert.equal(model.state.getSnapshot().resources.documents.get('alpha')?.stale, false)
  assert.deepEqual(model.capturePromptResourceReadStamp('alpha', 'document'), original)
  detach()
  model.dispose()
})

test('P2 RED: business refusal followed by read failure reports degraded with real error Surface', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const original = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(original)
  remote.resourceMutationSteps.push(async () => ok(businessFail('prompt-resource-path-not-editable')))
  remote.listSteps.push(async () => fail())
  const result = await model.resourceMutations.setPromptResourceName(original, 'Denied')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.error.kind === 'business'
    ? result.error.code : undefined, 'prompt-resource-path-not-editable')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'degraded')
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(model.state.getSnapshot().resources.list.status, 'error')
  assert.equal(model.state.getSnapshot().resources.list.stale, true)
  detach()
  model.dispose()
})

test('P2 RED: refusal plus external replacement invalidates original Stamp after authoritative recovery', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const original = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(original)
  remote.resourceMutationSteps.push(async () => {
    advanceResourceFixture(remote, {
      id: 'alpha', name: 'Other actor', content: 'Other content',
      revision: 6, incarnationId: 'new-incarnation',
    })
    return ok(businessFail('invalid-prompt-resource'))
  })
  const result = await model.resourceMutations.setPromptResourceName(original, 'Mine')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'fresh')
  const latest = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.equal(latest?.revision, 6)
  assert.equal(latest?.incarnationId, 'new-incarnation')
  assert.equal((await model.resourceMutations.setPromptResourceName(original, 'Stale')).status, 'rejected')
  assert.equal(remote.calls.resourceMutation, 1)
  detach()
  model.dispose()
})

test('B2-B1 RED: equal revision, same ID and different incarnation rejects stale Resource mutation', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const original = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(original)
  remote.resourceList = [{
    status: 'usable', id: 'alpha', name: 'Recreated', revision: 5,
    incarnationId: 'recreated-incarnation',
  }]
  await model.loadPromptResourceList()
  const latest = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.equal(latest?.revision, original.revision)
  assert.notEqual(latest?.incarnationId, original.incarnationId)
  const result = await model.resourceMutations.setPromptResourceName(original, 'Must be rejected')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.error.kind === 'precondition'
    ? result.error.code : undefined, 'resource-basis-stale')
  assert.equal(remote.calls.resourceMutation, 0)
  detach()
  model.dispose()
})

test('B2-B1 RED: accepted A to null to B Source transition fences delayed mutation and leaves B unpolluted', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const original = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(original)
  const inFlight = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>>()
  remote.resourceMutationSteps.push(() => inFlight.promise)
  const pending = model.resourceMutations.setPromptResourceName(original, 'Delayed on A')
  assert.equal(remote.calls.resourceMutation, 1)
  const old = remote.defaultChanges
  remote.defaultChanges = {
    ...old, resourceAuthorityId: null, generation: old.generation + 1,
    promptResources: old.promptResources + 1, runtime: old.runtime + 1,
  }
  await model.loadSessionPreset('source-disappeared')
  assert.equal(model.state.getSnapshot().changes?.resourceAuthorityId, null)
  remote.defaultChanges = {
    ...remote.defaultChanges, resourceAuthorityId: 'resource-host-b',
    generation: old.generation + 2, promptResources: old.promptResources + 2,
    runtime: old.runtime + 2,
  }
  await model.loadSessionPreset('source-B')
  assert.equal(model.state.getSnapshot().changes?.resourceAuthorityId, 'resource-host-b')
  const bState = model.state.getSnapshot()
  inFlight.resolve(ok(businessOk({ id: 'alpha', revision: 6 })))
  assert.deepEqual(await pending, { status: 'superseded' })
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(model.state.getSnapshot().changes?.resourceAuthorityId, 'resource-host-b')
  assert.equal(model.state.getSnapshot().changes?.generation, bState.changes?.generation)
  assert.equal(model.resourceMutations.state.getSnapshot().resource.status, 'idle')
  detach()
  model.dispose()
})

test('B2-B1 RED: simultaneous actual Profile and Resource writes use independent lanes', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const profileBasis = model.captureProfileMutationBasis()
  const resourceStamp = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(profileBasis)
  assert.ok(resourceStamp)
  const profileGate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteProfilesSnapshot>>>()
  const resourceGate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemoteMutationReceipt>>>()
  remote.profileMutationSteps.push(() => profileGate.promise)
  remote.resourceMutationSteps.push(() => resourceGate.promise)
  const pendingProfile = model.mutations.setProfileName(profileBasis, 'main', 'Profile edited')
  const pendingResource = model.resourceMutations.setPromptResourceName(resourceStamp, 'Resource edited')
  assert.equal(remote.calls.profileMutation, 1)
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(model.mutations.state.getSnapshot().profile.status, 'running')
  assert.equal(model.resourceMutations.state.getSnapshot().resource.status, 'running')
  remote.defaultProfiles = profiles(8)
  remote.resourceList = [{ status: 'usable', id: 'alpha', name: 'Resource edited', revision: 6, incarnationId: null }]
  profileGate.resolve(ok(businessOk(profiles(8))))
  resourceGate.resolve(ok(businessOk({ id: 'alpha', revision: 6 })))
  assert.equal((await pendingProfile).status, 'applied')
  assert.equal((await pendingResource).status, 'applied')
  assert.equal(remote.calls.profileMutation, 1)
  assert.equal(remote.calls.resourceMutation, 1)
  detach()
  model.dispose()
})


test('B2-B1 known create-exists refusal refreshes List only and never preloads a Document', async () => {
  const { model, remote, detach } = await attachAndReady()
  const basis = model.capturePromptResourceCreateBasis()
  assert.ok(basis)
  const readCount = remote.calls.getPromptResource
  const listCount = remote.calls.listPromptResources
  remote.resourceMutationSteps.push(async () => ok(businessFail('prompt-resource-exists')))
  const result = await model.resourceMutations.createPromptResource(
    basis, 'alpha', { name: 'Duplicate', content: 'Content' },
  )
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'fresh')
  assert.equal(remote.calls.resourceMutation, 1)
  assert.equal(remote.calls.listPromptResources, listCount + 1)
  assert.equal(remote.calls.getPromptResource, readCount)
  assert.equal(model.state.getSnapshot().resources.list.stale, false)
  detach()
  model.dispose()
})

test('B2-B1 write-fence reentrant baseline verification causes local refusal, not false Source supersession', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  const original = model.capturePromptResourceReadStamp('alpha', 'list')
  assert.ok(original)
  const listCount = remote.calls.listPromptResources
  let started = false
  let checking: Promise<unknown> | undefined
  const unsub = model.state.subscribe(() => {
    const snapshot = model.state.getSnapshot()
    if (!started && snapshot.resources.list.stale && snapshot.resources.list.data !== undefined) {
      started = true
      checking = model.refresh()
    }
  })
  const result = await model.resourceMutations.setPromptResourceName(original, 'Not sent')
  await checking
  unsub()
  assert.equal(started, true)
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' && result.error.kind === 'precondition'
    ? result.error.code : undefined, 'protocol-unavailable')
  assert.equal(remote.calls.resourceMutation, 0)
  assert.ok(remote.calls.listPromptResources > listCount, 'the stale directory must be re-read')
  assert.equal(model.resourceMutations.state.getSnapshot().resource.status, 'settled')
  detach()
  model.dispose()
})

test('B2-B1 refused write recovery revokes an older List read before it can overwrite the new Resource', async () => {
  const { model, remote, detach } = await attachAndReady()
  await model.loadPromptResourceList()
  await model.loadPromptResource('alpha')
  const original = model.capturePromptResourceReadStamp('alpha', 'document')
  assert.ok(original)
  const staleList = deferred<RemoteResult<ContextManagerRemoteResult<readonly ContextManagerRemotePromptResourceListItem[]>>>()
  remote.listSteps.push(() => staleList.promise)
  const listCount = remote.calls.listPromptResources
  const pendingList = model.loadPromptResourceList()
  await waitFor(() => remote.calls.listPromptResources > listCount, 'old in-flight List read')
  remote.resourceMutationSteps.push(async () => {
    advanceResourceFixture(remote, {
      id: 'alpha', name: 'External', content: 'new body', revision: 6,
      incarnationId: 'fresh-incarnation',
    })
    return ok(businessFail('invalid-prompt-resource'))
  })
  const result = await model.resourceMutations.setPromptResourceName(original, 'Refused')
  assert.equal(result.status, 'rejected')
  assert.equal(result.status === 'rejected' ? result.refresh : undefined, 'fresh')
  assert.equal(model.state.getSnapshot().resources.list.data?.find(x => x.id === 'alpha')?.status, 'usable')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'list')?.incarnationId, 'fresh-incarnation')
  staleList.resolve(ok(businessOk([{ status: 'usable', id: 'alpha', name: 'Old', revision: 5, incarnationId: null }])))
  assert.equal((await pendingList).status, 'superseded')
  assert.equal(model.capturePromptResourceReadStamp('alpha', 'list')?.incarnationId, 'fresh-incarnation')
  assert.equal(remote.calls.resourceMutation, 1)
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

test('M8C P03 composition is an explicit keyed lazy read, never a baseline or profile-side effect', async () => {
  const { model, remote, detach } = await attachAndReady()
  assert.equal(remote.calls.readPreset, 0, 'initial authoritative hydration must not read composition')
  const report = await model.loadNativePresetDocument('source')
  assert.equal(report.status, 'completed')
  assert.equal(remote.calls.readPreset, 1)
  const body = model.state.getSnapshot().nativePresetDocuments?.get('source')
  assert.equal(body?.status, 'ready')
  assert.equal(body.data?.content, 'native body:source')
  assert.equal(model.state.getSnapshot().profiles.status, 'ready')
  detach()
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.size, 0,
    'host detach must purge sensitive native composition data')
  model.dispose()
})

test('M8C P04 concurrent same-ID native composition read must not publish old response over new', async () => {
  const remote = new ScriptedRemote()
  const gate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePresetDocument>>>()
  remote.presetBodySteps.push(
    async () => gate.promise,
    async () => ok(businessOk({ id: 'source', content: 'newest' })),
  )
  const { model, detach } = await attachAndReady(remote)
  const old = model.loadNativePresetDocument('source')
  await waitFor(() => remote.calls.readPreset === 1, 'first native composition request')
  const latest = model.loadNativePresetDocument('source')
  assert.equal((await latest).status, 'completed')
  gate.resolve(ok(businessOk({ id: 'source', content: 'obsolete' })))
  const oldResult = await old
  assert.ok(oldResult.status === 'superseded' || oldResult.status === 'detached')
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.get('source')?.data?.content, 'newest')
  detach()
  model.dispose()
})

test('M8C B2.3 model authoring uses native lane and recovers authoritative Preset roster without changing Profile Settings', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [
        { id: 'source', trust: 'system', isDefault: true },
        { id: 'my-user', trust: 'user', isDefault: false },
      ],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const profileBefore = model.state.getSnapshot().profiles.data
  const receipt = await model.presetMutations.copyPreset('source', 'copied', null)
  assert.deepEqual(receipt, { status: 'applied', refresh: 'fresh' })
  assert.equal(remote.calls.nativePresetWrite, 1)
  const afterCopy = model.state.getSnapshot()
  assert.equal(afterCopy.presets.status, 'ready')
  assert.equal(afterCopy.presets.stale, false)
  assert.equal(afterCopy.presets.data?.directory.status, 'available')
  if (afterCopy.presets.data?.directory.status === 'available') {
    assert.ok(afterCopy.presets.data.directory.presets.some(p => p.id === 'copied'))
  }
  assert.deepEqual(afterCopy.profiles.data, profileBefore,
    'native copy cannot edit profile bindings or their Settings revision')

  const removed = await model.presetMutations.removePreset('copied')
  assert.deepEqual(removed, { status: 'applied', refresh: 'fresh' })
  assert.equal(remote.calls.nativePresetWrite, 2)
  const afterRemove = model.state.getSnapshot()
  if (afterRemove.presets.data?.directory.status === 'available') {
    assert.ok(!afterRemove.presets.data.directory.presets.some(p => p.id === 'copied'))
  }
  assert.deepEqual(afterRemove.profiles.data, profileBefore)
  detach()
  model.dispose()
})

test('M8C B3-C composition view lease is explicit and release removes sensitive bytes', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [{ id: 'source', trust: 'system', isDefault: true }],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const before = remote.calls.readPreset
  const opened = model.beginNativePresetView('source')
  assert.equal(remote.calls.readPreset, before, 'a lease claim itself must not eagerly publish a body')
  assert.equal((await opened.result).status, 'completed')
  assert.equal(remote.calls.readPreset, before + 1)
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.get('source')?.data?.content, 'native body:source')
  model.releaseNativePresetView(opened.leaseId)
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.size, 0)
  const denied = model.beginNativePresetView('not-in-directory')
  assert.notEqual((await denied.result).status, 'completed')
  assert.equal(remote.calls.readPreset, before + 1, 'no native read for an absent source')
  model.releaseNativePresetView(denied.leaseId)
  detach()
  model.dispose()
})

test('M8C B3-C old view response or old cleanup never publishes over newer view lease', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [{ id: 'source', trust: 'system', isDefault: true }],
    },
    profiles: {},
  }
  const gate = deferred<RemoteResult<ContextManagerRemoteResult<ContextManagerRemotePresetDocument>>>()
  remote.presetBodySteps.push(
    async () => gate.promise,
    async () => ok(businessOk({ id: 'source', content: 'fresh lease body' })),
  )
  const { model, detach } = await attachAndReady(remote)
  const stale = model.beginNativePresetView('source')
  await waitFor(() => remote.calls.readPreset === 1, 'old leased native body request')
  model.releaseNativePresetView(stale.leaseId)
  const fresh = model.beginNativePresetView('source')
  assert.equal((await fresh.result).status, 'completed')
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.get('source')?.data?.content, 'fresh lease body')
  model.releaseNativePresetView(stale.leaseId)
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.get('source')?.data?.content, 'fresh lease body')
  gate.resolve(ok(businessOk({ id: 'source', content: 'obsolete sensitive content' })))
  assert.equal((await stale.result).status, 'superseded')
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.get('source')?.data?.content, 'fresh lease body')
  model.releaseNativePresetView(fresh.leaseId)
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.size, 0)
  detach()
  model.dispose()
})


test('M8C Strict P23: Host instance rotation revokes the native view lease before any new-Host read', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: { status: 'available', defaultId: 'source', authorable: true,
      presets: [{ id: 'source', trust: 'system', isDefault: true }] },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  // Browser still displays host-a's fresh directory, but the next lazy
  // changes() discovers host-b. No old explicit View may be silently
  // reauthorized to fetch host-b's composition.
  remote.defaultChanges = changes('host-b', 2, 1, 1)
  const lease = model.beginNativePresetView('source')
  assert.equal((await lease.result).status, 'superseded')
  assert.equal(remote.calls.readPreset, 0,
    'old view lease must never dispatch readPreset after Host instance rotation')
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.size, 0,
    'recovery of a new Host must never repopulate the old sensitive view')
  model.releaseNativePresetView(lease.leaseId)
  detach()
  model.dispose()
})


test('M8C Final Strict P1-A RED: A-to-B Host rotation releases the native write lane before old RPC settles', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'a-source', authorable: true,
      presets: [{ id: 'a-source', trust: 'system', isDefault: true }],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const oldReply = deferred<Awaited<ReturnType<ScriptedRemote['copyPreset']>>>()
  const baseCopy = remote.copyPreset.bind(remote)
  let holdFirst = true
  remote.copyPreset = (from, id, name) => {
    if (!holdFirst) return baseCopy(from, id, name)
    holdFirst = false
    remote.calls.nativePresetWrite += 1
    return oldReply.promise
  }

  const oldWrite = model.presetMutations.copyPreset('a-source', 'same-target', null)
  await waitFor(() => remote.calls.nativePresetWrite === 1,
    'Host A native Copy RPC dispatched and reply held')
  assert.equal(model.presetMutations.state.getSnapshot().preset.status, 'running')

  // Same attached Remote, new Host instance. A must no longer own B's lane.
  // B deliberately contains the old target ID to expose false attribution.
  remote.defaultChanges = changes('host-b', 1, 1, 1)
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'b-source', authorable: true,
      presets: [
        { id: 'b-source', trust: 'system', isDefault: true },
        { id: 'same-target', trust: 'user', isDefault: false },
      ],
    },
    profiles: {},
  }
  const transition = await model.refresh()
  await waitFor(() => {
    const s = model.state.getSnapshot()
    return s.instanceId === 'host-b' && s.presets.status === 'ready'
      && !s.presets.stale && s.protocol.status === 'compatible'
  }, 'Host B authoritative baseline')
  const laneAfterRotation = model.presetMutations.state.getSnapshot().preset

  const newWrite = await model.presetMutations.copyPreset('b-source', 'b-created', null)
  // Always release the old RPC, even when B rejected it: no dangling tests.
  oldReply.resolve(ok(businessOk({ id: 'same-target' })))
  const oldResult = await oldWrite
  const observedWrites = remote.calls.nativePresetWrite
  const bHasNewTarget = remote.defaultPresets.directory.status === 'available'
    && remote.defaultPresets.directory.presets.some(row => row.id === 'b-created')
  detach()
  model.dispose()

  assert.equal(transition.status, 'completed')
  assert.deepEqual(newWrite, { status: 'applied', refresh: 'fresh' },
    'new Host must be able to dispatch its own native Copy before A replies')
  assert.equal(laneAfterRotation.status, 'idle',
    'Host B must not inherit an in-flight native mutation owned by Host A')
  assert.deepEqual(oldResult, { status: 'superseded' },
    'old Host A Copy reply must not publish a result into Host B')
  assert.equal(observedWrites, 2, 'one old Host A RPC and one new Host B RPC')
  assert.equal(bHasNewTarget, true)
})

test('M8C Final Strict P1-B RED: late Host A Copy receipt cannot rehydrate against a same-ID Host B roster', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'a-source', authorable: true,
      presets: [{ id: 'a-source', trust: 'system', isDefault: true }],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const oldReply = deferred<Awaited<ReturnType<ScriptedRemote['copyPreset']>>>()
  const baseCopy = remote.copyPreset.bind(remote)
  let holdFirst = true
  remote.copyPreset = (from, id, name) => {
    if (!holdFirst) return baseCopy(from, id, name)
    holdFirst = false
    remote.calls.nativePresetWrite += 1
    return oldReply.promise
  }
  const oldWrite = model.presetMutations.copyPreset('a-source', 'colliding', null)
  await waitFor(() => remote.calls.nativePresetWrite === 1,
    'Host A dispatched old Copy before instance rotation')

  remote.defaultChanges = changes('host-b', 1, 1, 1)
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'b-source', authorable: true,
      presets: [
        { id: 'b-source', trust: 'system', isDefault: true },
        // Native B already has a distinct preset with the same ID.
        { id: 'colliding', trust: 'user', isDefault: false },
      ],
    },
    profiles: {},
  }
  await model.refresh()
  await waitFor(() => {
    const s = model.state.getSnapshot()
    return s.instanceId === 'host-b' && s.presets.status === 'ready'
      && !s.presets.stale && s.protocol.status === 'compatible'
  }, 'Host B fresh preset roster with colliding ID')
  const beforeOldReply = model.presetMutations.state.getSnapshot().preset
  const beforeRehydrate = remote.calls.presets
  oldReply.resolve(ok(businessOk({ id: 'colliding' })))
  const oldResult = await oldWrite
  const afterOldReply = model.presetMutations.state.getSnapshot().preset
  const extraRosterReads = remote.calls.presets - beforeRehydrate
  detach()
  model.dispose()

  assert.deepEqual(oldResult, { status: 'superseded' },
    'a successful Host A RPC must not count Host B same-ID membership as A write verification')
  assert.equal(beforeOldReply.status, 'idle',
    'Host B should have reset the old mutation owner before its RPC completes')
  assert.equal(afterOldReply.status, 'idle',
    'old Host A receipt cannot publish a settled operation on Host B')
  assert.equal(extraRosterReads, 0,
    'old Host A receipt must not trigger a Host B preset roster read-back')
})


test('M8C P2-2 M1 RED: refused Copy with fresh unchanged native roster is rejected/fresh', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [
        { id: 'source', trust: 'system', isDefault: true },
        { id: 'user-one', trust: 'user', isDefault: false },
      ],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const beforeRead = remote.calls.presets
  const beforeProfiles = model.state.getSnapshot().profiles.data
  // An explicit Host business refusal does not create the Copy target.
  // Its absence is the correct fresh native roster, not read-back degradation.
  remote.copyPreset = async () => {
    remote.calls.nativePresetWrite += 1
    return ok(businessFail<{ id: string }>('preset-authoring-unavailable', 'native refused copy'))
  }
  const result = await model.presetMutations.copyPreset('source', 'refused-target', null)
  const observed = model.state.getSnapshot()
  const receipt = model.presetMutations.state.getSnapshot().preset
  const nativeWrites = remote.calls.nativePresetWrite
  const rosterReads = remote.calls.presets - beforeRead
  detach()
  model.dispose()

  assert.equal(nativeWrites, 1, 'business refusal must dispatch exactly one native Copy')
  assert.ok(rosterReads >= 1, 'read-back must use actual authoritative Preset RPC')
  assert.equal(observed.presets.status, 'ready')
  assert.equal(observed.presets.stale, false)
  assert.equal(observed.presets.data?.directory.status, 'available')
  const refreshedDirectory = observed.presets.data?.directory
  if (refreshedDirectory?.status !== 'available') throw new Error('requires fresh Copy roster')
  assert.equal(refreshedDirectory.presets.some(row => row.id === 'refused-target'), false,
    'a genuinely fresh roster correctly excludes a refused Copy target')
  assert.deepEqual(observed.profiles.data, beforeProfiles, 'native refusal may not rewrite Profile Settings')
  assert.deepEqual(result, {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'preset-authoring-unavailable', message: 'native refused copy' },
  }, 'known refusal must report roster freshness independently of successful-Copy postcondition')
  assert.equal(receipt.status, 'settled')
  if (receipt.status === 'settled') assert.deepEqual(receipt.result, result)
})

test('M8C P2-2 M2 RED: refused Remove with fresh unchanged native roster is rejected/fresh', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [
        { id: 'source', trust: 'system', isDefault: true },
        { id: 'user-one', trust: 'user', isDefault: false },
      ],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const beforeRead = remote.calls.presets
  const beforeProfiles = model.state.getSnapshot().profiles.data
  remote.removePreset = async () => {
    remote.calls.nativePresetWrite += 1
    return ok(businessFail<{ id: string }>('preset-authoring-unavailable', 'native refused remove'))
  }
  const result = await model.presetMutations.removePreset('user-one')
  const observed = model.state.getSnapshot()
  const receipt = model.presetMutations.state.getSnapshot().preset
  const nativeWrites = remote.calls.nativePresetWrite
  const rosterReads = remote.calls.presets - beforeRead
  detach()
  model.dispose()

  assert.equal(nativeWrites, 1, 'business refusal must dispatch exactly one native Remove')
  assert.ok(rosterReads >= 1, 'read-back must use actual authoritative Preset RPC')
  assert.equal(observed.presets.status, 'ready')
  assert.equal(observed.presets.stale, false)
  assert.equal(observed.presets.data?.directory.status, 'available')
  const refreshedDirectory = observed.presets.data?.directory
  if (refreshedDirectory?.status !== 'available') throw new Error('requires fresh Remove roster')
  assert.equal(refreshedDirectory.presets.some(row => row.id === 'user-one'), true,
    'a genuinely fresh roster correctly retains a refused Remove target')
  assert.deepEqual(observed.profiles.data, beforeProfiles, 'native refusal may not rewrite Profile Settings')
  assert.deepEqual(result, {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'preset-authoring-unavailable', message: 'native refused remove' },
  }, 'known refusal must report roster freshness independently of successful-Remove postcondition')
  assert.equal(receipt.status, 'settled')
  if (receipt.status === 'settled') assert.deepEqual(receipt.result, result)
})

test('M8C P2-2 M3 control: external Copy target appearance cannot turn known refusal into applied', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [{ id: 'source', trust: 'system', isDefault: true }],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  remote.copyPreset = async () => {
    remote.calls.nativePresetWrite += 1
    // An unrelated native writer created a same-ID entry; our RPC is still refused.
    const directory = remote.defaultPresets.directory
    if (directory.status !== 'available') throw new Error('test requires available directory')
    remote.defaultPresets = {
      ...remote.defaultPresets,
      directory: {
        ...directory,
        presets: [...directory.presets, {
          id: 'external-target', trust: 'user', isDefault: false,
        }],
      },
    }
    remote.defaultChanges = {
      ...remote.defaultChanges, generation: remote.defaultChanges.generation + 1,
      presets: remote.defaultChanges.presets + 1,
    }
    return ok(businessFail<{ id: string }>('preset-authoring-unavailable', 'refused by this writer'))
  }
  const beforeRead = remote.calls.presets
  const result = await model.presetMutations.copyPreset('source', 'external-target', null)
  const state = model.state.getSnapshot()
  const writes = remote.calls.nativePresetWrite
  const reads = remote.calls.presets - beforeRead
  detach()
  model.dispose()
  assert.equal(writes, 1)
  assert.ok(reads >= 1)
  assert.equal(state.presets.status, 'ready')
  assert.equal(state.presets.stale, false)
  const refreshedDirectory = state.presets.data?.directory
  if (refreshedDirectory?.status !== 'available') throw new Error('requires external Copy roster')
  assert.equal(refreshedDirectory.presets.some(row => row.id === 'external-target'), true)
  assert.deepEqual(result, {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'preset-authoring-unavailable', message: 'refused by this writer' },
  }, 'matching roster membership created elsewhere is not proof this refused Copy succeeded')
})

test('M8C P2-2 M4 control: external Remove target disappearance cannot turn known refusal into applied', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [
        { id: 'source', trust: 'system', isDefault: true },
        { id: 'user-one', trust: 'user', isDefault: false },
      ],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  remote.removePreset = async () => {
    remote.calls.nativePresetWrite += 1
    // Another native actor removed the ID, but this operation was refused.
    const directory = remote.defaultPresets.directory
    if (directory.status !== 'available') throw new Error('test requires available directory')
    remote.defaultPresets = {
      ...remote.defaultPresets,
      directory: { ...directory, presets: directory.presets.filter(row => row.id !== 'user-one') },
    }
    remote.defaultChanges = {
      ...remote.defaultChanges, generation: remote.defaultChanges.generation + 1,
      presets: remote.defaultChanges.presets + 1,
    }
    return ok(businessFail<{ id: string }>('preset-authoring-unavailable', 'refused by this writer'))
  }
  const beforeRead = remote.calls.presets
  const result = await model.presetMutations.removePreset('user-one')
  const state = model.state.getSnapshot()
  const writes = remote.calls.nativePresetWrite
  const reads = remote.calls.presets - beforeRead
  detach()
  model.dispose()
  assert.equal(writes, 1)
  assert.ok(reads >= 1)
  assert.equal(state.presets.status, 'ready')
  assert.equal(state.presets.stale, false)
  const refreshedDirectory = state.presets.data?.directory
  if (refreshedDirectory?.status !== 'available') throw new Error('requires external Remove roster')
  assert.equal(refreshedDirectory.presets.some(row => row.id === 'user-one'), false)
  assert.deepEqual(result, {
    status: 'rejected', refresh: 'fresh',
    error: { kind: 'business', code: 'preset-authoring-unavailable', message: 'refused by this writer' },
  }, 'matching roster absence caused elsewhere is not proof this refused Remove succeeded')
})


test('M8C Fix A completed native View claim reflects Model authority, never revives on old release', async () => {
  const remote = new ScriptedRemote()
  remote.defaultPresets = {
    directory: {
      status: 'available', defaultId: 'source', authorable: true,
      presets: [{ id: 'source', trust: 'system', isDefault: true }],
    },
    profiles: {},
  }
  const { model, detach } = await attachAndReady(remote)
  const a = model.beginNativePresetView('source')
  assert.equal(a.isCurrent(), true, 'a successfully claimed View owns the current Model lease')
  assert.equal((await a.result).status, 'completed')
  assert.equal(a.isCurrent(), true, 'completed View remains current until explicit revocation')
  const b = model.beginNativePresetView('source')
  assert.equal(a.isCurrent(), false, 'new explicit View permanently revokes earlier lease')
  assert.equal(b.isCurrent(), true)
  assert.notEqual(b.leaseId, a.leaseId)
  assert.equal((await b.result).status, 'completed')
  model.releaseNativePresetView(a.leaseId)
  assert.equal(b.isCurrent(), true, 'late release of old claim cannot cancel current View')
  model.releaseNativePresetView(b.leaseId)
  assert.equal(b.isCurrent(), false)
  assert.equal(model.state.getSnapshot().nativePresetDocuments?.size, 0,
    'release evicts sensitive native bytes')
  const c = model.beginNativePresetView('source')
  assert.equal((await c.result).status, 'completed')
  detach()
  assert.equal(c.isCurrent(), false, 'Host detach revokes existing completed claims')
  model.dispose()
  assert.equal(a.isCurrent(), false)
  assert.equal(b.isCurrent(), false)
  assert.equal(c.isCurrent(), false)
})
