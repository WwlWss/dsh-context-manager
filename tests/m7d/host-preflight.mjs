import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  initializeWebProfileArgs, installArgs, qualifyVersion, redactDiagnostic,
} from './support/contracts.mjs'
import { createOwnedWebProfilePatch } from './support/profile-patch.mjs'
import { isolatedEnv, runCommand, startWeb, stopProcess } from './support/run-web.mjs'

/** Control groups A/B (bare Web) and C/D (same Web with the exact candidate). */
async function probe({ version, tarball, name, installed, explicitHmr }) {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-control-'))
  const env = isolatedEnv(home)
  let web
  try {
    await runCommand(initializeWebProfileArgs(version, 'web'), env, process.cwd(), 240_000)
    if (installed) {
      assert.ok(tarball && tarball.endsWith('.tgz'))
      await runCommand(installArgs(version, 'web', tarball), env, process.cwd(), 240_000)
    }
    const patch = await createOwnedWebProfilePatch(home)
    if (explicitHmr) await patch.setLegacyHmrEnabled(true)
    web = await startWeb(version, 'web', env, process.cwd())
    // Observe the live Host beyond its initial HTTP response; an async
    // post-boot watcher may still exit immediately afterward.
    await new Promise(resolve => setTimeout(resolve, 1500))
    web.assertAlive()
    return { name, installed, explicitHmr, status: 'passed' }
  } catch (error) {
    return {
      name, installed, explicitHmr, status: 'failed',
      diagnostic: redactDiagnostic(error?.message || String(error)).slice(-5000),
      ...(web ? { hostTail: web.getOutput().slice(-3500) } : {}),
    }
  } finally {
    await stopProcess(web?.child)
    await rm(home, { recursive: true, force: true })
  }
}

const version = qualifyVersion(process.env.M7D_DSH_VERSION)
assert.notEqual(version, '0.1.6-alpha.2',
  'the 0.1.6 generation uses a different built-in Host HMR provider')
const tarball = process.env.M7D_TARBALL && path.resolve(process.env.M7D_TARBALL)
const output = path.resolve(process.env.M7D_OUTPUT_DIR || '.artifacts/m7d-evidence')
await mkdir(output, { recursive: true })
const expanded = process.env.M7D_EXPANDED_PREFLIGHT === 'true'
const cases = [
  { name: 'A: bare-default', installed: false, explicitHmr: false },
  { name: 'B: bare-explicit-hmr', installed: false, explicitHmr: true },
  ...(expanded ? [
    { name: 'C: packed-default', installed: true, explicitHmr: false },
    { name: 'D: packed-explicit-hmr', installed: true, explicitHmr: true },
  ] : []),
]
const results = []
try {
  for (const item of cases) {
    console.log('M7D preflight ' + version + ': ' + item.name)
    results.push(await probe({ ...item, version, tarball }))
    console.log('M7D preflight result ' + item.name + ': ' + results.at(-1).status)
  }
} finally {
  await writeFile(path.join(output, 'host-preflight.json'),
    JSON.stringify({ version, expanded, results }, null, 2) + '\n')
}
const required = results.filter(item =>
  item.explicitHmr && (item.name.startsWith('B:') || item.name.startsWith('D:')))
if (required.some(item => item.status !== 'passed')) {
  const bad = required.filter(item => item.status !== 'passed')
  throw new Error('M7D legacy published Host failed with explicit HMR: ' +
    bad.map(item => item.name + ': ' + item.diagnostic).join('\n'))
}
console.log('M7D: explicit-HMR Host controls passed; default controls remain separately recorded.')
