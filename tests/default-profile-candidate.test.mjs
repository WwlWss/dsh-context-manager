import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Context } from '@deepseek-ai/cordis'

import { ContextManagerService } from '../lib/index.js'

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

async function withManager(run) {
  const ctx = new Context()
  const fiber = ctx.plugin(ContextManagerService)
  await fiber
  try {
    const manager = ctx.get('dshContextManager')
    assert.ok(manager)

    const read = stored => {
      // Deliberate white-box seam: routing the Proxy sentinel through Settings
      // would let schema resolution enumerate it before the runtime read. Keep
      // the normalizer internal instead of publishing production API only for
      // this performance regression.
      manager.source = () => stored
      return manager.defaultProfileCandidate()
    }

    await run(read)
  } finally {
    await fiber.dispose()
  }
}

test('targeted default profile candidate preserves all selection states', async () => {
  await withManager((read) => {
    assert.deepEqual(
      read({
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
      read({
        schemaVersion: 1,
        profiles: {},
      }),
      { status: 'no-default-profile' },
    )

    assert.deepEqual(
      read({
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
      read({
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

    const candidate = read({
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
})

test('targeted read never enumerates the reusable profile library', async () => {
  await withManager((read) => {
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

    const candidate = read({
      schemaVersion: 1,
      defaultProfileId: 'default',
      profiles,
    })

    assert.equal(candidate.status, 'candidate')
    assert.equal(candidate.profileId, 'default')
    assert.equal(candidate.profile.name, 'Default')
  })
})

test('unrelated malformed sibling profiles do not affect the targeted candidate', async () => {
  await withManager((read) => {
    const candidate = read({
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
})

test('targeted candidate and parsed profile structures are immutable', async () => {
  await withManager((read) => {
    const candidate = read({
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
})
