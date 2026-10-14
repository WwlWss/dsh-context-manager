import assert from 'node:assert/strict'
import { test } from 'node:test'
import { holdRealProfileMutation } from './m7d/support/pending-rpc.mjs'

function fakeContext() {
  let handler
  return {
    route: async (_pattern, next) => { handler = next },
    unroute: async (_pattern, next) => { assert.equal(next, handler); handler = undefined },
    async dispatch({ method = 'POST', body = '', responseStatus = 200 }) {
      const events = []
      const request = { method: () => method, postData: () => body }
      const route = {
        request: () => request,
        continue: async () => events.push('continue'),
        abort: async () => events.push('abort'),
        fetch: async () => {
          events.push('host-response')
          return { ok: () => responseStatus >= 200 && responseStatus < 300 }
        },
        fulfill: async () => events.push('client-response'),
      }
      const completion = handler(route)
      return { events, completion }
    },
  }
}
test('only the explicit synthetic Profile mutation is held after real transport fetch', async () => {
  const context = fakeContext()
  const held = await holdRealProfileMutation(context, {
    profileId: 'm7d-browser-e2e', name: 'M7D old pending mutation',
  })
  try {
    const noise = await context.dispatch({ body: '{"other":"request"}' })
    await noise.completion
    assert.deepEqual(noise.events, ['continue'])
    const attempt = await context.dispatch({
      body: '{"method":"setProfileName","profileId":"m7d-browser-e2e","name":"M7D old pending mutation"}',
    })
    await held.waitForHostResponse()
    assert.deepEqual(attempt.events, ['host-response'])
    assert.equal(held.interceptedCount, 1)
    held.release()
    await attempt.completion
    assert.equal(await held.settle(), 'delivered')
    assert.deepEqual(attempt.events, ['host-response', 'client-response'])
  } finally {
    await held.dispose()
  }
})
