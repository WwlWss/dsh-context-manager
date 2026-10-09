import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import semver from 'semver'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const peers = manifest.peerDependencies

const HOST_ALLOWED = Object.freeze(["0.1.1-rc.2","0.1.2-rc.1","0.1.5-rc.1","0.1.5-rc.2","0.1.6-alpha.2"])
const CLIENT_ALLOWED = Object.freeze(["0.1.2-rc.1","0.1.5-rc.1","0.1.5-rc.2","0.1.6-alpha.2"])
const HOST_NAMES = Object.freeze([
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-typert-protocol',
])
const CLIENT_NAMES = Object.freeze([
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-renderer',
])
const DENIED = Object.freeze([
  '0.1.1-rc.3',
  '0.1.2-rc.2',
  '0.1.5-rc.3',
  '0.1.6-alpha.1',
  '0.1.6',
  '0.1.7-rc.2',
  '0.1.7',
  '0.2.0-rc.2',
  '0.2.0',
])
const allNames = [...HOST_NAMES, ...CLIENT_NAMES]

test('DSH peer keys are the audited bounded list', () => {
  const actual = Object.keys(peers).filter(name => name.startsWith('@deepseek-ai/dsh-')).sort()
  assert.deepEqual(actual, [...allNames].sort())
})

for (const [name, allowed] of [
  ...HOST_NAMES.map(name => [name, HOST_ALLOWED]),
  ...CLIENT_NAMES.map(name => [name, CLIENT_ALLOWED]),
]) {
  test(name + ' admits exact retained generations only', () => {
    const range = peers[name]
    assert.equal(typeof range, 'string')
    const tokens = range.split(/\s*\|\|\s*/).sort()
    assert.deepEqual(tokens, [...allowed].sort())
    for (const version of allowed) {
      assert.equal(semver.satisfies(version, range, { includePrerelease: true }), true,
        name + ' unexpectedly rejected ' + version)
    }
    for (const version of DENIED) {
      assert.equal(semver.satisfies(version, range, { includePrerelease: true }), false,
        name + ' admitted unqualified ' + version)
    }
    assert.equal(semver.satisfies('0.1.1-rc.2', range, { includePrerelease: true }),
      HOST_NAMES.includes(name))
  })
}

test('Client peers remain optional and generic runtime peers remain unchanged', () => {
  for (const name of CLIENT_NAMES) assert.equal(manifest.peerDependenciesMeta?.[name]?.optional, true)
  assert.equal(peers['@deepseek-ai/cordis'], '^4.0.1')
  assert.equal(peers['@deepseek-ai/schemastery'], '^3.18.1')
})
