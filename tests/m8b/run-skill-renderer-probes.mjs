import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** One canonical, ordered M8B real Published Renderer case inventory.
 * Each case runs in its own fresh Node process and freshly hydrated DSH
 * root Store/Business Face. Reuse this runner from the protected four-
 * generation Client matrix AND the temporary Draft-only two-generation CI.
 * No fake Renderer, no skipped tests, and no contribution to Host writes. */
export const SKILL_RENDERER_PROBES = Object.freeze([
  'R01', 'R02', 'R03', 'R04', 'R05',
  'R06V', 'R06H', 'R07', 'R08', 'R08U', 'R09', 'R10',
  'R11P', 'R11B', 'R11R', 'R11T', 'R11TR',
  'R12S', 'R12P', 'R12B', 'R12R',
])

if (SKILL_RENDERER_PROBES.length !== 21
  || new Set(SKILL_RENDERER_PROBES).size !== SKILL_RENDERER_PROBES.length) {
  throw new Error('Published Skill Renderer probe inventory must have 21 distinct cases')
}

const entry = fileURLToPath(new URL('../client-profile-drawer-runtime.mjs', import.meta.url))
const failures = []
for (const probe of SKILL_RENDERER_PROBES) {
  process.stdout.write('M8B_PUBLISHED_SKILL_PROBE_BEGIN=' + probe + '\n')
  const result = spawnSync(process.execPath, [entry], {
    cwd: process.cwd(),
    env: { ...process.env, M8B_SKILL_PROBE: probe },
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0 || result.error) {
    failures.push({ probe, exitStatus: result.status, error: result.error?.message })
    process.stderr.write('M8B_PUBLISHED_SKILL_PROBE_FAIL=' + probe + '\n')
  } else {
    process.stdout.write('M8B_PUBLISHED_SKILL_PROBE_PASS=' + probe + '\n')
  }
}
process.stdout.write(JSON.stringify({
  status: failures.length === 0 ? 'M8B_PUBLISHED_RENDERER_FULL_PASS' : 'M8B_PUBLISHED_RENDERER_FULL_FAIL',
  expected: SKILL_RENDERER_PROBES.length,
  passed: SKILL_RENDERER_PROBES.length - failures.length,
  failures,
}) + '\n')
if (failures.length !== 0) process.exitCode = 1
