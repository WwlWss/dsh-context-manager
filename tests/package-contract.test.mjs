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
  assert.deepEqual(packageJson.exports['./types'], {
    types: './lib/remote/types.d.ts',
    default: './lib/remote/types.js',
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
  await access(fromRoot('./lib/typert.remote-client.d.ts.map'))
  await access(fromRoot(packageJson.exports['./types'].types))
  await access(fromRoot(packageJson.exports['./types'].default))
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


test('generated M6C Host Typert surface stays isolated from M2-M5 services', async () => {
  const host = await import(pathToFileURL(fromRoot(packageJson.exports['./typert'].default)).href)
  assert.equal(host.TYPERT.package, 'dsh-context-manager')
  assert.equal(host.TYPERT.face, 'host')
  assert.deepEqual(host.TYPERT.model.services, [])
  assert.deepEqual(host.TYPERT.model.events, [])

  const methods = host.TYPERT.invocations.map(item => item.method).sort()
  assert.deepEqual(methods, [
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
  ])

  for (const invocation of host.TYPERT.invocations) {
    assert.equal(invocation.service, 'dshContextRemote')
    assert.equal(invocation.namespace, 'contextManager')
    assert.equal(invocation.result.mode, 'strict')
    assert.equal(typeof invocation.result.schema?.parse, 'function')
    assert.equal(typeof invocation.result.create, 'function')
    assert.equal(invocation.result.create(), invocation.result.schema)
    for (const parameter of invocation.parameters) {
      assert.equal(parameter.codec.mode, 'strict')
      assert.equal(typeof parameter.codec.schema?.parse, 'function')
      assert.equal(typeof parameter.codec.create, 'function')
      assert.equal(parameter.codec.create(), parameter.codec.schema)
    }
  }
})

test('generated M6C Remote contribution exposes exactly the strict business surface', async () => {
  const remote = await import(pathToFileURL(fromRoot(packageJson.exports['./remote'].default)).href)
  const contribution = remote.TYPERT_REMOTE
  assert.equal(contribution.package, 'dsh-context-manager')
  assert.equal(contribution.descriptors.length, 31)

  const methods = contribution.descriptors.map(item => item.method).sort()
  assert.deepEqual(methods, [
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
  ])

  for (const descriptor of contribution.descriptors) {
    assert.equal(descriptor.service, 'dshContextRemote')
    assert.equal(descriptor.namespace, 'contextManager')
    assert.deepEqual(descriptor.invocation, { kind: 'direct' })
    assert.equal(descriptor.result.mode, 'strict')
    assert.equal(typeof descriptor.result.schema?.parse, 'function')
    assert.equal(typeof descriptor.result.create, 'function')
    assert.equal(descriptor.result.create(), descriptor.result.schema)
    for (const parameter of descriptor.parameters) {
      assert.equal(parameter.codec.mode, 'strict')
      assert.equal(typeof parameter.codec.schema?.parse, 'function')
      assert.equal(typeof parameter.codec.create, 'function')
      assert.equal(parameter.codec.create(), parameter.codec.schema)
    }
  }

  const protocol = contribution.descriptors.find(item => item.method === 'protocol')
  assert.ok(protocol)
  assert.deepEqual(protocol.parameters, [])
  assert.equal(protocol.result.schema.safeParse({ apiVersion: 1 }).success, true)
  assert.equal(protocol.result.schema.safeParse({ apiVersion: '1' }).success, false)

  const presets = contribution.descriptors.find(item => item.method === 'presets')
  assert.ok(presets)
  assert.equal(presets.result.schema.safeParse({
    directory: {
      status: 'available',
      defaultId: 'standard',
      authorable: true,
      presets: [{
        id: 'standard',
        trust: 'system',
        isDefault: true,
      }],
    },
    profiles: {},
  }).success, true)

  const promptRuntime = contribution.descriptors.find(item => item.method === 'inspectPromptRuntime')
  assert.ok(promptRuntime)
  assert.equal(promptRuntime.result.schema.safeParse({
    status: 'resolved',
    agentId: 'agent-1',
    profile: {
      status: 'active',
      profileId: 'main',
      presetId: 'standard',
    },
    bindings: [],
  }).success, true)

  const createProfile = contribution.descriptors.find(item => item.method === 'createProfile')
  assert.ok(createProfile)
  assert.deepEqual(createProfile.parameters.map(item => item.name), ['id', 'input', 'expectedRevision'])
  assert.equal(createProfile.result.schema.safeParse({
    ok: false,
    error: {
      code: 'profile-conflict',
      message: 'stale',
      expectedRevision: 1,
      actualRevision: 2,
    },
  }).success, true)
})

