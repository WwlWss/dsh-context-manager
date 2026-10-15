import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { installFrozenWebProfile } from './m7d/support/profile-frozen-install.mjs'

const NAME = 'dsh-context-manager'

test('a native Web Profile can consume the reviewed frozen graph without dynamic add', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
  try {
    const profile = path.join(home, 'profiles', 'web')
    await mkdir(profile, { recursive: true })
    const initial = { name: 'dsh-profile-web', private: true,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } } }
    await writeFile(path.join(profile, 'package.json'),
      JSON.stringify(initial), 'utf8')
    const tarball = path.join(home, 'dsh-context-manager-0.1.0-alpha.0.tgz')
    await writeFile(tarball, Buffer.from('synthetic candidate archive'))
    const calls = []
    const expected = await installFrozenWebProfile({
      home, profile: 'web', tarball, version: '0.1.6-alpha.2',
      env: { DSH_HOME: home }, cwd: process.cwd(),
      runCommand: async (args, env, cwd) => {
        calls.push(args)
        assert.equal(env.DSH_HOME, home)
        assert.equal(cwd, process.cwd())
        assert.ok(args.includes('--frozen-lockfile'))
        assert.ok(args.includes('--ignore-scripts'))
        assert.ok(!args.includes('add'), 'freeze path must not resolve a fresh add')
        const target = path.join(profile, 'node_modules', NAME)
        await mkdir(target, { recursive: true })
        await writeFile(path.join(target, 'package.json'),
          JSON.stringify({ name: NAME, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
      },
    })
    assert.equal(calls.length, 1)
    assert.equal(expected.installedBundle, NAME)
    const committed = JSON.parse(await readFile(
      path.join(profile, 'package.json'), 'utf8'))
    assert.ok(committed.dsh.profile.bundles.includes(NAME))
    assert.equal(committed.dependencies[NAME],
      'file:vendor/dsh-context-manager-0.1.0-alpha.0.tgz')
    const lock = await readFile(path.join(profile, 'pnpm-lock.yaml'), 'utf8')
    assert.ok(lock.includes(expected.candidateSha256) === false,
      'SHA-256 lives in the evidence manifest, not the Profile lock')
    assert.ok(lock.includes('sha512-'))
    const vendor = await readFile(path.join(profile,
      'vendor', 'dsh-context-manager-0.1.0-alpha.0.tgz'))
    assert.equal(vendor.toString(), 'synthetic candidate archive')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
