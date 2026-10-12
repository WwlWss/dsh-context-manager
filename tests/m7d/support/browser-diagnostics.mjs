import assert from 'node:assert/strict'
import { redactDiagnostic } from './contracts.mjs'

const MAX_RECORDS = 60

function sanitize(value) {
  return redactDiagnostic(String(value))
    .replace(/https?:\/\/[^\s"'<>)]*/gi, '[URL REDACTED]')
    .slice(0, 2000)
}

function requestPath(request) {
  try { return new URL(request.url()).pathname } catch { return '[invalid-url]' }
}

/**
 * Attach to the entire browser context, including pages opened later.
 * Unhandled JS and scoped plugin failures are blocking; routine upstream
 * navigation/HMR network cancellations are retained only as diagnostics.
 */
export function createBrowserDiagnostics() {
  const entries = []
  const pages = new WeakSet()
  const contexts = new WeakSet()
  let blockingCount = 0
  function record(type, value, blocking) {
    if (blocking) blockingCount += 1
    if (entries.length >= MAX_RECORDS) entries.shift()
    entries.push({ type, blocking, message: sanitize(value) })
  }
  function attachPage(page) {
    if (pages.has(page)) return
    pages.add(page)
    page.on('pageerror', error =>
      record('pageerror', error?.stack || error?.message || error, true))
    page.on('crash', () =>
      record('crash', 'Chromium page crashed', true))
    page.on('console', message => {
      if (message.type() !== 'error') return
      const body = message.text()
      const blocking = /dsh-context-manager|ContextManager|Failed to load plugins|插件加载失败/i.test(body)
      record('console', body, blocking)
    })
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText || 'unknown'
      const target = requestPath(request)
      const pluginOwned = /dsh-context-manager/i.test(target)
      const aborted = /ERR_ABORTED|NS_BINDING_ABORTED|cancell?ed/i.test(failure)
      record('requestfailed', target + ': ' + failure, pluginOwned && !aborted)
    })
  }
  function attach(context) {
    if (contexts.has(context)) return
    contexts.add(context)
    context.on('page', attachPage)
    for (const page of context.pages()) attachPage(page)
  }
  return {
    attach,
    record,
    entries,
    summary() {
      const counts = { pageerror: 0, crash: 0, console: 0, requestfailed: 0 }
      for (const item of entries) counts[item.type] += 1
      return { ...counts, blocking: blockingCount }
    },
    assertNoBlockingErrors() {
      assert.equal(blockingCount, 0,
        'M7D browser observed blocking Client errors: ' +
        entries.filter(item => item.blocking).slice(-5)
          .map(item => item.type + ': ' + item.message).join(' | '))
    },
  }
}
