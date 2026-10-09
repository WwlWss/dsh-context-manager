#!/usr/bin/env node
/**
 * Published-tarball structural preflight only: E2/E6, NOT Host runtime support.
 * Usage: node scripts/probe-dsh-published-artifacts.mjs 0.2.0-rc.2
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile, appendFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const version = process.argv[2]
const retained = version === '0.1.6-alpha.2'
assert.ok(
  ['0.1.6-alpha.2', '0.2.0-rc.2', '0.2.1-alpha.2'].includes(version),
  'version must be an explicit intake candidate',
)
const packages = [
  '@deepseek-ai/dsh-settings',
  retained ? '@deepseek-ai/dsh-agent-presets' : '@deepseek-ai/dsh-agent-preset-registry',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-typert-protocol',
]
const tmp = await mkdtemp(path.join(os.tmpdir(), 'dsh-public-intake-'))
const evidence = {
  version,
  kind: 'E2/E6 published artifact preflight; not Host runtime support',
  packages: [],
}
function hasClass(declaration, name) {
  return new RegExp('\\bclass\\s+' + name + '\\b').test(declaration)
}

try {
  for (let index = 0; index < packages.length; index += 1) {
    const name = packages[index]
    const packOutput = execFileSync('npm', [
      'pack', name + '@' + version, '--json', '--ignore-scripts',
      '--pack-destination', tmp,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] })
    const packs = JSON.parse(packOutput)
    assert.equal(packs.length, 1)
    const filename = packs[0].filename
    assert.ok(typeof filename === 'string' && filename)
    const target = path.join(tmp, 'pkg-' + index)
    await mkdir(target)
    execFileSync('tar', ['-xzf', path.join(tmp, filename), '-C', target], { stdio: 'inherit' })
    const root = path.join(target, 'package')
    const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
    assert.equal(manifest.name, name)
    assert.equal(manifest.version, version)
    const exportsRoot = manifest.exports?.['.']
    assert.equal(typeof exportsRoot?.types, 'string', name + ' has no public types export')
    assert.equal(typeof exportsRoot?.default, 'string', name + ' has no public runtime export')
    const declaration = await readFile(path.join(root, exportsRoot.types), 'utf8')
    await readFile(path.join(root, exportsRoot.default))
    const entry = {
      name,
      version: manifest.version,
      tarball: filename,
      tarballIntegrity: packs[0].integrity ?? null,
      rootTypes: exportsRoot.types,
      publicClientExport: Boolean(manifest.exports?.['./client']),
    }
    if (name === '@deepseek-ai/dsh-settings') {
      entry.settingsProvider = hasClass(declaration, 'SettingsProvider')
      entry.settingsForms = hasClass(declaration, 'SettingsForms')
      entry.installSectionDecl = /\binstallSection\s*[<(]/.test(declaration)
      assert.equal(entry.settingsProvider, retained, 'SettingsProvider differs from source preflight')
      assert.equal(entry.settingsForms, !retained, 'SettingsForms differs from source preflight')
      assert.equal(entry.installSectionDecl, retained, 'installSection differs from source preflight')
    }
    if (name.includes('agent-preset')) {
      entry.agentPresetsClass = hasClass(declaration, 'AgentPresets')
      entry.agentPresetRegistryClass = hasClass(declaration, 'AgentPresetRegistry')
      assert.equal(entry.agentPresetsClass, retained, 'AgentPresets differs from source preflight')
      assert.equal(entry.agentPresetRegistryClass, !retained, 'AgentPresetRegistry differs from source preflight')
    }
    if (name === '@deepseek-ai/dsh-client-ui-renderer') {
      assert.ok(entry.publicClientExport, 'renderer has no public ./client export')
      assert.equal(typeof manifest.exports['./client'].default, 'string')
      await readFile(path.join(root, manifest.exports['./client'].default))
    }
    if (name === '@deepseek-ai/dsh-client-ui-slots') {
      assert.match(declaration, /\bInjectFace\b/, 'published Slots declarations missing InjectFace')
      assert.match(declaration, /\bComposedProps\b/, 'published Slots declarations missing ComposedProps')
    }
    evidence.packages.push(entry)
    process.stdout.write(JSON.stringify(entry) + '\n')
  }
  evidence.conclusion = 'published exports/types verified; Host and product behavior unqualified'
  await mkdir('.artifacts', { recursive: true })
  await writeFile(
    path.join('.artifacts', 'dsh-intake-' + version + '.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  )
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      '### DSH ' + version + ' published artifact preflight (not support)\n\n' +
      '| Package | Version | Root types | Client export |\n| --- | --- | --- | --- |\n' +
      evidence.packages.map(p =>
        '| ' + p.name + ' | ' + p.version + ' | ' + p.rootTypes + ' | ' +
        (p.publicClientExport ? 'yes' : 'n/a') + ' |',
      ).join('\n') +
      '\n\nHost runtime, persistence migration, and native authoring are unqualified.\n',
    )
  }
} finally {
  await rm(tmp, { recursive: true, force: true })
}
