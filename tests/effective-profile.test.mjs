import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveEffectiveProfile } from '../src/runtime/effective-profile.ts'

const profile = Object.freeze({
  name: 'Profile A',
  basePreset: 'preset-a',
  skills: Object.freeze({}),
  prompts: Object.freeze({}),
})

function snapshot(overrides = {}) {
  return Object.freeze({
    schemaVersion: 1,
    schemaCompatible: true,
    configuredDefaultProfileId: 'profile-a',
    usableDefaultProfileId: 'profile-a',
    profiles: Object.freeze({ 'profile-a': profile }),
    diagnostics: Object.freeze([]),
    persistence: Object.freeze({
      available: true,
      registered: true,
      writable: true,
      revision: 1,
    }),
    ...overrides,
  })
}

test('effective profile resolver reports no default without consulting a fallback', () => {
  const result = resolveEffectiveProfile(snapshot({
    configuredDefaultProfileId: undefined,
    usableDefaultProfileId: undefined,
  }), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.deepEqual(result, { status: 'no-default-profile' })
})

test('schema incompatibility wins before profile or preset selection', () => {
  const result = resolveEffectiveProfile(snapshot({
    schemaCompatible: false,
    usableDefaultProfileId: undefined,
    profiles: Object.freeze({}),
    diagnostics: Object.freeze([{
      code: 'unsupported-schema-version',
      message: 'future schema',
    }]),
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
  const missing = resolveEffectiveProfile(snapshot({
    usableDefaultProfileId: undefined,
    profiles: Object.freeze({}),
    diagnostics: Object.freeze([{
      code: 'missing-default-profile',
      profileId: 'profile-a',
      message: 'missing',
    }]),
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

  const invalid = resolveEffectiveProfile(snapshot({
    usableDefaultProfileId: undefined,
    profiles: Object.freeze({}),
    diagnostics: Object.freeze([{
      code: 'invalid-default-profile',
      profileId: 'profile-a',
      message: 'invalid',
    }]),
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
  const unavailable = resolveEffectiveProfile(snapshot(), {
    status: 'unavailable',
    sessionId: 'session-a',
  })
  assert.deepEqual(unavailable, {
    status: 'preset-identity-unavailable',
    profileId: 'profile-a',
    reason: 'session-store-unavailable',
  })

  const notLive = resolveEffectiveProfile(snapshot(), {
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
  const active = resolveEffectiveProfile(snapshot(), {
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

  const mismatch = resolveEffectiveProfile(snapshot(), {
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
  const result = resolveEffectiveProfile(snapshot(), {
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
  const result = resolveEffectiveProfile(snapshot(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.equal(result.status, 'active')
})

test('runtime resolution records are immutable', () => {
  const result = resolveEffectiveProfile(snapshot(), {
    status: 'known',
    sessionId: 'session-a',
    presetId: 'preset-a',
  })

  assert.equal(Object.isFrozen(result), true)
  assert.throws(() => {
    result.status = 'base-preset-mismatch'
  }, TypeError)
})
