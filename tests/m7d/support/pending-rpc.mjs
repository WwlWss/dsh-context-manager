import assert from 'node:assert/strict'

const DEFAULT_TIMEOUT_MS = 45_000

/**
 * Hold one real, synthetic Profile rename HTTP response after it has reached
 * the published DSH Host. This hooks only public Playwright transport and
 * never replaces Typert, Context Manager Remote, or production Client code.
 */
export async function holdRealProfileMutation(context, { profileId, name }) {
  assert.match(profileId, /^[a-z0-9-]+$/)
  assert.ok(typeof name === 'string' && name.startsWith('M7D '))
  let readyResolve, readyReject, finishResolve
  let released = false
  let matched = 0
  let observedPosts = 0
  let transportOutcome = 'pending'
  const ready = new Promise((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })
  const releasePromise = new Promise(resolve => { finishResolve = resolve })
  let routeCompletion
  function release() {
    if (released) return
    released = true
    finishResolve()
  }
  const handler = async route => {
    const request = route.request()
    const body = request.postData() || ''
    if (request.method() === 'POST') observedPosts++
    // Match synthetic target AND operation arguments, not arbitrary /api or
    // /plugins traffic. The wire may place the method in the URL or payload.
    if (request.method() !== 'POST' || !body.includes(profileId) ||
      !body.includes(name)) {
      await route.continue()
      return
    }
    matched++
    if (matched !== 1) {
      readyReject(new Error('duplicate held profile mutation request'))
      await route.abort()
      return
    }
    routeCompletion = (async () => {
      const response = await route.fetch()
      assert.ok(response.ok(), 'real Host mutation returned non-2xx HTTP status')
      // Do not claim a business commit from status alone; the E2E verifies
      // durable authoritative Host state through a new Client lifetime.
      transportOutcome = 'host-responded'
      readyResolve()
      await releasePromise
      try {
        await route.fulfill({ response })
        transportOutcome = 'delivered'
      } catch (error) {
        const message = String(error?.message || error)
        if (!/target.*closed|context.*closed|page.*closed|route.*handled|interception.*failed|request.*closed/i.test(message)) {
          throw error
        }
        transportOutcome = 'cancelled-on-unload'
      }
    })().catch(error => {
      readyReject(error)
      transportOutcome = 'error'
      throw error
    })
    // Prevent Playwright route handler promise rejection from being detached.
    await routeCompletion.catch(() => {})
  }
  await context.route('**/*', handler)
  let removed = false
  return {
    async waitForHostResponse(timeoutMs = DEFAULT_TIMEOUT_MS) {
      let timer
      try {
        await Promise.race([
          ready,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(
              'target Profile RPC did not reach real Host; observed POST count=' + observedPosts)), timeoutMs)
          }),
        ])
      } finally {
        clearTimeout(timer)
      }
      assert.equal(matched, 1)
      assert.equal(transportOutcome, 'host-responded')
    },
    release,
    async settle() {
      release()
      if (routeCompletion) await routeCompletion
      assert.ok(['delivered', 'cancelled-on-unload'].includes(transportOutcome),
        'held response must deliver or cancel explicitly')
      return transportOutcome
    },
    async dispose() {
      release()
      if (!removed) {
        removed = true
        await context.unroute('**/*', handler)
      }
      if (routeCompletion) await routeCompletion.catch(() => {})
    },
    get interceptedCount() { return matched },
  }
}
