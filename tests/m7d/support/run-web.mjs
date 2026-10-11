import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'

import {
  PLAYWRIGHT_VERSION, qualifyVersion, installArgs, webArgs,
  parseWebUrl, redactDiagnostic, assertArtifactDigest,
} from './contracts.mjs'

const MAX_OUTPUT = 64 * 1024
const INSTALL_TIMEOUT_MS = 4 * 60 * 1000
const WEB_TIMEOUT_MS = 3 * 60 * 1000
const STOP_TIMEOUT_MS = 7 * 1000

function keepTail(value) {
  return value.slice(-MAX_OUTPUT)
}

function isolatedEnv(home) {
  const env = { ...process.env }
  // In particular, do not inherit an interactive user's alternate DSH profile.
  for (const key of Object.keys(env)) {
    if (key.startsWith('DSH_')) delete env[key]
  }
  env.DSH_HOME = home
  env.CI = 'true'
  env.NO_COLOR = '1'
  return env
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
  return spawn('pnpm', args, {
    env, cwd, windowsHide: true,
    detached: process.platform !== 'win32',
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

async function startWeb(version, profile, env, cwd) {
  const child = startCommand(webArgs(version, profile), env, cwd)
  let output = ''
  const url = await new Promise((resolve, reject) => {
    let settled = false
    const settle = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    const timer = setTimeout(
      () => settle(new Error('DSH Web did not publish readiness: ' +
        redactDiagnostic(output).slice(-4000))), WEB_TIMEOUT_MS)
    const append = bytes => {
      output = keepTail(output + String(bytes))
      let address
      try { address = parseWebUrl(output) } catch (error) {
        settle(error)
        return
      }
      if (address) settle(null, address)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', error => settle(error))
    child.once('close', (code, signal) =>
      settle(new Error('DSH Web exited before ready (' + code + ', ' + signal + '): ' +
        redactDiagnostic(output).slice(-4000))))
  }).catch(async error => {
    await stopProcess(child)
    throw error
  })
  // Continue collecting sanitized diagnostics after the readiness line.
  return {
    child,
    url,
    getOutput: () => redactDiagnostic(output),
  }
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
  const tarball = path.resolve(process.env.M7D_TARBALL || '')
  assert.ok(process.env.M7D_TARBALL, 'M7D_TARBALL is required')
  assert.ok(tarball.endsWith('.tgz'), 'M7D requires a packed tgz, not repository sources')
  const expectedDigest = process.env.M7D_EXPECTED_SHA256
  assertArtifactDigest(expectedDigest)
  const digest = await sha256(tarball)
  assert.equal(digest, expectedDigest, 'M7D packed artifact digest mismatch')

  const outputDir = path.resolve(process.env.M7D_OUTPUT_DIR || path.join('.artifacts', 'm7d-' + version))
  await mkdir(outputDir, { recursive: true })
  const home = await mkdtemp(path.join(tmpdir(), 'dsh-m7d-'))
  const profile = 'm7d-qualification'
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
  try {
    console.log('M7D: installing pinned packed artifact in isolated DSH profile (' + version + ')')
    await runCommand(installArgs(version, profile, tarball), env, cwd, INSTALL_TIMEOUT_MS)
    web = await startWeb(version, profile, env, cwd)
    const { chromium } = playwrightRuntime()
    browser = await chromium.launch({
      headless: true,
      args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    page = await context.newPage()
    await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    const trigger = page.locator('[data-context-manager-trigger]')
    await trigger.waitFor({ state: 'visible', timeout: 90_000 })
    assert.equal(await trigger.count(), 1, 'expected exactly one additive Context Manager trigger')

    const contextActions = {
      page, context, browser, version, outputDir,
      record(name) { evidence.scenarios.push(name) },
      async restartHost() {
        await stopProcess(web.child)
        web = await startWeb(version, profile, env, cwd)
        await page.goto(web.url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
        await page.locator('[data-context-manager-trigger]').waitFor({
          state: 'visible', timeout: 90_000,
        })
      },
      getHostLog() { return web.getOutput() },
    }
    await scenario(contextActions)
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
    // Playwright failures may embed authenticated URLs; never print one raw.
    throw new Error(evidence.error)
  } finally {
    await browser?.close().catch(() => {})
    await stopProcess(web?.child)
    await rm(home, { recursive: true, force: true })
    await writeFile(path.join(outputDir, 'evidence.json'),
      JSON.stringify(evidence, null, 2) + '\n')
  }
}

