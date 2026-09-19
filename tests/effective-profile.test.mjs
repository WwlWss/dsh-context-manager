import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveEffectiveProfile } from '../src/runtime/effective-profile.ts'

const profile = Object.freeze({
  name: 'Profile A',
  basePreset: 'preset-a',
  skills: Object.freeze({}),
  prompts: Object.freeze({}),
})

function candidate(overrides = {}) {
  return Object.freeze({
    status: 'candidate',
    profileId: 'profile-a',
    profile,
    ...overrides,
  })
}

test('effective profile resolver reports no default without consulting a fallback', () => {
  const result = resolveEffectiveProfile(Object.freeze({ status: 'no-default-profile' }), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.deepEqual(result, { status: 'no-default-profile' })
})

test('schema incompatibility wins before profile or preset selection', () => {
  const result = resolveEffectiveProfile(Object.freeze({
    status: 'schema-incompatible',
    configuredProfileId: 'profile-a',
  }), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.deepEqual(result, {
    status: 'profile-unusable',
    configuredProfileId: 'profile-a',
    reason: 'schema-incompatible',
  })
})

test('dangling and invalid configured defaults remain distinct runtime diagnostics', () => {
  const missing = resolveEffectiveProfile(Object.freeze({
    status: 'missing-default-profile',
    profileId: 'profile-a',
  }), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })
  assert.deepEqual(missing, {
    status: 'profile-unusable',
    configuredProfileId: 'profile-a',
    reason: 'missing-default-profile',
  })

  const invalid = resolveEffectiveProfile(Object.freeze({
    status: 'invalid-default-profile',
    profileId: 'profile-a',
  }), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })
  assert.deepEqual(invalid, {
    status: 'profile-unusable',
    configuredProfileId: 'profile-a',
    reason: 'invalid-default-profile',
  })
})

test('Session capability absence and not-live identity remain distinct', () => {
  const unavailable = resolveEffectiveProfile(candidate(), {
    status: 'unavailable',
    sessionId: 'session-a',
  })
  assert.deepEqual(unavailable, {
    status: 'preset-identity-unavailable',
    profileId: 'profile-a',
    reason: 'session-store-unavailable',
  })

  const notLive = resolveEffectiveProfile(candidate(), {
    status: 'not-live',
    sessionId: 'session-a',
  })
  assert.deepEqual(notLive, {
    status: 'preset-identity-unavailable',
    profileId: 'profile-a',
    reason: 'session-not-live',
  })
})

test('exact live preset identity is the only eligibility fence', () => {
  const active = resolveEffectiveProfile(candidate(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })
  assert.deepEqual(active, {
    status: 'active',
    profileId: 'profile-a',
    profile,
    presetId: 'preset-a',
  })

  const mismatch = resolveEffectiveProfile(candidate(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'Preset-A',
  })
  assert.deepEqual(mismatch, {
    status: 'base-preset-mismatch',
    profileId: 'profile-a',
    expectedPresetId: 'preset-a',
    actualPresetId: 'Preset-A',
  })
})

test('null live preset identity never substitutes a native/default preset', () => {
  const result = resolveEffectiveProfile(candidate(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: null,
  })

  assert.deepEqual(result, {
    status: 'base-preset-mismatch',
    profileId: 'profile-a',
    expectedPresetId: 'preset-a',
    actualPresetId: null,
  })
})

test('resolver does not need or observe native preset roster health', () => {
  const result = resolveEffectiveProfile(candidate(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.equal(result.status, 'active')
})

test('runtime resolution records are immutable', () => {
  const result = resolveEffectiveProfile(candidate(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.equal(Object.isFrozen(result), true)
  assert.throws(() => {
    result.status = 'base-preset-mismatch'
  }, TypeError)
})
