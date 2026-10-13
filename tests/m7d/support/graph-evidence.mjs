import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex')
}

export async function readCliGraphEvidence(root, version) {
  assert.ok(root, 'M7D_DSH_CLI_ROOT required for qualified browser run')
  const manifest = JSON.parse(await readFile(
    path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8'))
  assert.equal(manifest.version, version)
  const rootLock = await readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  const approvedLock = await readFile(path.join(process.cwd(),
    'tests', 'm7d', 'cli', version, 'pnpm-lock.yaml'), 'utf8')
  assert.equal(rootLock, approvedLock, 'installed CLI root differs from reviewed frozen dependency graph')
  const installedLock = await readFile(path.join(root, 'node_modules', '.pnpm', 'lock.yaml'), 'utf8')
  assert.equal(installedLock, rootLock, 'installed CLI graph must match the lockfile')
  return sha256Text(rootLock)
}

/**
 * Normalize only a referenced candidate tarball, not arbitrary resolved
 * dependencies or package versions. The candidate's unique .tgz basename
 * is checked before normalization.
 */
export function normalizeProfileLock(lock, tarball) {
  assert.ok(typeof lock === 'string' && lock.startsWith('lockfileVersion:'))
  const basename = path.basename(tarball)
  assert.match(basename, /^dsh-context-manager-[\w.-]+\.tgz$/)
  const escaped = basename.replaceAll('.', '\\.');
  // Normalize only the exact candidate locator, not every backslash in the lock.
  const matcher = new RegExp('file:[^\\s\\x22\\x27,{}()\\[\\]]*' + escaped, 'g')
  const references = [...lock.matchAll(matcher)].map(match => match[0])
  assert.ok(references.length > 0, 'profile lock is missing verified packed-candidate locator')
  assert.equal(new Set(references.map(ref => ref.replaceAll('\\', '/'))).size, 1,
    'ambiguous packed-candidate locators in profile lock')
  return lock.replace(matcher, 'file:__M7D_PACKED_CANDIDATE__')
}

export async function readProfileGraphEvidence(home, profile, tarball, version) {
  const lock = await readFile(
    path.join(home, 'profiles', profile, 'pnpm-lock.yaml'), 'utf8')
  const fingerprint = sha256Text(normalizeProfileLock(lock, tarball))
  const baselines = JSON.parse(await readFile(path.join(process.cwd(),
    'tests', 'm7d', 'profile-graph-baselines.json'), 'utf8'))
  const key = process.platform + '/' + version
  assert.match(baselines[key], /^[a-f0-9]{64}$/, 'missing reviewed Profile graph baseline')
  assert.equal(fingerprint, baselines[key],
    'DSH Profile dependency graph drifted from the reviewed installed-package snapshot')
  return fingerprint
}
