import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const runner = readFileSync(new URL('./m7d/support/run-web.mjs', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n')

test('M7D end-to-end runner must invoke—not only import—critical evidence gates', () => {
  for (const fragment of [
    "import { createBrowserDiagnostics }",
    "import { buildQualificationManifest",
    "import { readCliGraphEvidence }",
    "import { installFrozenWebProfile }",
    "readCliGraphEvidence(",
    "installFrozenWebProfile(",
    "diagnostics.attach(context)",
    "diagnostics.assertNoBlockingErrors()",
    "buildQualificationManifest({",
    "qualification-manifest.json",
  ]) assert.ok(runner.includes(fragment), 'missing integration: ' + fragment)
  assert.match(runner, /await scenario\(contextActions\)[\s\S]*?diagnostics\.assertNoBlockingErrors\(\)[\s\S]*?buildQualificationManifest\(/)
  assert.match(runner, /await rename\(temporaryManifest, manifestPath\)/)
  assert.match(workflow, /node tests\/m7d\/native-add-smoke\.mjs/)
  assert.match(workflow, /M7D_NATIVE_ADD_VERIFIED=true/)
  assert.match(workflow, /frozen-graph-evidence\.json/)
})
test('success and failure evidence uploads include only explicitly selected hidden-directory files', () => {
  const section = workflow.split('      - name: Upload minimal successful qualification evidence')[1]
  assert.ok(section)
  const [success, failure] = section.split('      - name: Upload synthetic browser failure evidence only')
  assert.match(success, /if-no-files-found: error/)
  assert.match(success, /include-hidden-files: true/)
  assert.match(failure, /include-hidden-files: true/)
  assert.doesNotMatch(success, /path: \.artifacts\/\s*$/m)
  assert.doesNotMatch(failure, /path: \.artifacts\/\s*$/m)
})

test('packed browser lanes install the audited YAML parser before Host preflight', () => {
  const browser = workflow.split('\n  m7d-packed-web:\n')[1]
  assert.ok(browser, 'missing real packed-Web qualification job')
  const before = browser.indexOf('Install frozen M7D audit parser')
  const preflight = browser.indexOf('Legacy published DSH bare-Web')
  assert.ok(before > 0 && preflight > before,
    'pinned root YAML parser must be installed before the native DSH control')
  assert.match(browser.slice(before, preflight),
    /pnpm install --ignore-scripts --frozen-lockfile/)
  assert.match(browser, /node tests\/m7d\/packed-browser\.e2e\.mjs/)
})

test('independent repeatability is wired into full qualification on both OSes', () => {
  const repeat = workflow.split('\n  m7d-frozen-repeatability:\n')[1]
  assert.ok(repeat, 'missing frozen Profile repeatability job')
  const beforeFull = repeat.split('\n  full-qualification:\n')[0]
  assert.match(beforeFull, /os: \[ubuntu-latest, windows-latest\]/)
  assert.match(beforeFull, /attempt: \[1, 2\]/)
  assert.match(beforeFull, /node tests\/m7d\/frozen-profile-repeatability\.mjs/)
  assert.match(workflow, /m7d-packed-web, m7d-frozen-repeatability\]/)
})
