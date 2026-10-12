import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isolatedEnv } from './m7d/support/run-web.mjs'

test('disposable Web environment excludes user and provider credentials', () => {
  const parent = {
    PATH: '/usr/bin', SystemRoot: 'C:\\Windows', ComSpec: 'cmd.exe',
    OPENAI_API_KEY: 'synthetic', ANTHROPIC_API_KEY: 'synthetic',
    GITHUB_TOKEN: 'synthetic', NPM_TOKEN: 'synthetic',
    NODE_OPTIONS: '--require preload', DSH_HOME: '/personal',
    HTTP_PROXY: 'https://user:secret@proxy.test',
  }
  const env = isolatedEnv('/test/m7d', parent)
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN',
    'NPM_TOKEN', 'NODE_OPTIONS', 'HTTP_PROXY']) assert.equal(key in env, false)
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.DSH_HOME, '/test/m7d')
  assert.equal(env.HOME, '/test/m7d')
  assert.equal(env.USERPROFILE, '/test/m7d')
  assert.equal(env.CI, 'true')
})
