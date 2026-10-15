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
