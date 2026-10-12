import assert from 'node:assert/strict'

/**
 * Read the published Host Client Modules graph using a fresh public
 * /plugins/events EventSource. Retained pre-0.1.6 browsers intentionally
 * ignore connect-time graph frames; only code-rebuild frames are hot-swapped.
 */
export async function readPublicClientGraphEntries(page) {
  const result = await page.evaluate(async () => {
    return await new Promise((resolve, reject) => {
      const source = new EventSource('/plugins/events')
      const timer = setTimeout(() => {
        source.close()
        reject(new Error('public /plugins/events initial graph timed out'))
      }, 5000)
      const settle = (value, error) => {
        clearTimeout(timer)
        source.close()
        if (error) reject(new Error(error))
        else resolve(value)
      }
      source.onerror = () => settle(undefined, 'public /plugins/events connection failed')
      source.onmessage = event => {
        let frame
        try { frame = JSON.parse(event.data) } catch {
          settle(undefined, 'malformed public SSE frame')
          return
        }
        if (frame?.type !== 'graph') return
        if (!Array.isArray(frame.graph?.entries)) {
          settle(undefined, 'invalid public SSE graph entries')
          return
        }
        settle(frame.graph.entries.map(row => row.id))
      }
    })
  })
  assert.ok(Array.isArray(result) && result.every(x => typeof x === 'string'),
    'public Client Modules graph must expose string entry ids')
  return result
}

export async function waitForPublicClientGraphEntry(page, packageId, expected, timeoutMs = 45_000) {
  assert.equal(typeof packageId, 'string')
  assert.equal(typeof expected, 'boolean')
  let last = []
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    last = await readPublicClientGraphEntries(page)
    if (last.includes(packageId) === expected) return last
    await page.waitForTimeout(350)
  }
  throw new Error('published Host Client graph did not ' +
    (expected ? 'include' : 'remove') + ' expected package ' + packageId +
    '; visible entries: ' + last.join(', '))
}
