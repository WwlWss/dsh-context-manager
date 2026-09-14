import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'

import { ContextManagerPromptLibrary } from '../lib/index.js'

const unitName = 'dsh_context_manager_prompts'
const root = await mkdtemp(join(tmpdir(), 'dsh-context-manager-m4a-'))
const id = '  Prompt 日本語  '
const initialContent = '  leading\r\n中文\n日本語 😀 {{variable}} {{unknown}}\ntrailing  '
const changedContent = '\r\n changed exactly \n'

async function mount() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  await ctx.plugin(StorageJson, { root })
  await ctx.plugin(StorageDomain, { backend: 'json' })
  await ctx.plugin(ContextManagerPromptLibrary)
  return { ctx, library: ctx.dshContextPromptLibrary }
}

try {
  const first = await mount()
  try {
    const created = await first.library.createPrompt(id, {
      name: '  exact display name  ',
      description: '',
      content: initialContent,
      authoredExtension: { retained: true },
    })
    assert.deepEqual(created, { id, revision: 1 })
    assert.equal(first.library.get(id).resource.content, initialContent)

    const nativeDomain = first.ctx.storageDomain.get(unitName)
    assert.ok(nativeDomain)
    await nativeDomain.table('resources').update(id, current => ({
      ...current,
      futureField: { opaque: ['keep', 1, { nested: true }] },
    }))
    await nativeDomain.table('resources').put('malformed', {
      name: 123,
      content: 'kept for diagnostics',
      revision: 3,
    })
  } finally {
    await first.ctx.fiber.dispose()
  }

  const second = await mount()
  try {
    const reopened = second.library.get(id)
    assert.equal(reopened.resource.name, '  exact display name  ')
    assert.equal(reopened.resource.description, '')
    assert.equal(reopened.resource.content, initialContent)
    assert.equal(reopened.resource.revision, 1)
    assert.deepEqual(reopened.resource.authoredExtension, { retained: true })
    assert.deepEqual(reopened.resource.futureField, { opaque: ['keep', 1, { nested: true }] })
    assert.equal(second.library.list().find(item => item.id === 'malformed').status, 'invalid')

    const updated = await second.library.setPromptContent(id, changedContent, 1)
    assert.deepEqual(updated, { id, revision: 2 })
    const afterUpdate = second.library.get(id).resource
    assert.equal(afterUpdate.content, changedContent)
    assert.deepEqual(afterUpdate.futureField, { opaque: ['keep', 1, { nested: true }] })
  } finally {
    await second.ctx.fiber.dispose()
  }

  const third = await mount()
  try {
    const reopened = third.library.get(id)
    assert.equal(reopened.resource.content, changedContent)
    assert.equal(reopened.resource.revision, 2)
    assert.deepEqual(reopened.resource.futureField, { opaque: ['keep', 1, { nested: true }] })
    assert.equal(third.library.list().find(item => item.id === 'malformed').status, 'invalid')
  } finally {
    await third.ctx.fiber.dispose()
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
