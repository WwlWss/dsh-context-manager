import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildQualificationManifest, requiredScenarioIds, sanitizeLegacyPreflight,
} from './m7d/support/qualification-evidence.mjs'
import { normalizeProfileLock, normalizeLockNewlines, sha256Text } from './m7d/support/graph-evidence.mjs'

const legacyControls = [
  { id: 'bare-default', status: 'failed' },
  { id: 'bare-explicit-hmr', status: 'passed' },
]
const valid = {
  dshVersion: '0.1.5-rc.2',
  sourceCommit: 'a'.repeat(40),
  testedCommit: 'b'.repeat(40),
  platform: 'linux',
  tarballSha256: 'c'.repeat(64),
  cliGraphSha256: 'd'.repeat(64),
  profileGraphSha256: 'e'.repeat(64),
  scenarios: requiredScenarioIds('0.1.5-rc.2'),
  legacyControls,
  browserDiagnostics: {
    pageerror: 0, crash: 0, console: 0, requestfailed: 1, blocking: 0,
  },
}

test('public qualification manifest is complete, fixed-schema, and omits unknown secrets', () => {
  const manifest = buildQualificationManifest({
    ...valid, secret: 'NEVER_PUBLISH', hostDiagnosticTail: 'NEVER_PUBLISH',
  })
  assert.equal(manifest.status, 'passed')
  assert.equal(manifest.schemaVersion, 2)
  assert.equal(JSON.stringify(manifest).includes('NEVER_PUBLISH'), false)
  assert.deepEqual(manifest.scenarios,
    requiredScenarioIds('0.1.5-rc.2').map(id => ({ id, status: 'passed' })))
  assert.deepEqual(manifest.legacyControls, legacyControls)
})

test('missing, unexpected and duplicate scenarios never qualify', () => {
  for (const scenarios of [
    valid.scenarios.slice(1),
    [...valid.scenarios, 'unknown-but-well-formed'],
    [...valid.scenarios, valid.scenarios[0]],
    ['loose human prose'],
  ]) {
    assert.throws(() => buildQualificationManifest({ ...valid, scenarios }))
  }
  assert.throws(() => buildQualificationManifest({
    ...valid, browserDiagnostics: { ...valid.browserDiagnostics, blocking: 1 },
  }), /blocking/)
})

test('native lifecycle has a distinct required roster including pending RPC', () => {
  const native = requiredScenarioIds('0.1.6-alpha.2')
  assert.ok(native.includes('pending-rpc-lifecycle'))
  assert.ok(native.includes('native-code-hmr'))
  assert.ok(!native.includes('legacy-live-graph-cycles'))
  assert.equal(native.length, new Set(native).size)
  assert.throws(() => buildQualificationManifest({
    ...valid, dshVersion: '0.1.6-alpha.2', legacyControls: [],
  }), /complete version-specific/)
})

test('legacy Host controls are sanitized and explicit HMR failures block evidence', () => {
  const document = {
    version: '0.1.5-rc.2',
    results: [
      { name: 'A: bare-default', status: 'failed', explicitHmr: false, diagnostic: 'PRIVATE' },
      { name: 'B: bare-explicit-hmr', status: 'passed', explicitHmr: true, hostTail: 'PRIVATE' },
    ],
  }
  assert.deepEqual(sanitizeLegacyPreflight('0.1.5-rc.2', document), legacyControls)
  assert.equal(JSON.stringify(sanitizeLegacyPreflight('0.1.5-rc.2', document))
    .includes('PRIVATE'), false)
  assert.throws(() => sanitizeLegacyPreflight('0.1.5-rc.2', {
    ...document, results: document.results.slice(0, 1),
  }), /roster/)
  assert.throws(() => sanitizeLegacyPreflight('0.1.5-rc.2', {
    ...document,
    results: [{ ...document.results[0] },
      { ...document.results[1], status: 'failed' }],
  }), /must pass/)
  assert.throws(() => buildQualificationManifest({
    ...valid, legacyControls: legacyControls.slice(0, 1),
  }))
})

test('candidate locator normalization preserves all other graph and integrity fields', () => {
  const tarball = '/tmp/dsh-context-manager-0.1.0-alpha.0.tgz'
  const lock = "lockfileVersion: '9.0'\n" +
    "file:../../.artifacts/dsh-context-manager-0.1.0-alpha.0.tgz\n" +
    "other: 1\nintegrity: sha512-a\n"
  const normalized = normalizeProfileLock(lock, tarball)
  assert.match(normalized, /__M7D_PACKED_CANDIDATE__/)
  assert.notEqual(sha256Text(normalized),
    sha256Text(normalized.replace('other: 1', 'other: 2')))
  assert.notEqual(sha256Text(normalized),
    sha256Text(normalized.replace('sha512-a', 'sha512-b')))
  assert.throws(() => normalizeProfileLock("lockfileVersion: '9.0'\nother: 1\n",
    tarball), /missing verified/)
  // pnpm may refer to the same packed candidate by more than one relative
  // spelling from different lock sections; do not mistake that for graph drift.
  const multipleReferences = normalizeProfileLock(
    "lockfileVersion: '9.0'\n" +
    "file:/tmp/one/dsh-context-manager-0.1.0-alpha.0.tgz\n" +
    "file:/tmp/two/dsh-context-manager-0.1.0-alpha.0.tgz\n",
    tarball,
  )
  assert.equal((multipleReferences.match(/file:__M7D_PACKED_CANDIDATE__/g) || []).length, 2)
})

test('CLI graph equality ignores only Windows CRLF translation', () => {
  const unix = "lockfileVersion: '9.0'\npackages:\n  example: 1\n"
  const win = unix.replace(/\n/g, '\r\n')
  assert.equal(normalizeLockNewlines(win), unix)
  assert.equal(sha256Text(normalizeLockNewlines(win)), sha256Text(unix))
  assert.notEqual(normalizeLockNewlines(win.replace('example: 1', 'example: 2')), unix)
  assert.throws(() => normalizeLockNewlines('not-a-pnpm-lock'), /lockfileVersion/)
})
