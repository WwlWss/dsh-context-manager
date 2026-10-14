import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { createBrowserDiagnostics } from './m7d/support/browser-diagnostics.mjs'

function fixture() {
  const context = new EventEmitter()
  const first = new EventEmitter()
  context.pages = () => [first]
  const diagnostics = createBrowserDiagnostics()
  diagnostics.attach(context)
  return { context, first, diagnostics }
}
test('unhandled errors in secondary Chromium pages fail qualification', () => {
  const { context, first, diagnostics } = fixture()
  const second = new EventEmitter()
  context.emit('page', second)
  first.emit('console', { type: () => 'error', text: () => 'upstream network noise' })
  second.emit('pageerror', new Error('synthetic client error'))
  assert.equal(diagnostics.summary().pageerror, 1)
  assert.throws(() => diagnostics.assertNoBlockingErrors(), /synthetic client error/)
})
test('plugin errors block, normal navigation abort does not', () => {
  const { first, diagnostics } = fixture()
  first.emit('requestfailed', {
    url: () => 'http://127.0.0.1/plugin/dsh-context-manager/client.js',
    failure: () => ({ errorText: 'net::ERR_ABORTED' }),
  })
  assert.doesNotThrow(() => diagnostics.assertNoBlockingErrors())
  first.emit('console', { type: () => 'error', text: () => 'dsh-context-manager import failed' })
  assert.throws(() => diagnostics.assertNoBlockingErrors(), /import failed/)
})

test('browser diagnostics count all events after the bounded evidence ring wraps', () => {
  const { first, diagnostics } = fixture()
  for (let i = 0; i < 90; i++) first.emit('console', {
    type: () => 'error', text: () => 'harmless upstream test event ' + i,
  })
  assert.equal(diagnostics.entries.length, 60)
  assert.equal(diagnostics.summary().console, 90)
  assert.equal(diagnostics.summary().blocking, 0)
})
