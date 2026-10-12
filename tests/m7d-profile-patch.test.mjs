import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createOwnedWebProfilePatch, renderTestProfilePatch } from './m7d/support/profile-patch.mjs'

test('legacy HMR remains enabled across five Context Manager disable/enable cycles', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'm7d-patch-'))
  try {
    const dir = path.join(home, 'profiles', 'web')
    await mkdir(dir, { recursive: true })
    const original = '# DSH test-only profile\n[]\n'
    const file = path.join(dir, 'cordis.patch.yml')
    await writeFile(file, original)
    const patch = await createOwnedWebProfilePatch(home)
    await patch.setLegacyHmrEnabled(true)
    for (let i = 0; i < 5; i++) {
      await patch.setContextManagerDisabled(true)
      const disabled = await readFile(file, 'utf8')
      assert.match(disabled, /- id: hmr\n  disabled: false\n  config:\n    root: \[\]/)
      assert.match(disabled, /- id: dsh-context-manager\n  disabled: true/)
      await patch.setContextManagerDisabled(false)
      assert.equal(await readFile(file, 'utf8'),
        renderTestProfilePatch({ legacyHmrEnabled: true, contextManagerDisabled: false }))
    }
    await patch.restore()
    assert.equal(await readFile(file, 'utf8'), original)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('test-owned patch writer refuses configured or symlinked input', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'm7d-patch-'))
  try {
    const dir = path.join(home, 'profiles', 'web')
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, 'cordis.patch.yml')
    await writeFile(file, '- id: pre-existing-user-row\n  disabled: true\n')
    await assert.rejects(createOwnedWebProfilePatch(home), /refuse to overwrite/)
    await rm(file)
    const other = path.join(home, 'external.yml')
    await writeFile(other, '[]\n')
    await symlink(other, file)
    await assert.rejects(createOwnedWebProfilePatch(home), /refuse non-regular/)
    assert.equal(await readFile(other, 'utf8'), '[]\n')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
