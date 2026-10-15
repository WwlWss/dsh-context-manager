import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  assertConfiguredCliVersion, isolatedEnv, runCommand,
} from './support/run-web.mjs'
import {
  qualifyVersion, initializeWebProfileArgs, installArgs,
} from './support/contracts.mjs'

const version = qualifyVersion(process.env.M7D_DSH_VERSION)
const tarball = path.resolve(process.env.M7D_TARBALL || '')
assert.ok(process.env.M7D_TARBALL?.endsWith('.tgz'), 'verified tarball required')
assert.equal(createHash('sha256').update(await readFile(tarball)).digest('hex'),
  process.env.M7D_EXPECTED_SHA256, 'native add smoke must use qualified packed bytes')
await assertConfiguredCliVersion(version)
const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
try {
  const env = isolatedEnv(home)
  await runCommand(initializeWebProfileArgs(version, 'web'), env,
    process.cwd(), 240_000)
  await runCommand(installArgs(version, 'web', tarball), env,
    process.cwd(), 240_000)
  const profile = path.join(home, 'profiles', 'web')
  const manifest = JSON.parse(await readFile(path.join(profile, 'package.json'), 'utf8'))
  assert.ok(manifest.dependencies?.['dsh-context-manager'],
    'native DSH plugin add did not persist the candidate dependency')
  assert.ok(manifest.dsh?.profile?.bundles?.includes('dsh-context-manager'),
    'native DSH plugin add did not activate the candidate Bundle')
  const installed = JSON.parse(await readFile(
    path.join(profile, 'node_modules', 'dsh-context-manager', 'package.json'), 'utf8'))
  assert.equal(installed.name, 'dsh-context-manager')
  assert.ok(typeof installed.dsh?.bundle?.patch === 'string',
    'installed package does not expose the Bundle patch')
  console.log('M7D native plugin-add compatibility passed: ' + version)
} finally {
  await rm(home, { recursive: true, force: true })
}
