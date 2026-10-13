import assert from 'node:assert/strict'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { isolatedEnv } from './m7d/support/run-web.mjs'

test('disposable Host omits credentials, preserves required execution paths, and isolates configuration homes', () => {
  const parent = {
    PATH: '/usr/bin', SystemRoot: 'C:\\Windows', ComSpec: 'cmd.exe',
    PATHEXT: '.EXE;.CMD', COREPACK_HOME: '/trusted/corepack',
    OPENAI_API_KEY: 'synthetic-model-secret',
    ANTHROPIC_API_KEY: 'synthetic-second-secret',
    GITHUB_TOKEN: 'synthetic-gh-secret',
    NPM_TOKEN: 'synthetic-npm-secret',
    NODE_OPTIONS: '--require /untrusted/preload',
    DSH_HOME: '/personal/profiles',
    HTTP_PROXY: 'https://user:secret@proxy.example',
  }
  const env = isolatedEnv('/temporary/m7d-profile', parent)
  for (const key of ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN',
    'NPM_TOKEN', 'NODE_OPTIONS', 'HTTP_PROXY']) {
    assert.equal(key in env, false, key + ' leaked to disposable Host')
  }
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.SystemRoot, 'C:\\Windows')
  assert.equal(env.COREPACK_HOME, '/trusted/corepack')
  assert.equal(env.DSH_HOME, '/temporary/m7d-profile')
  for (const key of ['HOME', 'USERPROFILE']) assert.equal(env[key], '/temporary/m7d-profile')
  assert.equal(env.CI, 'true')
})
test('Windows-style Path key is preserved, not shadowed by a second PATH', () => {
  const env = isolatedEnv('C:\\tmp\\dsh-m7d', {
    Path: 'C:\\Node;C:\\Windows',
    SystemRoot: 'C:\\Windows',
    OPENAI_API_KEY: 'hidden',
  })
  assert.equal(env.Path, 'C:\\Node;C:\\Windows')
  assert.equal(Object.keys(env).filter(x => x.toLowerCase() === 'path').length, 1)
  assert.equal('OPENAI_API_KEY' in env, false)
})
test('a real Node subprocess receives only the isolated environment', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'm7d-env-subprocess-'))
  try {
    const env = isolatedEnv(home, {
      ...process.env, OPENAI_API_KEY: 'synthetic-never-enter-child',
      NODE_OPTIONS: '--require /malicious/should-not-execute.js',
    })
    const child = spawnSync(process.execPath,
      ['-e', 'process.stdout.write(JSON.stringify({hasKey: Object.hasOwn(process.env, "OPENAI_API_KEY"),home:process.env.DSH_HOME,nodeOpts:process.env.NODE_OPTIONS ?? null}))'],
      { env, encoding: 'utf8', timeout: 10000 })
    assert.equal(child.status, 0, child.stderr)
    assert.deepEqual(JSON.parse(child.stdout), { hasKey: false, home, nodeOpts: null })
  } finally { rmSync(home, { recursive: true, force: true }) }
})
