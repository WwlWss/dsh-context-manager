import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import {
  assertConfiguredCliVersion, isolatedEnv, runCommand,
} from './run-web.mjs'
import { initializeWebProfileArgs, installArgs } from './contracts.mjs'
import { parseProfileLock, summarizeProfileLock } from './profile-graph-audit.mjs'

const VERSION = '0.1.6-alpha.2'
const TIMEOUT = 240_000
const CANDIDATE_MARKER = '__M7D_VERIFIED_CANDIDATE_SHA512__'

export async function generateReviewedProfileTemplate(tarball, outputDirectory) {
  await assertConfiguredCliVersion(VERSION)
  const buffer = await readFile(tarball)
  const expectedSha256 = createHash('sha256').update(buffer).digest('hex')
  assert.equal(expectedSha256, process.env.M7D_EXPECTED_SHA256)
  const integrity = 'sha512-' + createHash('sha512').update(buffer).digest('base64')
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
  try {
    const env = isolatedEnv(home)
    await runCommand(initializeWebProfileArgs(VERSION, 'web'), env,
      process.cwd(), TIMEOUT)
    const dir = path.join(home, 'profiles', 'web')
    const vendor = path.join(dir, 'vendor')
    await mkdir(vendor, { recursive: true })
    const installedCandidate = path.join(vendor, path.basename(tarball))
    await copyFile(tarball, installedCandidate)
    await runCommand(installArgs(VERSION, 'web', installedCandidate), env,
      process.cwd(), TIMEOUT)

    const lockText = await readFile(path.join(dir, 'pnpm-lock.yaml'), 'utf8')
    const lock = parseProfileLock(lockText)
    assert.ok(Object.hasOwn(lock.importers, '.'), 'unexpected importer for reviewed Profile')
    const dep = lock.importers['.'].dependencies?.['dsh-context-manager']
    assert.ok(dep && typeof dep.specifier === 'string' &&
      dep.specifier.includes('vendor/'), 'candidate spec must be profile-vendored')
    const candidates = Object.entries(lock.packages).filter(([key]) =>
      key.startsWith('dsh-context-manager@file:'))
    assert.equal(candidates.length, 1, 'expected precisely one installed candidate')
    const [locator, pkg] = candidates[0]
    assert.equal(pkg.resolution?.integrity, integrity,
      'pnpm candidate integrity differs from verified packed bytes')
    assert.ok(locator.includes('vendor/'), 'candidate package locator must be relative')
    assert.ok(Object.keys(lock.snapshots).some(key =>
      key.startsWith('dsh-context-manager@file:')),
    'candidate package has no installed snapshot')
    const manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'))
    assert.ok(manifest.dsh?.profile?.bundles?.includes('dsh-context-manager'),
      'native installation failed to activate bundle')
    assert.ok(!lockText.includes(path.basename(home)), 'Profile lock contains random Home path')
    assert.ok(!/https?:\/\/[^ \n"']*[@?][^ \n"']*/i.test(lockText),
      'Profile lock contains potentially authenticated registry URL')
    assert.ok(!/([?&](?:token|_auth|key|password)=)/i.test(lockText),
      'Profile lock contains sensitive query argument')

    pkg.resolution.integrity = CANDIDATE_MARKER
    const template = YAML.stringify(lock, { lineWidth: 0, sortMapEntries: true })
    const audit = summarizeProfileLock(lockText, {
      version: VERSION, platform: process.platform,
    })
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(path.join(outputDirectory, 'pnpm-lock.template.yaml'),
      template, { mode: 0o600 })
    await writeFile(path.join(outputDirectory, 'template-provenance.json'),
      JSON.stringify({
        schemaVersion: 1, generatedOn: VERSION,
        generator: 'native dsh plugin add on disposable Profile with vendor-relative candidate',
        candidatePackageLocator: locator,
        candidateIntegrityMarker: CANDIDATE_MARKER,
        reviewedZod: Object.keys(lock.packages).filter(key => key.startsWith('zod@')),
        graphAuditSha256: audit.evidenceSha256,
      }, null, 2) + '\n', { mode: 0o600 })
    return { template, metadata: audit }
  } finally {
    await rm(home, { recursive: true, force: true })
  }
}
