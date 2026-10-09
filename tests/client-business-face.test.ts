import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'

import {
  createContextManagerClientBusinessFace,
  type ContextManagerClientBusinessSource,
} from '../src/client/business-face.js'
import type { ContextManagerClientMutationController } from '../src/client/mutation-controller.js'
import type {
  ContextManagerClientReconcileResult,
  ContextManagerClientSnapshot,
} from '../src/client/model-types.js'
import type {
  ContextManagerClientMutationSnapshot,
  ContextManagerClientProfileMutationBasis,
  ContextManagerClientProfileMutationResult,
  ContextManagerClientProfileMutations,
} from '../src/client/mutation-types.js'

const APPLIED = Object.freeze({
  status: 'applied',
  refresh: 'fresh',
} as const satisfies ContextManagerClientProfileMutationResult)

interface MutationCall {
  readonly method: keyof ContextManagerClientProfileMutations
  readonly args: readonly unknown[]
}

function createFixture() {
  const state = createSnapshotStore<ContextManagerClientSnapshot>({
    attachment: 'detached',
    protocol: { status: 'unchecked' },
    sync: { status: 'idle' },
    profiles: { status: 'idle', stale: false },
    presets: { status: 'idle', stale: false },
    promptPlacement: { status: 'idle', stale: false },
  })
  const mutationState = createSnapshotStore<ContextManagerClientMutationSnapshot>({
    profile: { status: 'idle' },
  })
  const calls: MutationCall[] = []

  const record = (
    method: keyof ContextManagerClientProfileMutations,
    args: readonly unknown[],
  ): ContextManagerClientProfileMutationResult => {
    calls.push({ method, args })
    return APPLIED
  }

  const mutations: ContextManagerClientMutationController = {
    state: mutationState,
    async createProfile(...args) { return record('createProfile', args) },
    async deleteProfile(...args) { return record('deleteProfile', args) },
    async setDefaultProfile(...args) { return record('setDefaultProfile', args) },
    async setProfileName(...args) { return record('setProfileName', args) },
    async setProfileDescription(...args) { return record('setProfileDescription', args) },
    async setProfileBasePreset(...args) { return record('setProfileBasePreset', args) },
    async setSkillMode(...args) { return record('setSkillMode', args) },
    async removeSkillBinding(...args) { return record('removeSkillBinding', args) },
    async addPromptBinding(...args) { return record('addPromptBinding', args) },
    async setPromptBindingResourceId(...args) {
      return record('setPromptBindingResourceId', args)
    },
    async setPromptBindingEnabled(...args) {
      return record('setPromptBindingEnabled', args)
    },
    async setPromptBindingPlacement(...args) {
      return record('setPromptBindingPlacement', args)
    },
    async setPromptBindingOrder(...args) { return record('setPromptBindingOrder', args) },
    async removePromptBinding(...args) { return record('removePromptBinding', args) },
  }

  let refreshCalls = 0
  const refreshResult = Object.freeze({
    status: 'completed',
    attempted: [],
  } as const satisfies ContextManagerClientReconcileResult)
  let captureCalls = 0
  let basis: ContextManagerClientProfileMutationBasis | undefined = Object.freeze({
    instanceId: 'host-a',
    revision: 7,
  })

  const source: ContextManagerClientBusinessSource = {
    state,
    mutations,
    async refresh() {
      refreshCalls += 1
      return refreshResult
    },
    captureProfileMutationBasis() {
      captureCalls += 1
      return basis
    },
  }

  return {
    source,
    state,
    mutationState,
    calls,
    refreshResult,
    getRefreshCalls: () => refreshCalls,
    getCaptureCalls: () => captureCalls,
    setBasis(next: ContextManagerClientProfileMutationBasis | undefined) {
      basis = next
    },
  }
}

test('business face exposes only the frozen renderer-facing capability projection', () => {
  const fixture = createFixture()
  const face = createContextManagerClientBusinessFace(fixture.source)

  assert.deepEqual(Object.keys(face).sort(), [
    'captureProfileMutationBasis',
    'hooks',
    'profileMutations',
    'refresh',
  ])
  assert.deepEqual(Object.keys(face.profileMutations).sort(), [
    'addPromptBinding',
    'createProfile',
    'deleteProfile',
    'removePromptBinding',
    'removeSkillBinding',
    'setDefaultProfile',
    'setProfileBasePreset',
    'setProfileDescription',
    'setProfileName',
    'setPromptBindingEnabled',
    'setPromptBindingOrder',
    'setPromptBindingPlacement',
    'setPromptBindingResourceId',
    'setSkillMode',
  ])
  assert.equal(Object.isFrozen(face), true)
  assert.equal(Object.isFrozen(face.hooks), true)
  assert.equal(Object.isFrozen(face.profileMutations), true)
  assert.equal(face.hooks.contextManager, fixture.state)
  assert.equal(face.hooks.profileMutation, fixture.mutationState)
  assert.notEqual(face.profileMutations, fixture.source.mutations)
  assert.equal('state' in face.profileMutations, false)
  for (const lifecycleMember of [
    'attach',
    'reconcile',
    'getProfileRevision',
    'dispose',
  ]) {
    assert.equal(lifecycleMember in face, false)
  }
})

test('business callbacks stay live and mutation wrappers never recapture or rebase the caller basis', async () => {
  const fixture = createFixture()
  const face = createContextManagerClientBusinessFace(fixture.source)

  assert.equal(await face.refresh(), fixture.refreshResult)
  assert.equal(fixture.getRefreshCalls(), 1)

  assert.deepEqual(face.captureProfileMutationBasis(), {
    instanceId: 'host-a',
    revision: 7,
  })
  fixture.setBasis(Object.freeze({
    instanceId: 'host-a',
    revision: 99,
  }))
  assert.deepEqual(face.captureProfileMutationBasis(), {
    instanceId: 'host-a',
    revision: 99,
  })
  assert.equal(fixture.getCaptureCalls(), 2)

  const capturedBasis = Object.freeze({
    instanceId: 'host-a',
    revision: 7,
  })
  const capturesBeforeWrites = fixture.getCaptureCalls()

  const results = [
    await face.profileMutations.createProfile(
      capturedBasis,
      'created',
      { name: 'Created', basePreset: 'standard' },
    ),
    await face.profileMutations.deleteProfile(capturedBasis, 'deleted'),
    await face.profileMutations.setDefaultProfile(capturedBasis, null),
    await face.profileMutations.setProfileName(capturedBasis, 'main', 'Main'),
    await face.profileMutations.setProfileDescription(capturedBasis, 'main', null),
    await face.profileMutations.setProfileBasePreset(capturedBasis, 'main', 'minimal'),
    await face.profileMutations.setSkillMode(capturedBasis, 'main', 'skill-a', 'manual'),
    await face.profileMutations.removeSkillBinding(capturedBasis, 'main', 'skill-b'),
    await face.profileMutations.addPromptBinding(capturedBasis, 'main', 'binding-a', {
      resourceId: 'resource-a',
      enabled: true,
      placement: 'after-persona',
      order: 1,
    }),
    await face.profileMutations.setPromptBindingResourceId(
      capturedBasis,
      'main',
      'binding-a',
      'resource-b',
    ),
    await face.profileMutations.setPromptBindingEnabled(
      capturedBasis,
      'main',
      'binding-a',
      false,
    ),
    await face.profileMutations.setPromptBindingPlacement(
      capturedBasis,
      'main',
      'binding-a',
      'runtime-context',
    ),
    await face.profileMutations.setPromptBindingOrder(
      capturedBasis,
      'main',
      'binding-a',
      4,
    ),
    await face.profileMutations.removePromptBinding(
      capturedBasis,
      'main',
      'binding-a',
    ),
  ]

  assert.equal(fixture.getCaptureCalls(), capturesBeforeWrites)
  assert.equal(fixture.calls.length, 14)
  for (const call of fixture.calls) {
    assert.deepEqual(call.args[0], {
      instanceId: 'host-a',
      revision: 7,
    })
  }
  assert.deepEqual(fixture.calls.map(call => call.method), [
    'createProfile',
    'deleteProfile',
    'setDefaultProfile',
    'setProfileName',
    'setProfileDescription',
    'setProfileBasePreset',
    'setSkillMode',
    'removeSkillBinding',
    'addPromptBinding',
    'setPromptBindingResourceId',
    'setPromptBindingEnabled',
    'setPromptBindingPlacement',
    'setPromptBindingOrder',
    'removePromptBinding',
  ])
  assert.equal(results.every(result => result === APPLIED), true)
})
