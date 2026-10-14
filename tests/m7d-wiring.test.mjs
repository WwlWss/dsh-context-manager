import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const runner = readFileSync(new URL('./m7d/support/run-web.mjs', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')

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
