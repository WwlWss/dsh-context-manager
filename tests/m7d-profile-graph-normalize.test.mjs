import assert from 'node:assert/strict'
import { test } from 'node:test'
import YAML from 'yaml'
import {
  CANDIDATE_INTEGRITY_MARKER, canonicalizeExternalGraph,
  renderApprovedProfileLock, assertApprovedExternalGraph,
} from './m7d/support/profile-graph-normalize.mjs'

const name = 'dsh-context-manager-0.1.0-alpha.0.tgz'
const ref = 'file:vendor/' + name
const locator = 'dsh-context-manager@' + ref
const bytes = Buffer.from('synthetic packed candidate')
function template() {
  return {
    lockfileVersion: '9.0',
    settings: { autoInstallPeers: false, excludeLinksFromLockfile: false },
    importers: { '.': { dependencies: {
      'dsh-context-manager': { specifier: ref, version: ref },
    } } },
    packages: {
      [locator]: { resolution: { integrity: CANDIDATE_INTEGRITY_MARKER,
        tarball: ref }, peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' } },
      'zod@4.6.7': { resolution: { integrity: 'sha512-YWJj' } },
    },
    snapshots: {
      [locator]: { dependencies: { zod: '4.6.7' } },
      'zod@4.6.7': {},
    },
  }
}
const render = (obj, candidate = bytes) =>
  renderApprovedProfileLock(YAML.stringify(obj), name, candidate)

test('candidate byte changes rebind SHA-512 without changing the external graph', () => {
  const first = render(template())
  const second = render(template(), Buffer.from('new candidate bytes'))
  assert.equal(first.graphSha256, second.graphSha256)
  assert.notEqual(first.candidateSha256, second.candidateSha256)
  assert.notEqual(first.candidateSha512, second.candidateSha512)
  assert.ok(first.lockText.includes(first.candidateSha512))
  assert.ok(!first.lockText.includes(CANDIDATE_INTEGRITY_MARKER))
  assert.equal(canonicalizeExternalGraph(first.lockText, name, bytes).graphSha256,
    first.graphSha256)
})

test('external integrity, version, peer dependency and edge changes are fatal drift', () => {
  const baseline = render(template())
  for (const mutate of [
    lock => { lock.packages['zod@4.6.7'].resolution.integrity = 'sha512-ZGVm' },
    lock => { lock.snapshots[locator].dependencies.zod = '4.6.6' },
    lock => { lock.packages[locator].peerDependencies['@deepseek-ai/cordis'] = '^5.0.0' },
    lock => { lock.packages['zod@4.6.7'].extra = true },
  ]) {
    const changed = template()
    mutate(changed)
    const newGraph = render(changed)
    assert.notEqual(newGraph.graphSha256, baseline.graphSha256)
    assert.throws(() => assertApprovedExternalGraph({
      schemaVersion: 1, graphSha256: baseline.graphSha256,
    }, newGraph), /graph drifted/)
  }
})

test('candidate locator cannot redirect to a different file or lose its resolution', () => {
  const redirect = template()
  redirect.importers['.'].dependencies['dsh-context-manager'].specifier = 'file:vendor/other.tgz'
  assert.throws(() => render(redirect), /verified vendor locator/)
  const missing = template()
  delete missing.packages[locator].resolution.integrity
  assert.throws(() => render(missing), /integrity marker/)
  const duplicate = template()
  duplicate.packages['dsh-context-manager@file:vendor/extra.tgz'] = {
    resolution: { integrity: CANDIDATE_INTEGRITY_MARKER },
  }
  assert.throws(() => render(duplicate), /one candidate package/)
  const fake = render(template())
  assert.throws(() =>
    canonicalizeExternalGraph(fake.lockText, name, Buffer.from('wrong candidate')),
  /does not match/)
})

test('YAML map order and native line endings cannot influence external graph digest', () => {
  const first = render(template())
  const lock = template()
  lock.snapshots = Object.fromEntries(Object.entries(lock.snapshots).reverse())
  lock.packages = Object.fromEntries(Object.entries(lock.packages).reverse())
  const reordered = YAML.stringify(lock).replace(/\n/g, '\r\n')
  const second = renderApprovedProfileLock(reordered, name, bytes)
  assert.equal(first.graphSha256, second.graphSha256)
})
