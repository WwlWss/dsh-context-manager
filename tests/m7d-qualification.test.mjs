import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildQualificationManifest } from './m7d/support/qualification-evidence.mjs'
import { normalizeProfileLock, sha256Text } from './m7d/support/graph-evidence.mjs'

const valid = {
  dshVersion: '0.1.5-rc.2', sourceCommit: 'a'.repeat(40),
  testedCommit: 'b'.repeat(40), platform: 'linux',
  tarballSha256: 'c'.repeat(64), cliGraphSha256: 'd'.repeat(64),
  profileGraphSha256: 'e'.repeat(64), scenarios: ['scenario-01'],
  browserDiagnostics: { pageerror: 0, crash: 0, console: 0, requestfailed: 1, blocking: 0 },
}
test('public qualification manifest contains only validated fixed fields', () => {
  const manifest = buildQualificationManifest({ ...valid, secret: 'NEVER_PUBLISH' })
  assert.equal(manifest.status, 'passed')
  assert.equal(JSON.stringify(manifest).includes('NEVER_PUBLISH'), false)
  assert.deepEqual(manifest.scenarios, [{ id: 'scenario-01', status: 'passed' }])
})
test('invalid evidence and browser errors cannot be marked passed', () => {
  assert.throws(() => buildQualificationManifest({
    ...valid, scenarios: ['arbitrary unbounded description'],
  }))
  assert.throws(() => buildQualificationManifest({
    ...valid, browserDiagnostics: { ...valid.browserDiagnostics, blocking: 1 },
  }))
})
test('profile lock fingerprint retains changes unrelated to synthetic tarball', () => {
  const lock = "lockfileVersion: '9.0'\nfile:../../.artifacts/dsh-context-manager-0.1.0-alpha.0.tgz\nother: 1\n"
  const normalized = normalizeProfileLock(lock, '/tmp/dsh-context-manager-0.1.0-alpha.0.tgz')
  assert.match(normalized, /__M7D_PACKED_CANDIDATE__/)
  assert.notEqual(sha256Text(normalized), sha256Text(normalized.replace('other: 1', 'other: 2')))
})
