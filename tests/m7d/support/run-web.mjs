import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync, spawn } from 'node:child_process'

import {
  PLAYWRIGHT_VERSION, qualifyVersion, initializeWebProfileArgs, installArgs, webArgs,
  parseWebUrl, redactDiagnostic, assertArtifactDigest,
} from './contracts.mjs'
import { createOwnedWebProfilePatch } from './profile-patch.mjs'
import { createBrowserDiagnostics } from './browser-diagnostics.mjs'
import { buildQualificationManifest, requiredScenarioIds, sanitizeLegacyPreflight } from './qualification-evidence.mjs'
import { readCliGraphEvidence, readProfileGraphEvidence } from './graph-evidence.mjs'

const MAX_OUTPUT = 64 * 1024
const INSTALL_TIMEOUT_MS = 4 * 60 * 1000
const WEB_TIMEOUT_MS = 3 * 60 * 1000
const STOP_TIMEOUT_MS = 7 * 1000

function keepTail(value) {
  return value.slice(-MAX_OUTPUT)
}

function isolatedEnv(home, parent = process.env) {
  // Only execution-critical OS/Corepack paths cross into the disposable Host.
  // Do not inherit API credentials, registry auth, proxy identities,
  // NODE_OPTIONS, or the real DSH/user profile environment.
  const env = {}
  const pathKey = Object.keys(parent).find(key => key.toLowerCase() === 'path')
  if (pathKey && typeof parent[pathKey] === 'string') env[pathKey] = parent[pathKey]
  for (const key of ['PATHEXT', 'SystemRoot', 'ComSpec',
    'WINDIR', 'COREPACK_HOME', 'PNPM_HOME']) {
    if (typeof parent[key] === 'string') env[key] = parent[key]
  }
  // The pinned pnpm Corepack shim needs its already prepared binary cache.
  // Sharing a binary cache path is not sharing the user's config or secrets.
  if (!env.COREPACK_HOME) {
    env.COREPACK_HOME = process.platform === 'win32'
      ? path.join(parent.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'node', 'corepack')
      : path.join(parent.HOME || homedir(), '.cache', 'node', 'corepack')
  }
  env.DSH_HOME = home
  env.HOME = home
  env.USERPROFILE = home
  env.APPDATA = path.join(home, 'AppData', 'Roaming')
  env.LOCALAPPDATA = path.join(home, 'AppData', 'Local')
  env.XDG_CONFIG_HOME = path.join(home, '.config')
  env.XDG_CACHE_HOME = path.join(home, '.cache')
  env.XDG_DATA_HOME = path.join(home, '.local', 'share')
  env.TMPDIR = home
  env.TMP = home
  env.TEMP = home
  env.CI = 'true'
  env.NO_COLOR = '1'
  return env
}

export async function assertConfiguredCliVersion(version) {
  const root = process.env.M7D_DSH_CLI_ROOT
  assert.ok(root, 'M7D_DSH_CLI_ROOT is mandatory for all qualified Web and preflight runs')
  const manifest = JSON.parse(await readFile(
    path.join(path.resolve(root), 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    'utf8',
  ))
  assert.equal(manifest.version, version,
    'M7D CLI must be the exact retained DSH version, not a newer resolved CLI')
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const finish = new Promise(resolve => child.once('close', resolve))
  const terminate = signal => {
    try {
      if (process.platform === 'win32') {
        if (signal === 'SIGTERM') {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }).unref()
        } else child.kill()
      } else process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  terminate('SIGTERM')
  await Promise.race([finish, new Promise(resolve => setTimeout(resolve, STOP_TIMEOUT_MS))])
  if (child.exitCode === null && child.signalCode === null) terminate('SIGKILL')
  await Promise.race([finish, new Promise(resolve => setTimeout(resolve, STOP_TIMEOUT_MS))])
}

function startCommand(args, env, cwd) {
  const windows = process.platform === 'win32'
  return spawn(windows ? 'pnpm.cmd' : 'pnpm', args, {
    env, cwd, windowsHide: true,
    shell: windows, // corepack's Windows shim is a .cmd file, not an executable.
    detached: !windows,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

async function runCommand(args, env, cwd, timeoutMs) {
  const child = startCommand(args, env, cwd)
  let output = ''
  child.stdout.on('data', bytes => { output = keepTail(output + String(bytes)) })
  child.stderr.on('data', bytes => { output = keepTail(output + String(bytes)) })
  try {
    const status = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('DSH command exceeded timeout')), timeoutMs)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal }) })
    })
    assert.equal(status.code, 0,
      'DSH command failed: ' + redactDiagnostic(output).slice(-4000))
    return redactDiagnostic(output)
  } finally {
    await stopProcess(child)
  }
}

/** A printed URL is not readiness: older DSH publishes it before HMR boots. */
export async function startWeb(version, profile, env, cwd) {
  const child = startCommand(webArgs(version, profile), env, cwd)
  let output = ''
  let exitState
  const exited = new Promise(resolve => {
    child.once('exit', (code, signal) => {
      exitState = { code, signal }
      resolve(exitState)
    })
    child.once('error', error => {
      exitState = { error: error.message }
      resolve(exitState)
    })
  })
  const describeExit = () =>
    'DSH Host exited during startup: ' + JSON.stringify(exitState) +
    '\n' + redactDiagnostic(output).slice(-5000)

  const announce = new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, address) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(address)
    }
    const timer = setTimeout(() => finish(new Error('DSH Web URL not announced')), WEB_TIMEOUT_MS)
    const append = bytes => {
      output = keepTail(output + String(bytes))
      try {
        const address = parseWebUrl(output)
        if (address) finish(null, address)
      } catch (error) {
        finish(error)
      }
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
  })
  try {
    const url = await Promise.race([
      announce,
      exited.then(() => { throw new Error(describeExit()) }),
    ])
    // Liveness is a read-only HTTP GET (401 is legitimate pre-auth).
    // Actual authenticated app readiness is verified by Chromium.
    let httpReady = false
    let lastStatus = 'no response'
    const deadline = Date.now() + WEB_TIMEOUT_MS
    while (Date.now() < deadline && !httpReady) {
      if (exitState !== undefined) throw new Error(describeExit())
      try {
        const response = await Promise.race([
          fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'follow' }),
          exited.then(() => { throw new Error(describeExit()) }),
        ])
        lastStatus = String(response.status)
        // A 401/403 is still proof of a live Host: DSH's Web bootstrap
        // authenticates in the browser. Only Chromium can prove UI readiness.
        if (response.status >= 200 && response.status < 500) {
          httpReady = true
          break
        }
        // 5xx is not a healthy startup response.
      } catch (error) {
        if (exitState !== undefined) throw new Error(describeExit())
        lastStatus = redactDiagnostic(error?.message || String(error))
      }
      await Promise.race([
        new Promise(resolve => setTimeout(resolve, 200)),
        exited.then(() => { throw new Error(describeExit()) }),
      ])
    }
    if (!httpReady || exitState !== undefined) {
      throw new Error(exitState ? describeExit() :
        'DSH Web HTTP readiness timed out (' + lastStatus + '): ' +
        redactDiagnostic(output).slice(-5000))
    }
    return {
      child, url,
      getOutput: () => redactDiagnostic(output),
      getExitState: () => exitState,
      assertAlive() {
        if (exitState !== undefined) throw new Error(describeExit())
      },
    }
  } catch (error) {
    await stopProcess(child)
    throw new Error(redactDiagnostic(error?.message || String(error)))
  }
}

/** Browser console/error text can include an authenticated Web URL. */
function sanitizeBrowserDiagnostic(value) {
  return redactDiagnostic(String(value))
    .replace(/https?:\/\/[^\s"'<>)]*/gi, '[URL REDACTED]')
    .slice(0, 4000)
}

/** Complete DSH's two public first-run dialogs with no model credentials.
 * Some published clients show notice then provider onboarding asynchronously.
 * Never force-click through their inert/portal masks.
 */
export async function acknowledgePublicFirstRunNotice(page) {
  const welcome = page.getByRole('button', { name: /^(Continue|继续)$/ }).first()
  const deferKey = page.getByRole('button', { name: /^(Configure later|稍后配置)$/ }).first()
  const root = page.locator('#root')
  let dismissedWelcome = false
  let dismissedProvider = false

  // The trigger is installed before the welcome coordinator finishes its
  // async settings read. Poll boundedly for a known public dialog.
  const deadline = Date.now() + 20_000
  let quietSince = 0
  while (Date.now() < deadline) {
    if (await welcome.isVisible()) {
      assert.equal(dismissedWelcome, false, 'welcome dialog appeared twice in one page')
      await welcome.click()
      await welcome.waitFor({ state: 'hidden', timeout: 10_000 })
      dismissedWelcome = true
      quietSince = 0
      continue
    }
    if (await deferKey.isVisible()) {
      assert.equal(dismissedProvider, false, 'provider dialog appeared twice in one page')
      await deferKey.click()
      await deferKey.waitFor({ state: 'hidden', timeout: 10_000 })
      dismissedProvider = true
      quietSince = 0
      continue
    }
    const inert = await root.evaluate(element => element.inert)
    const modal = page.getByRole('dialog').first()
    if (inert && await modal.isVisible()) {
      const title = await modal.locator('h2').first().textContent().catch(() => '')
      if (/^(Internal Testing Notice|内测声明|Add an API key to get started|添加一个 API Key 开始使用)$/.test((title || '').trim())) {
        // The title and inert mask can mount before its public action button.
        // Await the matching button in a bounded loop; do not force-click or
        // classify a recognized onboarding modal as an unexpected dialog.
        quietSince = 0
        await page.waitForTimeout(150)
        continue
      }
      throw new Error('Unexpected blocking DSH first-run modal: ' +
        sanitizeBrowserDiagnostic(title))
    }
    if (!inert) {
      if (!quietSince) quietSince = Date.now()
      // Allow both async welcome hydration and the next provider step to
      // mount before assuming onboarding is complete.
      if (Date.now() - quietSince >= (dismissedWelcome ? 2500 : 1500)) return
    } else {
      quietSince = 0
    }
    await page.waitForTimeout(150)
  }
  throw new Error('DSH first-run onboarding did not settle without credentials')
}

async function awaitClientUi(page) {
  const trigger = page.locator('[data-context-manager-trigger]')
  await Promise.race([
    trigger.waitFor({ state: 'visible', timeout: 90_000 }),
    page.getByText(/Failed to load plugins|插件加载失败/i).first()
      .waitFor({ state: 'visible', timeout: 90_000 })
      .then(() => { throw new Error('DSH Client plugin import failed (see browser diagnostics)') }),
  ])
  assert.equal(await trigger.count(), 1, 'expected one additive Context Manager trigger')
  await acknowledgePublicFirstRunNotice(page)
}

function playwrightRuntime() {
  const root = process.env.M7D_PLAYWRIGHT_ROOT
  assert.ok(root, 'M7D_PLAYWRIGHT_ROOT must identify the isolated pinned runner package')
  const requireFromRunner = createRequire(path.join(path.resolve(root), 'package.json'))
  const manifest = requireFromRunner('playwright/package.json')
  assert.equal(manifest.version, PLAYWRIGHT_VERSION,
    'browser runner must use the reviewed published Playwright version')
  return requireFromRunner('playwright')
}

/**
 * Executes real DSH Host + shipped Web browser with no mocked Remote/Loader.
 * Scenario receives the same running Host and Chromium page, and may restart it.
 */
export async function runPackedWeb(scenario, kind = 'packed-web') {
  const version = qualifyVersion(process.env.M7D_DSH_VERSION)
  await assertConfiguredCliVersion(version)
  const tarball = path.resolve(process.env.M7D_TARBALL || '')
  assert.ok(process.env.M7D_TARBALL, 'M7D_TARBALL is required')
  assert.ok(tarball.endsWith('.tgz'), 'M7D requires a packed tgz, not repository sources')
  const expectedDigest = process.env.M7D_EXPECTED_SHA256
  assertArtifactDigest(expectedDigest)
  const digest = await sha256(tarball)
  assert.equal(digest, expectedDigest, 'M7D packed artifact digest mismatch')
  const cliGraphSha256 = await readCliGraphEvidence(process.env.M7D_DSH_CLI_ROOT, version)

  const outputDir = path.resolve(process.env.M7D_OUTPUT_DIR || path.join('.artifacts', 'm7d-' + version))
  await mkdir(outputDir, { recursive: true })
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
  const profile = 'web'
  const env = isolatedEnv(home)
  const cwd = process.cwd()
  const evidence = {
    scope: kind, dshVersion: version, tarballSha256: digest,
    installedFrom: 'same-packed-tarball', browser: 'chromium',
    remote: 'real-host', status: 'failed', scenarios: [],
  }

  let web
  let browser
  let page
  let testPatch
  const scenarioSeen = new Set()
  const allowedScenarios = new Set(requiredScenarioIds(version))
  const diagnostics = createBrowserDiagnostics()
  let profileGraphSha256
  try {
    console.log('M7D: initialize the shipped Web profile inside isolated DSH_HOME (' + version + ')')
    await runCommand(initializeWebProfileArgs(version, profile), env, cwd, INSTALL_TIMEOUT_MS)
    console.log('M7D: installing pinned packed artifact in isolated DSH profile (' + version + ')')
    await runCommand(installArgs(version, profile, tarball), env, cwd, INSTALL_TIMEOUT_MS)
    profileGraphSha256 = await readProfileGraphEvidence(home, profile, tarball, version)
    testPatch = await createOwnedWebProfilePatch(home)
    if (version !== '0.1.6-alpha.2') {
      await testPatch.setLegacyHmrEnabled(true)
      evidence.legacyHmrPrerequisite = 'explicitly-enabled'
    }
    web = await startWeb(version, profile, env, cwd)
    const { chromium } = playwrightRuntime()
    browser = await chromium.launch({
      headless: true,
      args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await context.newPage()
    diagnostics.attach(context)
    await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await awaitClientUi(page)
    web.assertAlive()

    const contextActions = {
      page, context, browser, version, outputDir,
      record(name) {
        assert.ok(allowedScenarios.has(name), 'unknown M7D scenario: ' + name)
        assert.equal(scenarioSeen.has(name), false, 'duplicate M7D scenario: ' + name)
        scenarioSeen.add(name)
        evidence.scenarios.push(name)
      },
      async restartHost() {
        await stopProcess(web.child)
        web = await startWeb(version, profile, env, cwd)
        await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await awaitClientUi(page)
        web.assertAlive()
      },
      getHostLog() { return web.getOutput() },
      async setPluginDisabledThroughPublicProfilePatch(disabled) {
        assert.ok(testPatch, 'profile patch controller must be initialized')
        await testPatch.setContextManagerDisabled(disabled)
      },
      async rebuildInstalledClientForHmr() {
        assert.equal(version, '0.1.6-alpha.2',
          'published rebuild HMR is qualified only on the reviewed generation')
        const file = path.join(home, 'profiles', profile,
          'node_modules', 'dsh-context-manager', 'lib', 'client.js')
        const realFile = await realpath(file)
        const relative = path.relative(home, realFile)
        assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative),
          'refuse to edit a client bundle outside the temporary DSH_HOME')
        const source = await readFile(file, 'utf8')
        assert.ok(source.includes('window.__ModuleLoader__.load'),
          'installed bundle does not expose the expected public loader ABI')
        // Atomically replace only this disposable profile's installed hardlink;
        // never write through to pnpm's immutable content-addressed store.
        const replacementFile = file + '.m7d-rebuild'
        await writeFile(replacementFile, source + '\n// M7D mutable development rebuild\n')
        await rename(replacementFile, file)
      },
    }
    await scenario(contextActions)
    web.assertAlive()
    diagnostics.assertNoBlockingErrors()
    const checkoutCommit = execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd, encoding: 'utf8' }).trim()
    if (process.env.GITHUB_SHA) assert.equal(checkoutCommit, process.env.GITHUB_SHA,
      'qualification tested commit differs from the actual checkout')
    const legacyControls = version === '0.1.6-alpha.2' ? [] :
      sanitizeLegacyPreflight(version, JSON.parse(await readFile(
        path.join(outputDir, 'host-preflight.json'), 'utf8')))
    const manifest = buildQualificationManifest({
      sourceCommit: process.env.M7D_SOURCE_COMMIT,
      testedCommit: checkoutCommit,
      platform: process.platform,
      dshVersion: version,
      tarballSha256: digest,
      cliGraphSha256,
      profileGraphSha256,
      scenarios: evidence.scenarios,
      browserDiagnostics: diagnostics.summary(),
      legacyControls,
    })
    // A missing or invalid manifest is an incomplete qualification, not a pass.
    const manifestPath = path.join(outputDir, 'qualification-manifest.json')
    const temporaryManifest = manifestPath + '.tmp'
    await writeFile(temporaryManifest, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
    await rename(temporaryManifest, manifestPath)
    evidence.status = 'passed'
    console.log('M7D: ' + kind + ' passed (' + version + ')')
  } catch (error) {
    evidence.error = redactDiagnostic(error?.stack || String(error)).slice(0,8000)
    if (page && !page.isClosed()) {
      const screenshot = path.join(outputDir, 'm7d-failure.png')
      try {
        await page.screenshot({ path: screenshot, fullPage: true, timeout: 10_000 })
        evidence.screenshot = 'm7d-failure.png'
      } catch {
        // Preserve the primary failure; screenshot diagnostics are best effort.
      }
    }
    if (web) evidence.hostDiagnosticTail = web.getOutput().slice(-4000)
    if (web?.getExitState()) evidence.hostExit = web.getExitState()
    evidence.browserDiagnostics = diagnostics.entries
    // Playwright failures may embed authenticated URLs; never print one raw.
    throw new Error(evidence.error)
  } finally {
    await browser?.close().catch(() => {})
    await stopProcess(web?.child)
    await rm(home, { recursive: true, force: true })
    if (diagnostics.entries.length) evidence.browserDiagnostics = diagnostics.entries
    await writeFile(path.join(outputDir, 'evidence.json'),
      JSON.stringify(evidence, null, 2) + '\n')
  }
}


// Public qualification helpers; never imported by the shipped Client.
export { isolatedEnv, runCommand, stopProcess }
