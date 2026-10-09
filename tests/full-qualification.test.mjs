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
