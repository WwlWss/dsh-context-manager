import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  assertConfiguredCliVersion, isolatedEnv, runCommand,
} from './support/run-web.mjs'
import {
  qualifyVersion, initializeWebProfileArgs, installArgs,
} from './support/contracts.mjs'
import { summarizeProfileLock, diffProfileGraph } from './support/profile-graph-audit.mjs'

const VERSION = qualifyVersion(process.env.M7D_DSH_VERSION)
const TIMEOUT = 240_000
const PROFILE = 'web'
const CWD = process.cwd()

async function installOne(tarball) {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
  try {
    const env = isolatedEnv(home)
    await runCommand(initializeWebProfileArgs(VERSION, PROFILE), env, CWD, TIMEOUT)
    await runCommand(installArgs(VERSION, PROFILE, tarball), env, CWD, TIMEOUT)
    const rawLock = await readFile(
      path.join(home, 'profiles', PROFILE, 'pnpm-lock.yaml'), 'utf8')
    const manifest = JSON.parse(await readFile(
      path.join(home, 'profiles', PROFILE, 'package.json'), 'utf8'))
    assert.ok(Object.hasOwn(manifest.dependencies || {}, 'dsh-context-manager'),
      'native dsh plugin add did not add the candidate dependency')
    const selected = manifest.dsh?.profile?.bundles ?? []
    assert.ok(selected.includes('dsh-context-manager'),
      'native dsh plugin add did not select the bundle for profile activation')
    return summarizeProfileLock(rawLock, { version: VERSION, platform: process.platform })
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}

async function main() {
  await assertConfiguredCliVersion(VERSION)
  const tarball = path.resolve(process.env.M7D_TARBALL || '')
  assert.ok(process.env.M7D_TARBALL && tarball.endsWith('.tgz'),
    'M7D_TARBALL must be a verified packed candidate')
  const data = await readFile(tarball)
  const candidate = createHash('sha256').update(data).digest('hex')
  assert.equal(candidate, process.env.M7D_EXPECTED_SHA256,
    'test candidate does not match the package job')
  const out = path.resolve(process.env.M7D_OUTPUT_DIR || '.artifacts/m7d-profile-audit')
  await mkdir(out, { recursive: true })
  const attempts = []
  for (let i = 0; i < 2; i++) {
    const snapshot = await installOne(tarball)
    attempts.push(snapshot)
    await writeFile(path.join(out, 'profile-audit-' + (i + 1) + '.json'),
      JSON.stringify({ ...snapshot, candidateSha256: candidate }, null, 2) + '\n',
      { mode: 0o600 })
    console.log('M7D audit attempt ' + (i + 1) + ', version=' + VERSION +
      ', external count=' + snapshot.counts.packages +
      ', sanitized evidence=' + snapshot.evidenceSha256)
  }
  const diff = diffProfileGraph(attempts[0], attempts[1])
  await writeFile(path.join(out, 'profile-audit-diff.json'),
    JSON.stringify(diff, null, 2) + '\n', { mode: 0o600 })
  console.log('M7D audit comparison: ' + diff.changes.length +
    ' sanitized changes across two independent native Profile installs')
  for (const entry of diff.changes.slice(0, 20)) {
    console.log('M7D audit difference: ' + entry.kind + ' / ' + entry.section +
      ' / ' + JSON.stringify(entry.identity).slice(0, 240))
  }
}
await main()
