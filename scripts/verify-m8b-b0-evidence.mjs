#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE_SHA = '5a21df1b5f27fbcc22cdb389de3c1d765b96a95d'
const HOST_VERSIONS = ['0.1.1-rc.2', '0.1.2-rc.1', '0.1.5-rc.1', '0.1.5-rc.2', '0.1.6-alpha.2']
const CLIENT_VERSIONS = HOST_VERSIONS.slice(1)
const HOST_IDS = Array.from({ length: 13 }, (_, i) => 'H' + String(i + 1).padStart(2, '0'))
const GATEWAY_IDS = Array.from({ length: 6 }, (_, i) => 'R' + String(i + 1).padStart(2, '0'))
const CLIENT_IDS = ['C01', 'C02', 'C03']

function fail(message) {
  throw new Error('M8B B0 evidence invalid: ' + message)
}

function assertSha(sha, label) {
  if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) fail(label + ' must be full commit SHA')
}

function expectedIds(lane) {
  return lane === 'host' ? [...HOST_IDS, ...GATEWAY_IDS]
    : lane === 'client' ? [...CLIENT_IDS] : fail('unknown lane ' + lane)
}

function expectedVersion(lane, version) {
  if (!(lane === 'host' ? HOST_VERSIONS : CLIENT_VERSIONS).includes(version)) {
    fail('unapproved published ' + lane + ' version ' + version)
  }
}

function assertAllIds(actual, lane, label) {
  const required = expectedIds(lane)
  if (!Array.isArray(actual)) fail(label + ': missing assertion list')
  if (actual.length !== required.length) fail(label + ': expected ' + required.length + ' assertions, got ' + actual.length)
  if (new Set(actual).size !== actual.length) fail(label + ': repeated assertion ID')
  for (const id of required) if (!actual.includes(id)) fail(label + ': missing ' + id)
  for (const id of actual) if (!required.includes(id)) fail(label + ': unexpected ' + id)
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) fail('missing environment variable ' + name)
  return value
}

async function installedVersion(pkg) {
  const obj = JSON.parse(await readFile(path.resolve('node_modules', pkg, 'package.json'), 'utf8'))
  return obj.version
}

async function emit(lane, version, logPath, output) {
  expectedVersion(lane, version)
  const sha = requireEnv('M8B_B0_TEST_HEAD')
  assertSha(sha, 'test HEAD')
  const log = await readFile(logPath, 'utf8')
  const ids = []
  for (const line of log.split(/\r?\n/)) {
    const needle = 'M8B_B0_ASSERT '
    const i = line.indexOf(needle)
    if (i < 0) continue
    let parsed
    try { parsed = JSON.parse(line.slice(i + needle.length)) }
    catch { fail('malformed marker in ' + logPath) }
    if (parsed.outcome !== 'pass' || typeof parsed.id !== 'string') {
      fail('assertion failed/unknown: ' + JSON.stringify(parsed))
    }
    ids.push(parsed.id)
  }
  assertAllIds(ids, lane, logPath)

  const packages = {}
  if (lane === 'host') {
    for (const name of [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/dsh-typert-registry',
      '@deepseek-ai/dsh-api-gateway',
      '@deepseek-ai/dsh-skill',
      '@deepseek-ai/dsh-scope',
    ]) packages[name] = await installedVersion(name)
    for (const name of [
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/dsh-typert-registry',
      '@deepseek-ai/dsh-api-gateway',
      '@deepseek-ai/dsh-skill',
      '@deepseek-ai/dsh-scope',
    ]) {
      if (packages[name] !== version) fail(name + ' actual version ' + packages[name] + ' differs from lane ' + version)
    }
  } else {
    for (const name of [
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-client-ui-layout',
      '@types/react', 'react', 'react-dom', 'react-test-renderer',
    ]) packages[name] = await installedVersion(name)
    for (const name of [
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-locale',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-renderer',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-client-ui-layout',
    ]) {
      if (packages[name] !== version) fail(name + ' actual version ' + packages[name] + ' differs from lane ' + version)
    }
    if (packages.react !== '18.3.1') fail('React version mismatch')
  }
  const result = {
    schemaVersion: 1,
    status: 'pass',
    lane,
    version,
    baseSha: BASE_SHA,
    testHeadSha: sha,
    assertionIds: [...ids].sort(),
    packages,
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, JSON.stringify(result, null, 2) + '\n')
  console.log('M8B_B0_EVIDENCE_PASS ' + JSON.stringify({
    lane, version, testHeadSha: sha, assertions: ids.length,
  }))
}

async function walk(dir) {
  const all = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) all.push(...await walk(file))
    else if (entry.isFile()) all.push(file)
    else fail('non-regular artifact: ' + file)
  }
  return all
}

async function verify(root, expectedHead) {
  assertSha(expectedHead, 'expected HEAD')
  for (const [label, name] of [
    ['build producer', 'M8B_B0_BUILD_RESULT'],
    ['five-version Host', 'M8B_B0_HOST_RESULT'],
    ['four-version Client', 'M8B_B0_CLIENT_RESULT'],
  ]) {
    if (requireEnv(name) !== 'success') fail(label + ' job result not success')
  }
  const files = await walk(root)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  // A lane creates exactly one JSON; any unexpected file or duplicate is an error.
  if (files.length !== 9 || jsonFiles.length !== 9) {
    fail('expected exactly 9 JSON manifests, saw ' + files.length + ' total / ' + jsonFiles.length + ' JSON')
  }

  const seen = new Set()
  const summary = []
  for (const file of jsonFiles) {
    const item = JSON.parse(await readFile(file, 'utf8'))
    if (item.schemaVersion !== 1 || item.status !== 'pass') fail('invalid manifest schema/status: ' + file)
    expectedVersion(item.lane, item.version)
    const id = item.lane + '-' + item.version
    if (seen.has(id)) fail('duplicate lane/version ' + id)
    seen.add(id)
    if (item.testHeadSha !== expectedHead || item.baseSha !== BASE_SHA) {
      fail('unexpected source SHA for ' + id)
    }
    assertAllIds(item.assertionIds, item.lane, id)
    if (!item.packages || typeof item.packages !== 'object') fail('missing published packages for ' + id)
    const publishedName = item.lane === 'host'
      ? '@deepseek-ai/dsh-settings' : '@deepseek-ai/dsh-client-ui-renderer'
    if (item.packages[publishedName] !== item.version) fail('installed version mismatch for ' + id)
    summary.push({ lane: item.lane, version: item.version, assertions: item.assertionIds.length })
  }
  for (const version of HOST_VERSIONS) if (!seen.has('host-' + version)) fail('missing host ' + version)
  for (const version of CLIENT_VERSIONS) if (!seen.has('client-' + version)) fail('missing client ' + version)
  summary.sort((a, b) => (a.lane + a.version).localeCompare(b.lane + b.version))
  console.log('M8B_B0_FULL_PREFLIGHT_PASS ' + JSON.stringify({
    testHeadSha: expectedHead, baselineSha: BASE_SHA,
    lanes: summary.length, hostLanes: HOST_VERSIONS.length,
    clientLanes: CLIENT_VERSIONS.length, assertions: summary.reduce((a, b) => a + b.assertions, 0),
    summary,
  }))
}

const [mode, ...args] = process.argv.slice(2)
try {
  if (mode === 'emit' && args.length === 4) await emit(...args)
  else if (mode === 'verify' && args.length === 2) await verify(...args)
  else fail('usage: emit <host|client> <version> <logPath> <manifestPath> | verify <directory> <expectedHeadSha>')
} catch (error) {
  console.error('M8B_B0_EVIDENCE_FAIL ' + (error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
}
