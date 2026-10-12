import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PROFILE = 'web'
const PATCH = 'cordis.patch.yml'

export function renderTestProfilePatch({ legacyHmrEnabled, contextManagerDisabled }) {
  assert.equal(typeof legacyHmrEnabled, 'boolean')
  assert.equal(typeof contextManagerDisabled, 'boolean')
  const entries = []
  if (legacyHmrEnabled) {
    entries.push('- id: hmr\n  disabled: false\n  config:\n    root: []')
  }
  if (contextManagerDisabled) {
    entries.push('- id: dsh-context-manager\n  disabled: true')
  }
  return entries.length === 0 ? '[]\n' : entries.join('\n') + '\n'
}

/**
 * Fail-closed edit surface for a newly created disposable DSH_HOME only.
 * Never accept a populated or symlinked profile patch.
 */
export async function createOwnedWebProfilePatch(home) {
  const root = await realpath(home)
  const dir = path.join(root, 'profiles', PROFILE)
  const actual = await realpath(dir)
  assert.equal(actual, dir, 'Web profile directory must belong to the isolated home')
  const file = path.join(dir, PATCH)
  const stat = await lstat(file)
  assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'refuse non-regular profile patch')
  const baseline = await readFile(file, 'utf8')
  const unconfigured = baseline.replace(/^\s*#[^\n]*(?:\n|$)/gm, '').trim()
  assert.ok(unconfigured === '' || unconfigured === '[]',
    'refuse to overwrite any nonempty or user-authored profile patch')
  let legacyHmrEnabled = false
  let contextManagerDisabled = false
  async function publish() {
    const next = renderTestProfilePatch({ legacyHmrEnabled, contextManagerDisabled })
    const temporary = file + '.m7d-' + randomUUID()
    try {
      await writeFile(temporary, next, { flag: 'wx', mode: 0o600 })
      await rename(temporary, file)
    } finally {
      await rm(temporary, { force: true })
    }
  }
  return {
    file,
    async setLegacyHmrEnabled(enabled) {
      assert.equal(typeof enabled, 'boolean')
      legacyHmrEnabled = enabled
      await publish()
    },
    async setContextManagerDisabled(disabled) {
      assert.equal(typeof disabled, 'boolean')
      contextManagerDisabled = disabled
      await publish()
    },
    async restore() {
      const temporary = file + '.m7d-' + randomUUID()
      try {
        await writeFile(temporary, baseline, { flag: 'wx', mode: 0o600 })
        await rename(temporary, file)
      } finally {
        await rm(temporary, { force: true })
      }
    },
    state() {
      return { legacyHmrEnabled, contextManagerDisabled }
    },
  }
}
