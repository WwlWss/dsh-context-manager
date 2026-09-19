import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeDefaultProfileCandidate } from '../src/domain/normalize.ts'

const validProfile = {
  name: 'Default',
  basePreset: 'standard',
  skills: {
    docker: { mode: 'manual' },
  },
  prompts: {
    p: {
      resourceId: 'resource',
      enabled: true,
      placement: 'after-persona',
      order: 0,
    },
  },
}

test('targeted default profile candidate preserves all selection states', () => {
  assert.deepEqual(
    normalizeDefaultProfileCandidate({
      schemaVersion: 999,
      defaultProfileId: 'future',
      profiles: { future: validProfile },
    }),
    {
      status: 'schema-incompatible',
      configuredProfileId: 'future',
    },
  )

  assert.deepEqual(
    normalizeDefaultProfileCandidate({
      schemaVersion: 1,
      profiles: {},
    }),
    { status: 'no-default-profile' },
  )

  assert.deepEqual(
    normalizeDefaultProfileCandidate({
      schemaVersion: 1,
      defaultProfileId: 'missing',
      profiles: {},
    }),
    {
      status: 'missing-default-profile',
      profileId: 'missing',
    },
  )

  assert.deepEqual(
    normalizeDefaultProfileCandidate({
      schemaVersion: 1,
      defaultProfileId: 'broken',
      profiles: {
        broken: { name: 42, basePreset: 'standard' },
      },
    }),
    {
      status: 'invalid-default-profile',
      profileId: 'broken',
    },
  )

  const candidate = normalizeDefaultProfileCandidate({
    schemaVersion: 1,
    defaultProfileId: 'default',
    profiles: { default: validProfile },
  })
  assert.equal(candidate.status, 'candidate')
  assert.equal(candidate.profileId, 'default')
  assert.equal(candidate.profile.name, 'Default')
  assert.equal(candidate.profile.skills.docker.mode, 'manual')
  assert.equal(candidate.profile.prompts.p.resourceId, 'resource')
})

test('targeted read never enumerates the reusable profile library', () => {
  const profiles = new Proxy({
    default: validProfile,
    unrelated: {
      name: 42,
      basePreset: [],
      skills: 'malformed sibling',
    },
  }, {
    ownKeys() {
      throw new Error('profile library enumeration is forbidden on the runtime path')
    },
  })

  const candidate = normalizeDefaultProfileCandidate({
    schemaVersion: 1,
    defaultProfileId: 'default',
    profiles,
  })

  assert.equal(candidate.status, 'candidate')
  assert.equal(candidate.profileId, 'default')
  assert.equal(candidate.profile.name, 'Default')
})

test('unrelated malformed sibling profiles do not affect the targeted candidate', () => {
  const candidate = normalizeDefaultProfileCandidate({
    schemaVersion: 1,
    defaultProfileId: 'default',
    profiles: {
      default: validProfile,
      broken: {
        name: 42,
        basePreset: [],
        skills: { x: { mode: 'banana' } },
      },
    },
  })

  assert.equal(candidate.status, 'candidate')
  assert.equal(candidate.profileId, 'default')
})

test('targeted candidate and parsed profile structures are immutable', () => {
  const candidate = normalizeDefaultProfileCandidate({
    schemaVersion: 1,
    defaultProfileId: 'default',
    profiles: { default: validProfile },
  })

  assert.equal(candidate.status, 'candidate')
  assert.equal(Object.isFrozen(candidate), true)
  assert.equal(Object.isFrozen(candidate.profile), true)
  assert.equal(Object.isFrozen(candidate.profile.skills), true)
  assert.equal(Object.isFrozen(candidate.profile.skills.docker), true)
  assert.equal(Object.isFrozen(candidate.profile.prompts), true)
  assert.equal(Object.isFrozen(candidate.profile.prompts.p), true)

  assert.throws(() => {
    candidate.profile.skills.docker.mode = 'off'
  }, TypeError)
})
