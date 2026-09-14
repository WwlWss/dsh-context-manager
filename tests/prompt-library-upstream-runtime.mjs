import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'

import { ContextManagerPromptLibrary } from '../lib/index.js'

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
    })
    assert.equal(created.id, id)
    assert.equal(created.resource.content, initialContent)
    assert.equal(created.resource.revision, 1)
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

    const updated = await second.library.setPromptContent(id, changedContent, 1)
    assert.equal(updated.resource.content, changedContent)
    assert.equal(updated.resource.revision, 2)
  } finally {
    await second.ctx.fiber.dispose()
  }

  const third = await mount()
  try {
    const reopened = third.library.get(id)
    assert.equal(reopened.resource.content, changedContent)
    assert.equal(reopened.resource.revision, 2)
  } finally {
    await third.ctx.fiber.dispose()
  }
} finally {
  await rm(root, { recursive: true, force: true })
}
