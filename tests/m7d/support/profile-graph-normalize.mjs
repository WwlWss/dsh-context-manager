import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import YAML from 'yaml'
import { parseProfileLock } from './profile-graph-audit.mjs'

export const CANDIDATE_INTEGRITY_MARKER = '__M7D_VERIFIED_CANDIDATE_SHA512__'
const HASH = /^[a-f0-9]{64}$/
const TAR = /^dsh-context-manager-[A-Za-z0-9._-]+\.tgz$/

const sha = (bytes, algorithm) =>
  createHash(algorithm).update(bytes).digest(algorithm === 'sha512' ? 'base64' : 'hex')

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted)
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]))
  return value
}
const clone = value => structuredClone(value)

function candidateShape(lock, tarballName) {
  assert.match(tarballName, TAR)
  assert.deepEqual(Object.keys(lock.importers), ['.'], 'frozen Profile has one root importer')
  const dep = lock.importers['.'].dependencies?.['dsh-context-manager']
  assert.ok(dep && typeof dep === 'object', 'missing candidate importer dependency')
  const ref = 'file:vendor/' + tarballName
  assert.equal(dep.specifier, ref, 'candidate must be installed from Profile-owned vendor path')
  assert.ok(typeof dep.version === 'string' &&
    (dep.version === ref || dep.version.startsWith(ref + '(')),
    'candidate installed version diverges from verified vendor locator')
  const prefix = 'dsh-context-manager@' + ref
  const packages = Object.keys(lock.packages).filter(k => k.startsWith('dsh-context-manager@'))
  assert.equal(packages.length, 1, 'expected one candidate package locator')
  assert.ok(packages[0] === prefix || packages[0].startsWith(prefix + '('),
    'candidate package does not use verified vendor path')
  const snapshots = Object.keys(lock.snapshots).filter(k => k.startsWith('dsh-context-manager@'))
  assert.equal(snapshots.length, 1, 'expected one candidate snapshot')
  assert.equal(snapshots[0], packages[0],
    'candidate package and snapshot resolution disagree')
  const pkg = lock.packages[packages[0]]
  assert.ok(pkg?.resolution && typeof pkg.resolution === 'object',
    'missing candidate package resolution')
  if (pkg.resolution.tarball !== undefined)
    assert.equal(pkg.resolution.tarball, ref, 'candidate tarball source differs')
  return { ref, pkgKey: packages[0], snapshotKey: snapshots[0], dep, pkg }
}

/**
 * Candidate bytes and the approved external dependency graph are separate
 * authorities. Verify the real tarball's SHA-512 before suppressing its own
 * integrity in a *derived* graph fingerprint; never suppress an external
 * package's integrity or peer resolution.
 */
export function canonicalizeExternalGraph(sourceOrObject, tarballName, bytes, {
  allowTemplateMarker = false,
} = {}) {
  const lock = typeof sourceOrObject === 'string' ?
    parseProfileLock(sourceOrObject) : clone(sourceOrObject)
  const { ref, pkgKey, snapshotKey, dep, pkg } = candidateShape(lock, tarballName)
  assert.ok(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array,
    'candidate bytes must come from verified packed tarball')
  const expectedIntegrity = 'sha512-' + sha(bytes, 'sha512')
  assert.ok(pkg.resolution.integrity === expectedIntegrity ||
    (allowTemplateMarker && pkg.resolution.integrity === CANDIDATE_INTEGRITY_MARKER),
    'candidate integrity does not match packed tarball bytes')
  const graph = clone(lock)
  const importer = graph.importers['.'].dependencies['dsh-context-manager']
  importer.specifier = '__M7D_VERIFIED_CANDIDATE__'
  importer.version = '__M7D_VERIFIED_CANDIDATE__'
  graph.packages['dsh-context-manager@__M7D_VERIFIED_CANDIDATE__'] =
    graph.packages[pkgKey]
  delete graph.packages[pkgKey]
  const candidatePkg = graph.packages['dsh-context-manager@__M7D_VERIFIED_CANDIDATE__']
  candidatePkg.resolution.integrity = '__VERIFIED_CANDIDATE_INTEGRITY__'
  if (candidatePkg.resolution.tarball !== undefined)
    candidatePkg.resolution.tarball = '__M7D_VERIFIED_CANDIDATE__'
  graph.snapshots['dsh-context-manager@__M7D_VERIFIED_CANDIDATE__'] =
    graph.snapshots[snapshotKey]
  delete graph.snapshots[snapshotKey]
  const canonical = JSON.stringify(sorted(graph))
  assert.ok(!canonical.includes(tarballName) && !canonical.includes(ref),
    'unrecognized candidate references remain in external graph')
  return {
    graphSha256: sha(Buffer.from(canonical), 'sha256'),
    candidateSha256: sha(bytes, 'sha256'),
    candidateSha512: expectedIntegrity,
    canonical,
  }
}

export function renderApprovedProfileLock(template, tarballName, candidateBytes) {
  const lock = parseProfileLock(template)
  const { pkg } = candidateShape(lock, tarballName)
  assert.equal(pkg.resolution.integrity, CANDIDATE_INTEGRITY_MARKER,
    'reviewed Profile template must carry only its explicit integrity marker')
  const approved = canonicalizeExternalGraph(lock, tarballName, candidateBytes, {
    allowTemplateMarker: true,
  })
  pkg.resolution.integrity = approved.candidateSha512
  const lockText = YAML.stringify(lock, { lineWidth: 0, sortMapEntries: true })
  assert.ok(!lockText.includes(CANDIDATE_INTEGRITY_MARKER))
  const verified = canonicalizeExternalGraph(lockText, tarballName, candidateBytes)
  assert.equal(verified.graphSha256, approved.graphSha256)
  return { lockText, ...verified }
}

export function assertApprovedExternalGraph(expected, actual) {
  assert.equal(expected?.schemaVersion, 1, 'unsupported external graph baseline')
  assert.match(expected.graphSha256, HASH, 'missing approved external graph hash')
  assert.equal(actual.graphSha256, expected.graphSha256,
    'external Profile dependency graph drifted from frozen approval')
}

export function verifyInstalledCandidatePackage(manifest, lock, tarballName) {
  const { ref } = candidateShape(lock, tarballName)
  assert.equal(manifest.dependencies?.['dsh-context-manager'], ref,
    'installed Profile candidate dependency differs from reviewed lock')
  assert.ok(manifest.dsh?.profile?.bundles?.includes('dsh-context-manager'),
    'candidate Bundle is not selected in the actual Web Profile')
}
