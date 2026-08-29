import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageJsonPath = path.join(root, 'package.json')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

function fromRoot(relativePath) {
  return path.resolve(root, relativePath)
}

test('package manifest points at real build, types, and bundle artifacts', async () => {
  assert.equal(packageJson.type, 'module')
  assert.equal(packageJson.main, './lib/index.js')
  assert.equal(packageJson.types, './lib/index.d.ts')
  assert.equal(packageJson.exports['.'].default, './lib/index.js')
  assert.equal(packageJson.exports['.'].types, './lib/index.d.ts')
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')

  await access(fromRoot(packageJson.main))
  await access(fromRoot(packageJson.types))
  await access(fromRoot(packageJson.dsh.bundle.patch))
})

test('bundle patch inserts only the namespaced context-manager row', async () => {
  const patch = await readFile(fromRoot(packageJson.dsh.bundle.patch), 'utf8')
  assert.match(patch, /^- insert:\s*$/m)
  assert.match(patch, /^\s+- id: dsh-context-manager\s*$/m)
  assert.match(patch, /^\s+name: dsh-context-manager\s*$/m)
  assert.doesNotMatch(patch, /^- id:/m)
})

test('built host entry exposes the Context Manager service contract', async () => {
  const entry = await import(pathToFileURL(fromRoot(packageJson.main)).href)
  assert.equal(entry.name, 'dsh-context-manager')
  assert.equal(typeof entry.apply, 'function')
  assert.equal(typeof entry.ContextManagerService, 'function')
  assert.equal(entry.CONTEXT_MANAGER_SETTINGS_NAMESPACE, 'dsh-context-manager')
})
