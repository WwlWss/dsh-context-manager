import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import YAML from 'yaml'

const MAX_LOCK_BYTES = 5 * 1024 * 1024
const MAX_NODES = 25_000
const INTEGRITY = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/

const digest = value => createHash('sha256').update(value).digest('hex')
const object = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value)
const sortObject = value => {
  if (Array.isArray(value)) return value.map(sortObject)
  if (!object(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key =>
    [key, sortObject(value[key])]))
}
const hashObject = value => digest(JSON.stringify(sortObject(value)))

function strictMap(value, name) {
  assert.ok(object(value), 'invalid ' + name + ' mapping in pnpm lock')
  assert.ok(Object.keys(value).length <= MAX_NODES, name + ' map exceeds bound')
  return value
}

/** Parse a real pnpm v9 lock, rejecting duplicate YAML keys and ambiguous structures. */
export function parseProfileLock(source) {
  assert.ok(typeof source === 'string' &&
    Buffer.byteLength(source) <= MAX_LOCK_BYTES, 'Profile lock is too large')
  const document = YAML.parseDocument(source, {
    uniqueKeys: true, merge: false, maxAliasCount: 0,
  })
  assert.equal(document.errors.length, 0, 'invalid or duplicate-key pnpm YAML')
  const lock = document.toJS({ maxAliasCount: 0 })
  assert.ok(object(lock), 'pnpm lock is not an object')
  assert.equal(String(lock.lockfileVersion), '9.0', 'unsupported pnpm lockfile version')
  strictMap(lock.importers, 'importers')
  strictMap(lock.packages, 'packages')
  strictMap(lock.snapshots, 'snapshots')
  strictMap(lock.settings, 'settings')
  return lock
}

function safeValue(value) {
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
    return { opaqueSha256: hashObject(value) }
  }
  // No raw URLs, filesystem paths, authentication tokens or unbounded text
  // may enter a successful or failed publicly accessible CI artifact.
  if (value.length > 300 ||
    /https?:|file:|\\|(?:[A-Za-z]:[/\\])|(?:^|[/\\])(?:Users|home|tmp|Temp)[/\\]|[?&](?:token|auth|key)=/i.test(value) ||
    !/^[A-Za-z0-9@._/+():^*<>=~|!?, -]+$/.test(value)) {
    return { opaqueSha256: digest(value) }
  }
  return value
}

function sanitizeEdges(edges) {
  if (edges === undefined) return {}
  const map = strictMap(edges, 'dependency edges')
  return Object.keys(map).sort().map(name => ({
    name: safeValue(name), value: safeValue(map[name]),
  }))
}

function externalPackage(locator, data) {
  const resolution = object(data.resolution) ? data.resolution : {}
  const integrity = resolution.integrity
  assert.ok(integrity === undefined ||
    (typeof integrity === 'string' && INTEGRITY.test(integrity)),
    'invalid external package integrity')
  return {
    locator: safeValue(locator),
    integrity: integrity ?? null,
    provenance: resolution.tarball === undefined ? 'registry-or-local' :
      { sourceSha256: digest(String(resolution.tarball)) },
    dependencies: sanitizeEdges(data.dependencies),
    optionalDependencies: sanitizeEdges(data.optionalDependencies),
    peerDependencies: sanitizeEdges(data.peerDependencies),
    peerDependenciesMeta: object(data.peerDependenciesMeta) ?
      sortObject(data.peerDependenciesMeta) : {},
    metadataSha256: hashObject(Object.fromEntries(
      Object.entries(data).filter(([key]) =>
        !['resolution', 'dependencies', 'optionalDependencies',
          'peerDependencies', 'peerDependenciesMeta'].includes(key)))),
  }
}

function snapshot(locator, data) {
  return {
    locator: safeValue(locator),
    dependencies: sanitizeEdges(data.dependencies),
    optionalDependencies: sanitizeEdges(data.optionalDependencies),
    transitivePeerDependencies: Array.isArray(data.transitivePeerDependencies) ?
      data.transitivePeerDependencies.map(safeValue).sort() : [],
    metadataSha256: hashObject(Object.fromEntries(
      Object.entries(data).filter(([key]) =>
        !['dependencies', 'optionalDependencies', 'transitivePeerDependencies'].includes(key)))),
  }
}

function importer(name, data) {
  return {
    name: safeValue(name),
    dependencies: sanitizeEdges(data.dependencies),
    devDependencies: sanitizeEdges(data.devDependencies),
    optionalDependencies: sanitizeEdges(data.optionalDependencies),
    metadataSha256: hashObject(Object.fromEntries(
      Object.entries(data).filter(([key]) =>
        !['dependencies', 'devDependencies', 'optionalDependencies'].includes(key)))),
  }
}

function recordMap(map, convert) {
  return Object.keys(map).sort().map(key => {
    const value = map[key]
    assert.ok(object(value), 'pnpm lock record is malformed')
    return convert(key, value)
  })
}

/**
 * Confidentiality-limited dependency evidence. It is deliberately a factual
 * summary, not a baseline approval or a replacement for frozen installation.
 */
export function summarizeProfileLock(source, { version, platform } = {}) {
  const lock = parseProfileLock(source)
  const packages = recordMap(lock.packages, externalPackage)
  const snapshots = recordMap(lock.snapshots, snapshot)
  const importers = recordMap(lock.importers, importer)
  const result = {
    schemaVersion: 1,
    version: safeValue(version ?? 'unknown'),
    platform: safeValue(platform ?? process.platform),
    lockfileVersion: String(lock.lockfileVersion),
    settingsSha256: hashObject(lock.settings),
    importers, packages, snapshots,
  }
  return {
    ...result,
    evidenceSha256: hashObject(result),
    counts: { packages: packages.length, snapshots: snapshots.length,
      importers: importers.length },
  }
}

function mapBy(items, key) {
  const map = new Map()
  for (const item of items) {
    const id = JSON.stringify(item[key])
    assert.ok(!map.has(id), 'duplicate sanitized dependency identity')
    map.set(id, item)
  }
  return map
}

export function diffProfileGraph(before, after) {
  const changes = []
  for (const [section, key] of [['packages', 'locator'],
    ['snapshots', 'locator'], ['importers', 'name']]) {
    const left = mapBy(before[section], key), right = mapBy(after[section], key)
    for (const locator of new Set([...left.keys(), ...right.keys()])) {
      const a = left.get(locator), b = right.get(locator)
      if (a !== undefined && b !== undefined && hashObject(a) === hashObject(b)) continue
      const label = a?.[key] ?? b?.[key]
      const candidate = String(JSON.stringify(label)).includes('dsh-context-manager')
      changes.push({
        kind: candidate ? 'candidate-drift' :
          a && b && a.integrity !== b.integrity ? 'integrity-drift' :
            'dependency-drift',
        section, identity: label,
        before: a ?? null, after: b ?? null,
      })
    }
  }
  if (before.settingsSha256 !== after.settingsSha256) {
    changes.push({ kind: 'environment-only', section: 'settings',
      before: before.settingsSha256, after: after.settingsSha256 })
  }
  return { schemaVersion: 1, before: before.evidenceSha256,
    after: after.evidenceSha256, changes }
}
