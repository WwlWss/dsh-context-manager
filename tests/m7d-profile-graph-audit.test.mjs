import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseProfileLock, summarizeProfileLock, diffProfileGraph,
} from './m7d/support/profile-graph-audit.mjs'

const base = [
  "lockfileVersion: '9.0'",
  'settings:',
  '  autoInstallPeers: false',
  '  excludeLinksFromLockfile: false',
  'importers:',
  '  .:',
  '    dependencies:',
  '      zod:',
  '        specifier: ^4.4.3',
  '        version: 4.6.4',
  'packages:',
  '  zod@4.6.4:',
  '    resolution: {integrity: sha512-YWJj}',
  'snapshots:',
  '  zod@4.6.4: {}',
  '',
].join('\n')

const inspect = text => summarizeProfileLock(text, {
  version: '0.1.5-rc.2', platform: 'linux',
})

test('the real pnpm v9 structural parser rejects ambiguous YAML', () => {
  assert.equal(parseProfileLock(base).lockfileVersion, '9.0')
  assert.throws(() => parseProfileLock(base.replace('snapshots:',
    'snapshots:\n  zod@4.6.4: {}\n  zod@4.6.4: {}\n')), /duplicate/)
  assert.throws(() => parseProfileLock(base.replace('lockfileVersion: \'9.0\'',
    "lockfileVersion: '8.0'")), /unsupported/)
  assert.throws(() => parseProfileLock('not: a lockfile\n'), /unsupported/)
})

test('changing a published package version produces package-level drift evidence', () => {
  const current = inspect(base)
  const changed = inspect(base.replaceAll('4.6.4', '4.6.5'))
  const diff = diffProfileGraph(current, changed)
  assert.ok(diff.changes.some(change => change.kind === 'dependency-drift' &&
    change.section === 'packages'))
  assert.notEqual(current.evidenceSha256, changed.evidenceSha256)
  assert.equal(diff.before, current.evidenceSha256)
})

test('changing package integrity is distinct from a version change', () => {
  const diff = diffProfileGraph(inspect(base),
    inspect(base.replace('sha512-YWJj', 'sha512-ZGVm')))
  assert.ok(diff.changes.some(change => change.kind === 'integrity-drift'))
})

test('summary is deterministic and redacts private paths and tokenized registry URLs', () => {
  const secret = 'https://user:password@registry.example.com/tarball.tgz?token=private'
  const withSource = base.replace('resolution: {integrity: sha512-YWJj}',
    'resolution: {integrity: sha512-YWJj, tarball: "' + secret + '"}')
  const record = inspect(withSource)
  assert.equal(record.evidenceSha256, inspect(withSource).evidenceSha256)
  assert.equal(JSON.stringify(record).includes('password'), false)
  assert.equal(JSON.stringify(record).includes('private'), false)
  assert.match(JSON.stringify(record), /sourceSha256/)
})

test('semantic comparison is independent of YAML map order or LF/CRLF', () => {
  const reordered = base
    .replace('  autoInstallPeers: false\n  excludeLinksFromLockfile: false',
      '  excludeLinksFromLockfile: false\n  autoInstallPeers: false')
    .replace(/\n/g, '\r\n')
  assert.equal(inspect(base).evidenceSha256, inspect(reordered).evidenceSha256)
  assert.deepEqual(diffProfileGraph(inspect(base), inspect(reordered)).changes, [])
})
