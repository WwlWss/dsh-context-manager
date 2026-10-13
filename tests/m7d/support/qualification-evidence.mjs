import assert from 'node:assert/strict'
import { RETAINED_CLIENT_VERSIONS } from './contracts.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_SHA = /^[a-f0-9]{40}$/
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const COMMON_REQUIRED_SCENARIOS = Object.freeze([
  'client-mounted',
  'profile-created',
  'profile-name-saved',
  'browser-reloaded',
  'draft-preserved',
  'stale-write-blocked',
  'host-restarted',
  'default-created',
  'default-deleted-cleared',
  'keyboard-narrow-verified',
])
export function requiredScenarioIds(version) {
  assert.ok(RETAINED_CLIENT_VERSIONS.includes(version), 'unqualified M7D scenario version')
  if (version !== '0.1.6-alpha.2') return [
    ...COMMON_REQUIRED_SCENARIOS, 'legacy-live-graph-cycles',
  ]
  return [
    ...COMMON_REQUIRED_SCENARIOS,
    ...Array.from({ length: 5 }, (_, i) => 'native-off-' + (i + 1)),
    ...Array.from({ length: 5 }, (_, i) => 'native-on-' + (i + 1)),
    'native-graph-cycles',
    'native-remount-state',
    'native-code-hmr',
    'pending-rpc-lifecycle',
  ]
}


/**
 * Copy only fixed control IDs and statuses from the public DSH bare-Web
 * preflight. Its diagnostic strings, URLs and runtime environment never enter
 * a successful qualification artifact.
 */
export function sanitizeLegacyPreflight(version, document) {
  assert.ok(RETAINED_CLIENT_VERSIONS.includes(version))
  if (version === '0.1.6-alpha.2') return []
  assert.equal(document?.version, version, 'preflight version drift')
  assert.ok(Array.isArray(document?.results), 'missing legacy preflight results')
  const expectedTwo = ['A: bare-default', 'B: bare-explicit-hmr']
  const expectedFour = [...expectedTwo, 'C: packed-default', 'D: packed-explicit-hmr']
  const rows = document.results
  assert.deepEqual(rows.map(row => row.name),
    rows.length === 2 ? expectedTwo : expectedFour, 'incorrect legacy preflight control roster')
  return rows.map(row => {
    assert.ok(['passed', 'failed'].includes(row.status), 'invalid preflight result')
    if (row.explicitHmr) assert.equal(row.status, 'passed',
      'legacy Host with explicit HMR must pass')
    assert.equal(row.explicitHmr, /explicit-hmr$/.test(row.name))
    return { id: row.name.slice(3), status: row.status }
  })
}

/** Strict whitelist: no Host logs, DOM, exception text, URLs, paths or env. */
export function buildQualificationManifest(input) {
  assert.ok(RETAINED_CLIENT_VERSIONS.includes(input.dshVersion))
  for (const key of ['sourceCommit', 'testedCommit']) {
    assert.match(input[key], GIT_SHA, 'invalid ' + key)
  }
  for (const key of ['tarballSha256', 'cliGraphSha256', 'profileGraphSha256']) {
    assert.match(input[key], SHA256, 'invalid ' + key)
  }
  assert.ok(['linux', 'win32'].includes(input.platform))
  assert.ok(Array.isArray(input.scenarios) && input.scenarios.length > 0)
  assert.ok(input.scenarios.length <= 100)
  for (const item of input.scenarios) assert.match(item, ID, 'scenario must be a fixed ID')
  const expected = requiredScenarioIds(input.dshVersion)
  assert.equal(new Set(input.scenarios).size, input.scenarios.length, 'duplicated scenario ID')
  assert.deepEqual([...input.scenarios].sort(), expected.slice().sort(),
    'M7D qualifying execution must cover the complete version-specific scenario set')
  assert.equal(input.browserDiagnostics.blocking, 0,
    'cannot qualify an execution with browser blocking errors')
  const diagnosticCounts = {}
  for (const key of ['pageerror', 'crash', 'console', 'requestfailed', 'blocking']) {
    const value = input.browserDiagnostics[key]
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 10000,
      'invalid browser diagnostic count: ' + key)
    diagnosticCounts[key] = value
  }
  assert.ok(Array.isArray(input.legacyControls), 'missing legacy Host controls')
  if (input.dshVersion === '0.1.6-alpha.2') {
    assert.deepEqual(input.legacyControls, [], 'native HMR has no legacy controls')
  } else {
    assert.deepEqual(
      input.legacyControls,
      sanitizeLegacyPreflight(input.dshVersion, {
        version: input.dshVersion,
        results: input.legacyControls.map((row, index) => {
          const fullName = ['A: bare-default', 'B: bare-explicit-hmr',
            'C: packed-default', 'D: packed-explicit-hmr'][index]
          return { name: fullName, status: row.status,
            explicitHmr: row.id?.endsWith('explicit-hmr') }
        }),
      }),
      'legacy Host controls were not sanitized or complete')
  }
  return {
    schemaVersion: 2,
    scope: 'm7d-packed-web',
    sourceCommit: input.sourceCommit,
    testedCommit: input.testedCommit,
    platform: input.platform,
    dshVersion: input.dshVersion,
    tarballSha256: input.tarballSha256,
    cliGraphSha256: input.cliGraphSha256,
    profileGraphSha256: input.profileGraphSha256,
    scenarios: input.scenarios.map(id => ({ id, status: 'passed' })),
    browserDiagnostics: diagnosticCounts,
    legacyControls: input.legacyControls,
    status: 'passed',
  }
}
