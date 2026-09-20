import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const runtimeEntry = path.resolve(root, packageJson.main)

test('git-install prepare emits the declared runtime and Typert entries', async () => {
  await access(runtimeEntry)
  const entry = await import(pathToFileURL(runtimeEntry).href)
  assert.equal(entry.name, 'dsh-context-manager')
  assert.equal(typeof entry.apply, 'function')
  assert.equal(typeof entry.ContextManagerService, 'function')
  assert.equal(typeof entry.ContextManagerRemoteController, 'function')

  for (const subpath of ['./typert', './remote']) {
    const declaration = packageJson.exports[subpath]
    assert.equal(typeof declaration?.default, 'string')
    assert.equal(typeof declaration?.types, 'string')
    await access(path.resolve(root, declaration.default))
    await access(path.resolve(root, declaration.types))
  }

  const host = await import(pathToFileURL(path.resolve(root, packageJson.exports['./typert'].default)).href)
  const remote = await import(pathToFileURL(path.resolve(root, packageJson.exports['./remote'].default)).href)
  assert.equal(host.TYPERT.package, 'dsh-context-manager')
  assert.equal(remote.TYPERT_REMOTE.package, 'dsh-context-manager')
})
