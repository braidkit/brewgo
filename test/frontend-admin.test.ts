import test from 'node:test'
import assert from 'node:assert/strict'
import { createAnalyticsController, loadAdminAnalytics, type AdminAnalytics, type AnalyticsClient, type AnalyticsState } from '../src/lib/admin-analytics.ts'

const analytics: AdminAnalytics = Object.freeze({
  total_orders: 6,
  total_revenue_cents: 1234,
  average_order_value_cents: 617,
  status_counts: Object.freeze({ refunded: 1, completed: 2, cancelled: 1, confirmed: 2 }),
  currency: 'USD',
})
const empty: AdminAnalytics = Object.freeze({ total_orders: 0, total_revenue_cents: 0, average_order_value_cents: 0, status_counts: Object.freeze({}), currency: 'USD' })

function response(body: unknown = analytics, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('loader requests the protected read-only endpoint through the injected client', async () => {
  let calls = 0
  const client: AnalyticsClient = async (url, options) => {
    calls += 1
    assert.equal(url, '/api/admin/analytics')
    assert.equal(options.method, 'GET')
    assert.deepEqual(options.headers, { Authorization: 'Bearer test-access' })
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'omit')
    assert.equal(options.body, undefined)
    return response()
  }
  assert.deepEqual(await loadAdminAnalytics(client, 'test-access'), { status: 'success', analytics })
  assert.equal(calls, 1)
})

test('frozen response data remains unchanged and view state owns a separate immutable snapshot', async () => {
  const original = JSON.stringify(analytics)
  const result = await loadAdminAnalytics(async () => response(), 'token')
  assert.equal(result.status, 'success')
  if (result.status !== 'success') return
  assert.equal(JSON.stringify(analytics), original)
  assert.notEqual(result.analytics, analytics)
  assert.notEqual(result.analytics.status_counts, analytics.status_counts)
  assert.ok(Object.isFrozen(result.analytics))
  assert.ok(Object.isFrozen(result.analytics.status_counts))
})

test('later response mutations cannot change an already published report', async () => {
  const data = { ...analytics, status_counts: { ...analytics.status_counts } }
  const controller = createAnalyticsController(async () => response(data))
  await controller.load('token')
  data.total_orders = 999
  data.status_counts.completed = 999
  assert.deepEqual(controller.getState(), { status: 'success', analytics })
})

test('controller publishes deterministic idle, loading, and success states without exposing its token', async () => {
  const controller = createAnalyticsController(async () => response())
  const states: AnalyticsState[] = []
  controller.subscribe(state => states.push(state))
  assert.deepEqual(controller.getState(), { status: 'idle' })
  await controller.load('private-access')
  assert.deepEqual(states, [{ status: 'loading' }, { status: 'success', analytics }])
  assert.equal(JSON.stringify(states).includes('private-access'), false)
  assert.ok(states.every(Object.isFrozen))
})

test('an empty repository produces the empty state with zero totals', async () => {
  const controller = createAnalyticsController(async () => response(empty))
  await controller.load('token')
  assert.deepEqual(controller.getState(), { status: 'empty', analytics: empty })
})

for (const status of [401, 403]) {
  test(`HTTP ${status} always produces unauthorized and clears the saved token`, async () => {
    let calls = 0
    const controller = createAnalyticsController(async () => {
      calls += 1
      return { ...response(undefined, status), json: async () => { throw new Error('Must not read a forbidden body') } }
    })
    await controller.load('bad-token')
    assert.deepEqual(controller.getState(), { status: 'unauthorized' })
    await controller.load()
    assert.equal(calls, 1)
    assert.deepEqual(controller.getState(), { status: 'unauthorized' })
  })
}

test('missing or whitespace-only tokens do not issue a request', async () => {
  let calls = 0
  const controller = createAnalyticsController(async () => { calls += 1; return response() })
  await controller.load()
  await controller.load('   ')
  assert.equal(calls, 0)
  assert.deepEqual(controller.getState(), { status: 'unauthorized' })
})

test('network and HTTP failures expose only a safe deterministic error state', async () => {
  for (const client of [async () => { throw new Error('secret server diagnostics') }, async () => response({ detail: 'secret server diagnostics' }, 500)]) {
    const controller = createAnalyticsController(client)
    await controller.load('token')
    assert.deepEqual(controller.getState(), { status: 'error' })
  }
})

test('invalid JSON and malformed analytics cannot render a successful report', async () => {
  const invalidBodies = [null, [], {}, { ...analytics, total_orders: -1 }, { ...analytics, total_revenue_cents: 12.5 }, { ...analytics, average_order_value_cents: NaN }, { ...analytics, currency: 'EUR' }, { ...analytics, status_counts: [] }, { ...analytics, status_counts: { completed: '6' } }, { ...analytics, status_counts: { completed: 1 } }, { ...empty, total_revenue_cents: 100 }]
  for (const body of invalidBodies) {
    const controller = createAnalyticsController(async () => response(body))
    await controller.load('token')
    assert.deepEqual(controller.getState(), { status: 'error' })
  }
  const controller = createAnalyticsController(async () => ({ ...response(), json: async () => { throw new SyntaxError('Invalid JSON') } }))
  await controller.load('token')
  assert.deepEqual(controller.getState(), { status: 'error' })
})

test('refresh and retry reuse the in-memory token and can recover from failure', async () => {
  let calls = 0
  const controller = createAnalyticsController(async (_, options) => {
    assert.deepEqual(options.headers, { Authorization: 'Bearer test-access' })
    calls += 1
    return calls === 1 ? response({}, 503) : response()
  })
  await controller.load('test-access')
  assert.deepEqual(controller.getState(), { status: 'error' })
  await controller.load()
  assert.deepEqual(controller.getState(), { status: 'success', analytics })
  await controller.load()
  assert.equal(calls, 3)
})

test('a newer response wins even when an older client ignores abort', async () => {
  const old = deferred<ReturnType<typeof response>>()
  let calls = 0
  let previousSignal: AbortSignal | undefined
  const controller = createAnalyticsController(async (_, options) => {
    calls += 1
    if (calls === 1) { previousSignal = options.signal!; return old.promise }
    return response(empty)
  })
  const first = controller.load('old-token')
  const second = controller.load('new-token')
  assert.equal(previousSignal?.aborted, true)
  await second
  old.resolve(response())
  await first
  assert.deepEqual(controller.getState(), { status: 'empty', analytics: empty })
})

test('stale failures and unauthorized responses never replace a newer successful report', async () => {
  for (const stale of ['network', 'forbidden'] as const) {
    const old = deferred<ReturnType<typeof response>>()
    let calls = 0
    const controller = createAnalyticsController(async () => ++calls === 1 ? old.promise : response())
    const first = controller.load('old')
    await controller.load('new')
    if (stale === 'network') old.reject(new Error('Old failure'))
    else old.resolve(response({}, 403))
    await first
    assert.deepEqual(controller.getState(), { status: 'success', analytics })
    await controller.load()
    assert.deepEqual(controller.getState(), { status: 'success', analytics })
  }
})

test('stale JSON continuations cannot overwrite a newer response', async () => {
  const oldBody = deferred<unknown>()
  const reading = deferred<void>()
  let calls = 0
  const controller = createAnalyticsController(async () => ++calls === 1 ? {
    ...response(), json: () => { reading.resolve(); return oldBody.promise },
  } : response(empty))
  const first = controller.load('old')
  await reading.promise
  await controller.load('new')
  oldBody.resolve(analytics)
  await first
  assert.deepEqual(controller.getState(), { status: 'empty', analytics: empty })
})

test('stale invalid JSON cannot turn a newer success into an error', async () => {
  const oldBody = deferred<unknown>()
  const reading = deferred<void>()
  let calls = 0
  const controller = createAnalyticsController(async () => ++calls === 1 ? {
    ...response(), json: () => { reading.resolve(); return oldBody.promise },
  } : response())
  const first = controller.load('old')
  await reading.promise
  await controller.load('new')
  oldBody.reject(new SyntaxError('Old malformed JSON'))
  await first
  assert.deepEqual(controller.getState(), { status: 'success', analytics })
})

test('clear aborts pending work, removes report and token, and ignores late completion', async () => {
  const pending = deferred<ReturnType<typeof response>>()
  let calls = 0
  let signal: AbortSignal | undefined
  const controller = createAnalyticsController(async (_, options) => { calls += 1; signal = options.signal!; return pending.promise })
  const load = controller.load('token')
  controller.clear()
  assert.equal(signal?.aborted, true)
  assert.deepEqual(controller.getState(), { status: 'idle' })
  pending.resolve(response())
  await load
  assert.deepEqual(controller.getState(), { status: 'idle' })
  await controller.load()
  assert.equal(calls, 1)
  assert.deepEqual(controller.getState(), { status: 'unauthorized' })
})

test('unsubscribe and dispose stop notifications and dispose clears state and access', async () => {
  const pending = deferred<ReturnType<typeof response>>()
  let calls = 0
  let notices = 0
  let signal: AbortSignal | undefined
  const controller = createAnalyticsController(async (_, options) => { calls += 1; signal = options.signal!; return pending.promise })
  const unsubscribe = controller.subscribe(() => { notices += 1 })
  const load = controller.load('token')
  assert.equal(notices, 1)
  unsubscribe()
  controller.dispose()
  assert.equal(signal?.aborted, true)
  assert.deepEqual(controller.getState(), { status: 'idle' })
  pending.resolve(response())
  await load
  controller.subscribe(() => { notices += 1 })
  await controller.load('new-token')
  controller.clear()
  assert.equal(calls, 1)
  assert.equal(notices, 1)
  assert.deepEqual(controller.getState(), { status: 'idle' })
})
