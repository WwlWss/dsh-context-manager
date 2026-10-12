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
  const escaped = basename.replaceAll('.', '\\.')
  const re = new RegExp('file:[^\\s\\x22\\x27,{}()\\[\\]]*' + escaped, 'g')
  const result = lock.replaceAll('\\', '/').replace(re, 'file:__M7D_PACKED_CANDIDATE__')
  assert.ok(result.includes('dsh-context-manager') || result.includes('__M7D_PACKED_CANDIDATE__'),
    'profile lock does not contain the installed candidate')
  return result
}

export async function readProfileGraphEvidence(home, profile, tarball) {
  const lock = await readFile(
    path.join(home, 'profiles', profile, 'pnpm-lock.yaml'), 'utf8')
  return sha256Text(normalizeProfileLock(lock, tarball))
}
