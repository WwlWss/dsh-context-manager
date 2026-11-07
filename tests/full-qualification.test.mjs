import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { assessFullQualification, REQUIRED_FULL_JOB_IDS } from '../scripts/verify-full-qualification.mjs'

function successGraph() {
  return Object.fromEntries(REQUIRED_FULL_JOB_IDS.map(id => [id, { result: 'success' }]))
}

test('requires the entire Full CI dependency graph to succeed', () => {
  const result = assessFullQualification(successGraph())
  assert.equal(result.ok, true)
  assert.deepEqual(result.missing, [])
  assert.deepEqual(result.unexpected, [])
  assert.deepEqual(result.unsuccessful, [])
})

for (const status of ['failure', 'skipped', 'cancelled', 'neutral', 'in_progress']) {
  test('rejects a ' + status + ' upstream job', () => {
    const graph = successGraph()
    graph['dsh-smoke'] = { result: status }
    const result = assessFullQualification(graph)
    assert.equal(result.ok, false)
    assert.deepEqual(result.unsuccessful, [{ job: 'dsh-smoke', result: status }])
  })
}

test('rejects missing or unexpected dependency jobs', () => {
  const missing = successGraph()
  delete missing['remote-foundation-artifact']
  assert.deepEqual(assessFullQualification(missing).missing, ['remote-foundation-artifact'])
  assert.equal(assessFullQualification(missing).ok, false)
  const unexpected = { ...successGraph(), 'unreviewed-job': { result: 'success' } }
  assert.deepEqual(assessFullQualification(unexpected).unexpected, ['unreviewed-job'])
  assert.equal(assessFullQualification(unexpected).ok, false)
})

test('rejects missing result and non-object input', () => {
  const graph = successGraph()
  graph.package = {}
  assert.equal(assessFullQualification(graph).ok, false)
  assert.equal(assessFullQualification(null).ok, false)
  assert.equal(assessFullQualification([]).ok, false)
})

test('CI aggregation has exactly the reviewed dependencies and always executes', () => {
  const yaml = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const parts = yaml.split('\n  full-qualification:\n')
  assert.equal(parts.length, 2)
  const needs = parts[1].match(/^    needs: \[([^\]\r\n]+)\]/m)
  assert.ok(needs)
  assert.deepEqual(needs[1].split(',').map(x => x.trim()), [...REQUIRED_FULL_JOB_IDS])
  assert.match(parts[1], /always\(\)/)
  assert.match(parts[1], /node \.\/scripts\/verify-full-qualification\.mjs/)
  assert.match(yaml, /types: \[opened, synchronize, reopened, ready_for_review\]/)
})


function jobBlock(yaml, id, next) {
  const from = '\n  ' + id + ':\n'
  const parts = yaml.split(from)
  assert.equal(parts.length, 2, 'expected exactly one '+id+' CI job')
  return next ? parts[1].split('\n  '+next+':\n')[0] : parts[1]
}

test('M8C Fix B RED: Linux M7D Chromium runners stay pinned and expanded preflight stays active', () => {
  const yaml=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n')
  const job=jobBlock(yaml,'m7d-packed-web','m7d-frozen-repeatability')
  const linux=job.split('\n').filter(line=>/^- \{ os: ubuntu|^\s+- \{ os: ubuntu/.test(line)).map(x=>x.trim())
  assert.deepEqual(linux, [
    '- { os: ubuntu-24.04, version: 0.1.2-rc.1 }',
    '- { os: ubuntu-24.04, version: 0.1.5-rc.1 }',
    '- { os: ubuntu-24.04, version: 0.1.5-rc.2 }',
    '- { os: ubuntu-24.04, version: 0.1.6-alpha.2 }',
  ],'all four Linux Chromium runners require the Playwright-supported OS')
  assert.match(job,/os: windows-latest, version: 0\.1\.5-rc\.2/)
  assert.match(job,/M7D_EXPANDED_PREFLIGHT: \$\{\{ runner\.os == 'Linux' && matrix\.version == '0\.1\.5-rc\.2' \}\}/)
  assert.match(job,/pnpm exec playwright install --with-deps chromium/)
  assert.match(job,/run: node tests\/m7d\/packed-browser\.e2e\.mjs/)
})

test('M8C Fix C RED: real four-version AUTH is mandatory inside packed Full before qualification evidence', () => {
  const yaml=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n')
  const job=jobBlock(yaml,'m7d-packed-web','m7d-frozen-repeatability')
  const packed=job.indexOf('run: node tests/m7d/packed-browser.e2e.mjs')
  const auth=job.indexOf('bash tests/m8c/qualify-browser-native-auth.sh')
  const evidence=job.indexOf('name: Upload minimal successful qualification evidence')
  assert.ok(packed>=0,'original packed Chromium E2E must remain')
  assert.ok(auth>packed && auth<evidence,'AUTH must run after packed E2E, before success evidence upload')
  assert.match(job.slice(packed,auth+95),/if: \$\{\{ runner\.os == 'Linux' \}\}/)
  assert.doesNotMatch(job.slice(packed,auth+95),/continue-on-error:\s*true/)
  assert.match(yaml,/needs: \[[^\]\n]*m7d-packed-web[^\]\n]*\]/)
  const broken=successGraph()
  broken['m7d-packed-web']={result:'failure'}
  assert.equal(assessFullQualification(broken).ok,false,'failed AUTH-bearing Full job must fail protected aggregate')
})

test('M8C Fix C RED: standalone AUTH retains PR and main checks through one shared native proof script', () => {
  const yaml=readFileSync(new URL('../.github/workflows/m8c-auth-browser.yml',import.meta.url),'utf8').replace(/\r\n/g,'\n')
  assert.match(yaml,/  push:\n    branches:\n      - main\n/)
  assert.match(yaml,/  pull_request:\n    types: \[opened, synchronize, reopened, ready_for_review\]/)
  assert.match(yaml,/version: \[0\.1\.2-rc\.1, 0\.1\.5-rc\.1, 0\.1\.5-rc\.2, 0\.1\.6-alpha\.2\]/)
  assert.match(yaml,/bash tests\/m8c\/qualify-browser-native-auth\.sh/)
  const script=readFileSync(new URL('./m8c/qualify-browser-native-auth.sh',import.meta.url),'utf8')
  assert.match(script,/authenticated-native-preset-browser\.mjs/)
  assert.match(script,/0\.1\.2-rc\.1.*0\.1\.5-rc\.1.*0\.1\.5-rc\.2.*0\.1\.6-alpha\.2/s)
  assert.doesNotMatch(script,/--no-verify|continue-on-error/)
})
