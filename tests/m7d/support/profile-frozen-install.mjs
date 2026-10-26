import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseProfileLock } from './profile-graph-audit.mjs'
import {
  renderApprovedProfileLock, canonicalizeExternalGraph,
  assertApprovedExternalGraph, verifyInstalledCandidatePackage,
} from './profile-graph-normalize.mjs'
import { cliInvocation } from './contracts.mjs'

const NAME = 'dsh-context-manager'
const INSTALL_TIMEOUT_MS = 240_000

async function writeJsonAtomic(file, object) {
  const tmp = file + '.m7d-tmp'
  await writeFile(tmp, JSON.stringify(object, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, file)
}

/**
 * Materialize an already reviewed external graph, with the sole variable
 * field filled from the verified candidate archive. Never resolve an
 * arbitrary registry range during the qualifying install.
 */
export async function installFrozenWebProfile({
  home, profile, tarball, version, env, cwd, runCommand, evidenceDir,
  baselinePath = path.join(process.cwd(),
    'tests', 'm7d', 'profile-locks', 'external-graph-baseline.json'),
  templatePath = path.join(process.cwd(),
    'tests', 'm7d', 'profile-locks', 'pnpm-lock.template.yaml'),
}) {
  assert.equal(profile, 'web', 'only the published Web Profile is qualified')
  const archive = await readFile(tarball)
  const tarballName = path.basename(tarball)
  const template = await readFile(templatePath, 'utf8')
  const reviewed = JSON.parse(await readFile(baselinePath, 'utf8'))
  const rendered = renderApprovedProfileLock(template, tarballName, archive)
  assertApprovedExternalGraph(reviewed, rendered)

  const dir = path.join(home, 'profiles', profile)
  const vendor = path.join(dir, 'vendor')
  await mkdir(vendor, { recursive: true })
  await copyFile(tarball, path.join(vendor, tarballName))
  const copied = await readFile(path.join(vendor, tarballName))
  assert.equal(createHash('sha256').update(copied).digest('hex'),
    rendered.candidateSha256, 'Profile vendored candidate bytes changed')

  const manifestFile = path.join(dir, 'package.json')
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  assert.equal(manifest.dependencies?.[NAME], undefined,
    'frozen qualification must start from a pristine published Web Profile')
  const lock = parseProfileLock(rendered.lockText)
  const dependency = lock.importers['.'].dependencies[NAME].specifier
  const bundles = manifest.dsh?.profile?.bundles
  assert.ok(Array.isArray(bundles), 'shipped profile lacks Bundle selection metadata')
  assert.ok(!bundles.includes(NAME), 'candidate already enabled before qualification')
  manifest.dependencies = { ...manifest.dependencies, [NAME]: dependency }
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh.profile,
    bundles: [...bundles, NAME] } }
  verifyInstalledCandidatePackage(manifest, lock, tarballName)
  await writeJsonAtomic(manifestFile, manifest)
  const lockFile = path.join(dir, 'pnpm-lock.yaml')
  await writeFile(lockFile, rendered.lockText, { mode: 0o600 })

  // This is the public DSH CLI pnpm-forwarding contract. No private DSH
  // package-manager internals are patched, and no dynamic "add" runs here.
  await runCommand(cliInvocation(version,
    ['plugin', '--profile', profile, 'install', '--frozen-lockfile',
      '--ignore-scripts']), env, cwd, INSTALL_TIMEOUT_MS)
  const afterLock = await readFile(lockFile, 'utf8')
  assert.equal(afterLock, rendered.lockText,
    'frozen installation unexpectedly rewrote the approved Profile lock')
  const afterManifest = JSON.parse(await readFile(manifestFile, 'utf8'))
  verifyInstalledCandidatePackage(afterManifest, parseProfileLock(afterLock), tarballName)
  const installed = JSON.parse(await readFile(
    path.join(dir, 'node_modules', NAME, 'package.json'), 'utf8'))
  assert.equal(installed.name, NAME, 'bundled candidate is absent from installed Profile')
  assert.ok(typeof installed.dsh?.bundle?.patch === 'string',
    'installed candidate does not expose a DSH Bundle layer')

  const afterGraph = canonicalizeExternalGraph(afterLock, tarballName, copied)
  assertApprovedExternalGraph(reviewed, afterGraph)
  if (evidenceDir) {
    await writeFile(path.join(evidenceDir, 'frozen-graph-evidence.json'),
      JSON.stringify({
        schemaVersion: 1, installation: 'frozen-public-dsh-plugin-install',
        dshVersion: version, candidateSha256: afterGraph.candidateSha256,
        externalGraphSha256: afterGraph.graphSha256, candidateIntegrityVerified: true,
        installedBundle: NAME,
      }, null, 2) + '\n', { mode: 0o600 })
  }
  return {
    profileGraphSha256: afterGraph.graphSha256,
    candidateSha256: afterGraph.candidateSha256,
    installedBundle: NAME,
  }
}
