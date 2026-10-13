import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

/** Windows checkout may use CRLF while pnpm's generated virtual store lock uses LF. */
export function normalizeLockNewlines(lock) {
  assert.ok(typeof lock === 'string' && lock.startsWith('lockfileVersion:'))
  return lock.replace(/\r\n/g, '\n')
}

export async function readCliGraphEvidence(root, version) {
  assert.ok(root, 'M7D_DSH_CLI_ROOT required for qualified browser run')
  const manifest = JSON.parse(await readFile(
    path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
  assert.equal(manifest.version, version)
  const rootLock = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  const approvedLock = await readFile(path.join(process.cwd(),
    'tests', 'm7d', 'cli', version, 'pnpm-lock.yaml'), 'utf8')
  assert.equal(normalizeLockNewlines(rootLock), normalizeLockNewlines(approvedLock),
    'installed CLI root differs from reviewed frozen dependency graph')
  const installedLock = await readFile(path.join(root, 'node_modules', '.pnpm', 'lock.yaml'), 'utf8')
  assert.equal(normalizeLockNewlines(installedLock), normalizeLockNewlines(rootLock),
    'installed CLI graph must match the lockfile')
  return sha256Text(normalizeLockNewlines(rootLock))
}

/**
 * Normalize only a referenced candidate tarball, not arbitrary resolved
 * dependencies or package versions. The candidate's unique .tgz basename
 * is checked before normalization.
 */
export function normalizeProfileLock(lock, tarball, disposableHome) {
  assert.ok(typeof lock === 'string' && lock.startsWith('lockfileVersion:'))
  const basename = path.basename(tarball)
  assert.match(basename, /^dsh-context-manager-[\w.-]+\.tgz$/)
  const escaped = basename.replaceAll('.', '\\.');
  // Normalize only the exact candidate locator, not every backslash in the lock.
  const matcher = new RegExp('file:[^\\s\\x22\\x27,{}()\\[\\]]*' + escaped, 'g')
  // pnpm legitimately records different relative spellings of one physical
  // candidate in importer, package and snapshot references. They must not be
  // treated as distinct installed candidates solely on string comparison.
  // Keep the same normalization used to approve the reviewed graph baselines.
  const normalized = lock.replaceAll('\\', '/')
  const references = [...normalized.matchAll(matcher)].map(match => match[0])
  assert.ok(references.length > 0, 'profile lock is missing verified packed-candidate locator')
  assert.ok(references.length <= 32, 'unexpected number of candidate references in profile lock')
  let graph = normalized.replace(matcher, 'file:__M7D_PACKED_CANDIDATE__')
  if (disposableHome !== undefined) {
    // Only the random leaf of the test-owned mkdtemp home may differ across
    // otherwise identical OS/DSH installations. Do not mask arbitrary paths,
    // package versions, URL sources, integrity values or dependency fields.
    const leaf = path.basename(disposableHome)
    assert.match(leaf, /^dsh-m7d-[A-Za-z0-9_-]+$/,
      'disposable profile graph normalization requires a runner-owned home')
    graph = graph.replaceAll(leaf, '__M7D_TEMP_HOME__')
  }
  return graph
}

/**
 * A Profile graph necessarily contains the candidate .tgz's integrity.
 * Bind approved graph snapshots to the *exact* candidate tarball rather than
 * silently ignoring its integrity or tolerating changes to other packages.
 */
export function assertReviewedProfileGraph(baselines, {
  platform, version, candidateSha256, graphSha256,
}) {
  assert.equal(baselines?.schemaVersion, 2, 'unsupported Profile graph baseline schema')
  assert.match(candidateSha256, /^[a-f0-9]{64}$/, 'candidate SHA-256 required')
  assert.match(graphSha256, /^[a-f0-9]{64}$/, 'Profile graph SHA-256 required')
  assert.equal(baselines.candidateSha256, candidateSha256,
    'packed candidate differs from reviewed Profile graph baseline; requalification required')
  const key = platform + '/' + version
  assert.match(baselines.graphs?.[key], /^[a-f0-9]{64}$/,
    'missing reviewed OS/version Profile graph baseline')
  assert.equal(graphSha256, baselines.graphs[key],
    'DSH Profile dependency graph drifted from the reviewed installed-package snapshot')
}

export async function readProfileGraphEvidence(home, profile, tarball, version, candidateSha256) {
  const lock = await readFile(
    path.join(home, 'profiles', profile, 'pnpm-lock.yaml'), 'utf8')
  const normalized = normalizeProfileLock(lock, tarball, home)
  const fingerprint = sha256Text(normalized)
  const baselines = JSON.parse(await readFile(path.join(process.cwd(),
    'tests', 'm7d', 'profile-graph-baselines.json'), 'utf8'))
  if (fingerprint !== baselines.graphs?.[process.platform + '/' + version]) {
    const original = normalizeProfileLock(lock, tarball)
    const leaf = path.basename(home)
    const occurrences = original.split(leaf).length - 1
    console.log('M7D Profile graph diagnostic: test-home references=' + occurrences
      + ', pre-normalization SHA-256=' + sha256Text(original)
      + ', home-normalized SHA-256=' + fingerprint)
  }
  assertReviewedProfileGraph(baselines, {
    platform: process.platform, version, candidateSha256,
    graphSha256: fingerprint,
  })
  return fingerprint
}
