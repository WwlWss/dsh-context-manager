import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('M6A package build publishes strict dual-shape Typert artifacts', async () => {
  const [host, remote] = await Promise.all([
    readFile(new URL('../lib/typert.host.js', import.meta.url), 'utf8'),
    readFile(new URL('../lib/typert.remote-client.js', import.meta.url), 'utf8'),
  ])

  assert.match(host, /contextManager/)
  assert.match(host, /protocol/)
  assert.match(host, /schema:/)
  assert.match(host, /create:/)

  assert.match(remote, /namespace: ['"]contextManager['"]/)
  assert.match(remote, /method: ['"]protocol['"]/)
  assert.match(remote, /mode: ['"]strict['"]/)
  assert.match(remote, /schema:/)
  assert.match(remote, /create:/)
})
