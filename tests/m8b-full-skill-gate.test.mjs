import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

// F01-SR5 / M8B: a passing protected Full must actually execute the
// published Skill Editor interaction probes. The historical default Drawer
// script does NOT enter its M8B_SKILL_PROBE branch without this runner.
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8')
const client = workflow.split('\n  client-presentation-contract:\n')[1]?.split('\n  package:\n')[0]
const full = workflow.split('\n  full-qualification:\n')[1]

test('M8B full qualification requires real Skill Renderer probes in the existing Client matrix', () => {
  assert.ok(client, 'the protected four-generation Client Renderer job must exist')
  assert.match(client,
    /name:\s*Execute M8B real Skill Renderer qualification\s*\n\s*run:\s*node \.\/tests\/m8b\/run-skill-renderer-probes\.mjs/,
    'historical Profile-only Drawer invocation cannot qualify Skill R01-R15')
})

test('M8B preserves every retained Published Client generation and the historical Drawer step', () => {
  assert.ok(client)
  assert.match(client,
    /version:\s*\[0\.1\.2-rc\.1,\s*0\.1\.5-rc\.1,\s*0\.1\.5-rc\.2,\s*0\.1\.6-alpha\.2\]/)
  assert.match(client, /run:\s*node \.\/tests\/client-profile-drawer-runtime\.mjs/)
})

test('M8B full check still depends on the original Client qualification group', () => {
  assert.ok(full)
  assert.match(full, /needs:\s*\[[^\]]*client-presentation-contract[^\]]*\]/)
})
