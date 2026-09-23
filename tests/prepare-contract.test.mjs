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
  assert.equal(typeof entry.ContextManagerRemoteService, 'function')

  for (const subpath of ['./typert', './remote', './client']) {
    const contract = packageJson.exports[subpath]
    await access(path.resolve(root, contract.default))
    await access(path.resolve(root, contract.types))
  }
  await access(path.resolve(root, './lib/client.js.map'))
  const remote = await import(pathToFileURL(path.resolve(root, packageJson.exports['./remote'].default)).href)
  assert.equal(remote.TYPERT_REMOTE.package, 'dsh-context-manager')
  assert.equal(remote.TYPERT_REMOTE.descriptors.length, 31)
  assert.deepEqual(
    remote.TYPERT_REMOTE.descriptors.map(item => item.method).sort(),
    [
      'addPromptBinding',
      'changes',
      'copyPreset',
      'createProfile',
      'createPromptResource',
      'deleteProfile',
      'deletePromptResource',
      'getPromptResource',
      'inspectPinnedSkillRuntime',
      'inspectPromptRuntime',
      'inspectSkillRuntime',
      'listPromptResources',
      'presets',
      'profiles',
      'promptPlacement',
      'protocol',
      'readPreset',
      'removePreset',
      'removePromptBinding',
      'removeSkillBinding',
      'replacePromptResource',
      'sessionPreset',
      'setDefaultProfile',
      'setProfileBasePreset',
      'setProfileDescription',
      'setProfileName',
      'setPromptBindingEnabled',
      'setPromptBindingOrder',
      'setPromptBindingPlacement',
      'setPromptBindingResourceId',
      'setSkillMode',
    ],
  )
})
