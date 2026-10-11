import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RETAINED_CLIENT_VERSIONS, PLAYWRIGHT_VERSION, qualifyVersion,
  initializeWebProfileArgs, installArgs, webArgs, parseWebUrl, redactDiagnostic, assertArtifactDigest,
} from './m7d/support/contracts.mjs'

test('M7D admits only four retained web client versions', () => {
  assert.deepEqual(RETAINED_CLIENT_VERSIONS,
    ['0.1.2-rc.1', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.2'])
  assert.equal(PLAYWRIGHT_VERSION, '1.56.1')
  for (const version of RETAINED_CLIENT_VERSIONS) assert.equal(qualifyVersion(version), version)
  for (const version of ['0.1.1-rc.2', '0.1.7-rc.2', '0.2.0-rc.2', 'latest']) {
    assert.throws(() => qualifyVersion(version), /unsupported DSH version/)
  }
})

test('M7D installs an actual tarball in an isolated DSH profile', () => {
  assert.deepEqual(initializeWebProfileArgs('0.1.5-rc.2', 'web'), [
    'dlx', '@deepseek-ai/dsh@0.1.5-rc.2', 'web', '--dump-config',
  ])
  assert.deepEqual(installArgs('0.1.5-rc.2', 'web', '/tmp/a.tgz'), [
    'dlx', '@deepseek-ai/dsh@0.1.5-rc.2',
    'plugin', '--profile', 'web', 'add', '/tmp/a.tgz',
  ])
  assert.deepEqual(webArgs('0.1.5-rc.2', 'web'), [
    'dlx', '@deepseek-ai/dsh@0.1.5-rc.2',
    'web', '--no-open', '--host', '127.0.0.1', '--port', '0',
  ])
  assert.throws(() => installArgs('0.1.5-rc.2', '../real-profile', '/tmp/a.tgz'))
  assert.throws(() => initializeWebProfileArgs('0.1.5-rc.2', 'm7d-custom'))
  assert.throws(() => webArgs('0.1.5-rc.2', 'm7d-custom'))
  assert.throws(() => installArgs('0.1.5-rc.2', 'm7d-probe', '/tmp/a.js'))
})

test('M7D parses only loopback Web readiness URLs', () => {
  assert.equal(parseWebUrl('other http://127.0.0.1:3080/'), undefined)
  assert.equal(parseWebUrl('dsh web: http://127.0.0.1:3044/?token=abc (LAN: http://other)'),
    'http://127.0.0.1:3044/?token=abc')
  assert.equal(parseWebUrl('\x1b[32mdsh web: http://localhost:9999/\x1b[0m'), 'http://localhost:9999/')
  assert.equal(parseWebUrl('dsh web: https://0.0.0.0:9999/?token=x'), undefined)
  assert.equal(parseWebUrl('dsh web: http://evil.example:9999/?token=x'), undefined)
  assert.equal(parseWebUrl('dsh web: http://127.0.0.1:0/'), undefined)
})

test('M7D redacts URL and bearer secrets in CI diagnostics', () => {
  const redacted = redactDiagnostic(
    'dsh web: http://127.0.0.1:3080/?token=private-123&x=1\nAuthorization: Bearer abcdefghijklm12345\nDSH_TEST_SECRET=shhh')
  assert.equal(redacted.includes('private-123'), false)
  assert.equal(redacted.includes('abcdefghijklm12345'), false)
  assert.equal(redacted.includes('shhh'), false)
  assert.match(redacted, /token=\[REDACTED\]/)
  assertArtifactDigest('a'.repeat(64))
  assert.throws(() => assertArtifactDigest('unknown'))
})

