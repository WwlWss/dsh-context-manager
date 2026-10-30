import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const verifier = fileURLToPath(new URL('../scripts/verify-m8b-b0-evidence.mjs', import.meta.url))
const head = 'a'.repeat(40)
const base = '5a21df1b5f27fbcc22cdb389de3c1d765b96a95d'
const hosts = ['0.1.1-rc.2', '0.1.2-rc.1', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.2']
const clients = hosts.slice(1)

function ids(lane) {
  return lane === 'host'
    ? [...Array.from({ length: 13 }, (_, i) => 'H' + String(i + 1).padStart(2, '0')),
      ...Array.from({ length: 6 }, (_, i) => 'R' + String(i + 1).padStart(2, '0'))]
    : ['C01', 'C02', 'C03']
}

function manifest(lane, version) {
  return {
    schemaVersion: 1, status: 'pass', lane, version,
    baseSha: base, testHeadSha: head,
    assertionIds: ids(lane),
    packages: {
      [lane === 'host' ? '@deepseek-ai/dsh-settings' : '@deepseek-ai/dsh-client-ui-renderer']: version,
    },
  }
}

async function makeFixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'm8b-b0-evidence-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const paths = new Map()
  for (const [lane, versions] of [['host', hosts], ['client', clients]]) {
    for (const version of versions) {
      const name = lane + '-' + version
      const folder = path.join(dir, 'm8b-b0-evidence-' + name)
      await mkdir(folder)
      const file = path.join(folder, name + '.json')
      await writeFile(file, JSON.stringify(manifest(lane, version)) + '\n')
      paths.set(name, file)
    }
  }
  return { dir, paths }
}

function check(dir, env = {}) {
  return spawnSync(process.execPath, [verifier, 'verify', dir, head], {
    encoding: 'utf8',
    env: {
      ...process.env,
      M8B_B0_BUILD_RESULT: 'success',
      M8B_B0_HOST_RESULT: 'success',
      M8B_B0_CLIENT_RESULT: 'success',
      ...env,
    },
  })
}

test('M8B B0 evidence: exactly nine complete published-generation manifests qualify', async t => {
  const { dir } = await makeFixture(t)
  const run = check(dir)
  assert.equal(run.status, 0, run.stdout + run.stderr)
  assert.ok(run.stdout.includes('"lanes":9'))
  assert.ok(run.stdout.includes('"assertions":107'),
    '5*19 Host/Remote plus 4*3 Client assertions must be observed')
})

test('M8B B0 evidence rejects missing/duplicate/wrong-HEAD and incomplete assertion sets', async t => {
  const { dir, paths } = await makeFixture(t)
  const first = paths.get('host-0.1.1-rc.2')
  const original = JSON.parse(await readFile(first, 'utf8'))
  const broken = { ...original, assertionIds: original.assertionIds.slice(1) }
  await writeFile(first, JSON.stringify(broken))
  let run = check(dir)
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /missing|expected/)

  await writeFile(first, JSON.stringify(original))
  const wrongHead = { ...original, testHeadSha: 'b'.repeat(40) }
  await writeFile(first, JSON.stringify(wrongHead))
  run = check(dir)
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /source SHA/)
  await writeFile(first, JSON.stringify(original))

  const other = path.join(dir, 'm8b-b0-evidence-duplicate.json')
  await writeFile(other, JSON.stringify(original))
  run = check(dir)
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /exactly 9/)
  await rm(other)

  const missing = paths.get('client-0.1.2-rc.1')
  await rm(missing)
  run = check(dir)
  assert.notEqual(run.status, 0)
  assert.match(run.stderr, /exactly 9/)
})

test('M8B B0 evidence denies skipped/failing producers even when all manifests exist', async t => {
  const { dir } = await makeFixture(t)
  for (const env of [
    { M8B_B0_BUILD_RESULT: 'failure' },
    { M8B_B0_HOST_RESULT: 'skipped' },
    { M8B_B0_CLIENT_RESULT: 'cancelled' },
  ]) {
    const run = check(dir, env)
    assert.notEqual(run.status, 0)
    assert.match(run.stderr, /job result not success/)
  }
})
