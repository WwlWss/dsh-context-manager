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
  assert.deepEqual(packageJson.exports['./typert'], {
    types: './lib/typert.host.d.ts',
    default: './lib/typert.host.js',
  })
  assert.deepEqual(packageJson.exports['./remote'], {
    types: './lib/typert.remote-client.d.ts',
    default: './lib/typert.remote-client.js',
  })
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(packageJson.dependencies?.zod, '^4.4.3')

  await access(fromRoot(packageJson.main))
  await access(fromRoot(packageJson.types))
  await access(fromRoot(packageJson.dsh.bundle.patch))
  await access(fromRoot(packageJson.exports['./typert'].types))
  await access(fromRoot(packageJson.exports['./typert'].default))
  await access(fromRoot(packageJson.exports['./remote'].types))
  await access(fromRoot(packageJson.exports['./remote'].default))
})

test('bundle patch inserts only the namespaced context-manager row', async () => {
  const patch = await readFile(fromRoot(packageJson.dsh.bundle.patch), 'utf8')
  assert.match(patch, /^- insert:\s*$/m)
  assert.match(patch, /^\s+- id: dsh-context-manager\s*$/m)
  assert.match(patch, /^\s+name: dsh-context-manager\s*$/m)
  assert.doesNotMatch(patch, /^- id:/m)
})

test('built host entry exposes the Context Manager Host service contracts', async () => {
  const entry = await import(pathToFileURL(fromRoot(packageJson.main)).href)
  assert.equal(entry.name, 'dsh-context-manager')
  assert.equal(typeof entry.apply, 'function')
  assert.equal(typeof entry.ContextManagerService, 'function')
  assert.equal(typeof entry.ContextManagerPresetDirectory, 'function')
  assert.equal(typeof entry.ContextManagerSessionPresetIdentity, 'function')
  assert.equal(typeof entry.ContextManagerPresetAuthoring, 'function')
  assert.equal(typeof entry.ContextManagerPromptLibrary, 'function')
  assert.equal(typeof entry.ContextManagerRemoteService, 'function')
  assert.equal(entry.CONTEXT_MANAGER_REMOTE_API_VERSION, 1)
  assert.equal(entry.ContextManagerSessionPreset, undefined)
  assert.equal(entry.CONTEXT_MANAGER_SETTINGS_NAMESPACE, 'dsh-context-manager')
})

test('adapter mechanics stay internal to the root package API', async () => {
  const entry = await import(pathToFileURL(fromRoot(packageJson.main)).href)
  assert.equal(entry.getAgentPresetsCapability, undefined)
  assert.equal(entry.observeAgentPresets, undefined)
  assert.equal(entry.buildPresetSnapshot, undefined)
  assert.equal(entry.buildUnavailablePresetSnapshot, undefined)
  assert.equal(entry.observeSessionPresetIdentity, undefined)
  assert.equal(entry.readNativePresetComposition, undefined)
  assert.equal(entry.copyNativePreset, undefined)
  assert.equal(entry.removeNativePreset, undefined)
  assert.equal(entry.openPromptStorage, undefined)
  assert.equal(entry.PROMPT_LIBRARY_DOMAIN_SPEC, undefined)
  assert.equal(entry.PROMPT_RESOURCE_SCHEMA, undefined)
})

test('built host entry does not import or bundle optional DSH runtime packages', async () => {
  const built = await readFile(fromRoot(packageJson.main), 'utf8')
  assert.doesNotMatch(built, /@deepseek-ai\/dsh-agent-presets/)
  assert.doesNotMatch(built, /@deepseek-ai\/dsh-session(?:['"/])/)
  assert.doesNotMatch(built, /@deepseek-ai\/dsh-session-projection/)
  assert.doesNotMatch(built, /@deepseek-ai\/dsh-storage-domain/)
  assert.doesNotMatch(built, /@deepseek-ai\/dsh-storage-json/)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-agent-presets'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-agent-presets'], undefined)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-session'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-session'], undefined)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-session-projection'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-session-projection'], undefined)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-storage-domain'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-storage-domain'], undefined)
})


test('generated M6A Remote contribution is strict and contains only protocol()', async () => {
  const remote = await import(pathToFileURL(fromRoot(packageJson.exports['./remote'].default)).href)
  const contribution = remote.TYPERT_REMOTE
  assert.equal(contribution.package, 'dsh-context-manager')
  assert.equal(contribution.descriptors.length, 1)

  const [descriptor] = contribution.descriptors
  assert.equal(descriptor.id, 'dsh-context-manager#contextManager/protocol')
  assert.equal(descriptor.service, 'dshContextRemote')
  assert.equal(descriptor.namespace, 'contextManager')
  assert.equal(descriptor.method, 'protocol')
  assert.equal(descriptor.implementation ?? descriptor.method, 'protocol')
  assert.deepEqual(descriptor.invocation, { kind: 'direct' })
  assert.deepEqual(descriptor.parameters, [])
  assert.equal(descriptor.result.mode, 'strict')
  assert.equal(descriptor.result.schema.safeParse({ apiVersion: 1 }).success, true)
  assert.equal(descriptor.result.schema.safeParse({ apiVersion: '1' }).success, false)
})
