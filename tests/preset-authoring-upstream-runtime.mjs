import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { Context } from '@deepseek-ai/cordis'

import { ContextManagerPresetAuthoring } from '../lib/index.js'

const agentPresetModule = await import('@deepseek-ai/dsh-agent-presets')
const AgentPresets = agentPresetModule.default ?? agentPresetModule.AgentPresets
const Loader = (await import('@deepseek-ai/cordis-plugin-loader')).default

assert.equal(typeof AgentPresets, 'function', 'published AgentPresets class must be importable')
assert.equal(typeof Loader, 'function', 'published Cordis Loader must be importable')

const root = await mkdtemp(join(tmpdir(), 'dsh-context-manager-m3c-'))
const systemRoot = join(root, 'system')
const userRoot = join(root, 'user')
const sourceDir = join(systemRoot, 'source')
const compositionFile = agentPresetModule.COMPOSITION_FILE
const composition = '[]\n'

await mkdir(sourceDir, { recursive: true })
await mkdir(userRoot, { recursive: true })
await writeFile(join(sourceDir, compositionFile), composition)

const ctx = new Context()
ctx.baseUrl = pathToFileURL(`${process.cwd()}/`).href

let loaderFiber
let projectionFiber
let presetFiber
let authoringFiber

try {
  loaderFiber = ctx.plugin(Loader)
  await loaderFiber

  const modern = 'agentPresetProjectionDefinition' in agentPresetModule
  if (modern) {
    const { SessionProjectionRegistry } = await import('@deepseek-ai/dsh-session-projection')
    projectionFiber = ctx.plugin(SessionProjectionRegistry)
    await projectionFiber
  }

  const config = {
    default: 'source',
    roots: [
      { path: systemRoot, trust: 'system' },
      { path: userRoot, trust: 'user' },
    ],
    includeUserRoot: false,
    ...(modern ? { includeShippedRoot: false } : {}),
  }

  presetFiber = ctx.plugin(AgentPresets, config)
  await presetFiber

  authoringFiber = ctx.plugin(ContextManagerPresetAuthoring)
  await authoringFiber

  const authoring = ctx.dshContextPresetAuthoring

  await authoring.copy('source', 'mine', 'Mine')

  assert.equal(await authoring.read('mine'), composition)
  assert.equal(
    await readFile(join(userRoot, 'mine', compositionFile), 'utf8'),
    composition,
    'Context Manager copy must reach the native writable user root',
  )
  assert.equal(
    (await ctx.agentPresets.list()).find(preset => preset.id === 'mine')?.trust,
    'user',
    'the native roster must discover the copied preset as user-owned',
  )

  await authoring.remove('mine')

  assert.equal(
    existsSync(join(userRoot, 'mine')),
    false,
    'Context Manager remove must reach the native authoring implementation',
  )
  await assert.rejects(authoring.read('mine'))
} finally {
  await authoringFiber?.dispose()
  await presetFiber?.dispose()
  await projectionFiber?.dispose()
  await loaderFiber?.dispose()
  await rm(root, { recursive: true, force: true })
}
