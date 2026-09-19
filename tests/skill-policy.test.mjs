import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareSkillNames,
  managedSkillInvocationPolicy,
  profileSkillMode,
  sortedProfileSkillBindings,
} from '../src/runtime/skill-policy.ts'

const profile = Object.freeze({
  name: 'Profile',
  basePreset: 'standard',
  skills: Object.freeze({
    zebra: Object.freeze({ mode: 'off' }),
    alpha: Object.freeze({ mode: 'auto' }),
    manual: Object.freeze({ mode: 'manual' }),
    pinned: Object.freeze({ mode: 'pinned' }),
  }),
  prompts: Object.freeze({}),
})

test('Skill policy modes preserve Auto and map managed modes exactly', () => {
  assert.equal(managedSkillInvocationPolicy('auto'), undefined)
  assert.equal(managedSkillInvocationPolicy(undefined), undefined)
  assert.deepEqual(managedSkillInvocationPolicy('manual'), {
    modelInvocable: false,
    userInvocable: true,
  })
  assert.deepEqual(managedSkillInvocationPolicy('off'), {
    modelInvocable: false,
    userInvocable: false,
  })
  assert.deepEqual(managedSkillInvocationPolicy('pinned'), {
    modelInvocable: false,
    userInvocable: false,
  })
})

test('Skill policy reads missing bindings without fabricating a mode', () => {
  assert.equal(profileSkillMode(profile, 'alpha'), 'auto')
  assert.equal(profileSkillMode(profile, 'missing'), undefined)
})

test('Skill bindings use deterministic code-unit name order without mutating Domain state', () => {
  const before = Object.keys(profile.skills)
  assert.deepEqual(
    sortedProfileSkillBindings(profile),
    [
      ['alpha', 'auto'],
      ['manual', 'manual'],
      ['pinned', 'pinned'],
      ['zebra', 'off'],
    ],
  )
  assert.deepEqual(Object.keys(profile.skills), before)
  assert.equal(compareSkillNames('a', 'b'), -1)
  assert.equal(compareSkillNames('b', 'a'), 1)
  assert.equal(compareSkillNames('a', 'a'), 0)
})
