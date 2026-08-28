import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const packageJsonPath = path.join(root, 'package.json')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

function fromRoot(relativePath) {
  return path.resolve(root, relativePath)
}

test('package manifest points at real build and bundle artifacts', async () => {
  assert.equal(packageJson.type, 'module')
  assert.equal(packageJson.main, './lib/index.js')
  assert.equal(packageJson.exports['.'], './lib/index.js')
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')

  await access(fromRoot(packageJson.main))
  await access(fromRoot(packageJson.dsh.bundle.patch))
})

test('bundle patch inserts only the namespaced context-manager row', async () => {
  const patch = await readFile(fromRoot(packageJson.dsh.bundle.patch), 'utf8')
  assert.match(patch, /^- insert:\s*$/m)
  assert.match(patch, /^\s+- id: dsh-context-manager\s*$/m)
  assert.match(patch, /^\s+name: dsh-context-manager\s*$/m)
  assert.doesNotMatch(patch, /^- id:/m)
})

test('built host entry has the expected Cordis plugin shape', async () => {
  const entry = await import(pathToFileURL(fromRoot(packageJson.main)).href)
  assert.equal(entry.name, 'dsh-context-manager')
  assert.equal(typeof entry.apply, 'function')

  const messages = []
  const ctx = {
    logger(name) {
      assert.equal(name, 'dsh-context-manager')
      return {
        info(message) {
          messages.push(message)
        },
      }
    },
  }

  entry.apply(ctx)
  assert.deepEqual(messages, ['Context Manager loaded (scaffold mode)'])
})
