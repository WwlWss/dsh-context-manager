import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { initializeWebProfileArgs, qualifyVersion } from './support/contracts.mjs'
import { isolatedEnv, runCommand, assertConfiguredCliVersion } from './support/run-web.mjs'
import { readCliGraphEvidence } from './support/graph-evidence.mjs'
import { installFrozenWebProfile } from './support/profile-frozen-install.mjs'

const version = qualifyVersion(process.env.M7D_DSH_VERSION)
const candidate = process.env.M7D_TARBALL
const expected = process.env.M7D_EXPECTED_SHA256
assert.ok(candidate && path.isAbsolute(candidate) && candidate.endsWith('.tgz'),
  'repeatability requires the absolute verified candidate tgz')
assert.match(expected, /^[a-f0-9]{64}$/)
assert.equal(createHash('sha256').update(await readFile(candidate)).digest('hex'),
  expected, 'repeatability input differs from exact package job')
await assertConfiguredCliVersion(version)
await readCliGraphEvidence(process.env.M7D_DSH_CLI_ROOT, version)

const results = []
for (let i = 0; i < 2; i++) {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
  try {
    const env = isolatedEnv(home)
    await runCommand(initializeWebProfileArgs(version, 'web'), env, process.cwd(),
      240_000)
    const installed = await installFrozenWebProfile({
      home, profile: 'web', tarball: candidate, version, env,
      cwd: process.cwd(), runCommand,
    })
    assert.equal(installed.candidateSha256, expected,
      'repeatability candidate changed across isolated homes')
    results.push(installed.profileGraphSha256)
    console.log('M7D frozen repeatability ' + (i + 1) + ': graph=' +
      installed.profileGraphSha256 + ', version=' + version)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
assert.equal(results[0], results[1],
  'independent frozen Profile installations resolved different external graphs')
console.log('M7D frozen repeatability verified across two independent homes')
