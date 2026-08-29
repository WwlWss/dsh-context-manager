import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const runtimeEntry = path.resolve(root, packageJson.main)

test('git-install prepare emits the declared runtime entry', async () => {
  await access(runtimeEntry)
  const entry = await import(pathToFileURL(runtimeEntry).href)
  assert.equal(entry.name, 'dsh-context-manager')
  assert.equal(typeof entry.apply, 'function')
  assert.equal(typeof entry.ContextManagerService, 'function')
})
