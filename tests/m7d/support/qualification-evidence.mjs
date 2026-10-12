import assert from 'node:assert/strict'
import { RETAINED_CLIENT_VERSIONS } from './contracts.mjs'

const SHA256 = /^[a-f0-9]{64}$/
const GIT_SHA = /^[a-f0-9]{40}$/
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
  assert.equal(input.browserDiagnostics.blocking, 0,
    'cannot qualify an execution with browser blocking errors')
  const diagnosticCounts = {}
  for (const key of ['pageerror', 'crash', 'console', 'requestfailed', 'blocking']) {
    const value = input.browserDiagnostics[key]
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 10000,
      'invalid browser diagnostic count: ' + key)
    diagnosticCounts[key] = value
  }
  return {
    schemaVersion: 1,
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
    status: 'passed',
  }
}
