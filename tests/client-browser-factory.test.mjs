import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))

test('built Client factory materializes in a browser realm with no Node globals', async () => {
  // new Function('window', source) inherits Node's process and hid the
  // bundled Immer bug. Run both registration and the factory in an isolated VM.
  const clientPath = process.env.M7D_CLIENT_PATH
    ? path.resolve(process.env.M7D_CLIENT_PATH)
    : path.join(root, 'lib/client.js')
  const source = await readFile(clientPath, 'utf8')
  let registration
  const sandbox = {
    window: { __ModuleLoader__: { load(value) { registration = value } } },
  }
  for (const name of ['process', 'Buffer', 'require']) {
    assert.equal(runInNewContext('typeof ' + name, sandbox), 'undefined')
  }

  runInNewContext(source, sandbox, { filename: 'packed-client.js', timeout: 10_000 })
  assert.equal(registration?.id, 'dsh-context-manager')
  assert.equal(typeof registration.factory, 'function')
  const plugin = registration.factory(specifier => {
    assert.equal(specifier, 'react')
    return { createElement() { return null } }
  })
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(Array.from(plugin.inject), ['remote', 'slots', 'locale'])
})
