import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/** Actual published React Renderer + root SlotCore, not direct component mocks. */
export const PRESET_RENDERER_PROBES = Object.freeze(['R01'])
const entry = fileURLToPath(new URL('../client-profile-drawer-runtime.mjs', import.meta.url))
const failures = []
for (const probe of PRESET_RENDERER_PROBES) {
  process.stdout.write('M8C_PUBLISHED_PRESET_PROBE_BEGIN=' + probe + '\n')
  const result = spawnSync(process.execPath, [entry], {
    cwd: process.cwd(),
    env: { ...process.env, M8C_PRESET_PROBE: probe },
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0 || result.error) {
    failures.push({ probe, status: result.status, error: result.error?.message })
    process.stderr.write('M8C_PUBLISHED_PRESET_PROBE_FAIL=' + probe + '\n')
  } else {
    process.stdout.write('M8C_PUBLISHED_PRESET_PROBE_PASS=' + probe + '\n')
  }
}
process.stdout.write(JSON.stringify({
  status: failures.length === 0 ? 'M8C_PUBLISHED_RENDERER_PASS' : 'M8C_PUBLISHED_RENDERER_FAIL',
  expected: PRESET_RENDERER_PROBES.length,
  passed: PRESET_RENDERER_PROBES.length - failures.length,
  failures,
}) + '\n')
if (failures.length !== 0) process.exitCode = 1
