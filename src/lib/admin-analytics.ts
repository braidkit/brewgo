export type AdminAnalytics = Readonly<{
  total_orders: number
  total_revenue_cents: number
  average_order_value_cents: number
  status_counts: Readonly<Record<string, number>>
  currency: 'USD'
}>

export type AnalyticsState =
  | Readonly<{ status: 'idle' | 'loading' | 'unauthorized' | 'error' }>
  | Readonly<{ status: 'success' | 'empty'; analytics: AdminAnalytics }>

export type AnalyticsClient = (url: string, options: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export const defaultAnalyticsClient: AnalyticsClient = (url, options) => fetch(url, options)

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function readAnalytics(value: unknown): AdminAnalytics {
  if (!value || typeof value !== 'object') throw new Error('Invalid analytics')
  const data = value as Record<string, unknown>
  if (!isCount(data.total_orders) || !isCount(data.total_revenue_cents) ||
      !isCount(data.average_order_value_cents) || data.currency !== 'USD' ||
      !data.status_counts || typeof data.status_counts !== 'object' || Array.isArray(data.status_counts)) {
    throw new Error('Invalid analytics')
  }
  const statuses = Object.entries(data.status_counts)
  if (statuses.some(([status, count]) => !status || !isCount(count)) ||
      statuses.reduce((sum, [, count]) => sum + (count as number), 0) !== data.total_orders ||
      (data.total_orders === 0 && (data.total_revenue_cents !== 0 || data.average_order_value_cents !== 0))) {
    throw new Error('Invalid analytics')
  }
  // Copy before freezing so neither validation nor view state changes the response.
  return Object.freeze({
    total_orders: data.total_orders,
    total_revenue_cents: data.total_revenue_cents,
    average_order_value_cents: data.average_order_value_cents,
    status_counts: Object.freeze(Object.fromEntries(statuses) as Record<string, number>),
    currency: 'USD',
  })
}

export async function loadAdminAnalytics(client: AnalyticsClient, token: string, signal?: AbortSignal) {
  const response = await client('/api/admin/analytics', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    credentials: 'omit',
    signal,
  })
  if (response.status === 401 || response.status === 403) return { status: 'unauthorized' } as const
  if (!response.ok) throw new Error('Unable to load analytics')
  return { status: 'success', analytics: readAnalytics(await response.json()) } as const
}

export function createAnalyticsController(client: AnalyticsClient = defaultAnalyticsClient) {
  let state: AnalyticsState = Object.freeze({ status: 'idle' })
  let token = ''
  let generation = 0
  let pending: AbortController | undefined
  let disposed = false
  const listeners = new Set<(state: AnalyticsState) => void>()

  function publish(next: AnalyticsState) {
    state = Object.freeze(next)
    listeners.forEach(listener => listener(state))
  }

  function cancel() {
    generation += 1
    pending?.abort()
    pending = undefined
  }

  return {
    getState: () => state,
    subscribe(listener: (state: AnalyticsState) => void) {
      if (!disposed) listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    async load(nextToken?: string) {
      if (disposed) return
      cancel()
      if (nextToken !== undefined) token = nextToken
      if (!token.trim()) {
        token = ''
        publish({ status: 'unauthorized' })
        return
      }
      const requestGeneration = generation
      pending = new AbortController()
      publish({ status: 'loading' })
      try {
        const result = await loadAdminAnalytics(client, token, pending.signal)
        if (disposed || requestGeneration !== generation) return
        if (result.status === 'unauthorized') {
          token = ''
          publish({ status: 'unauthorized' })
        } else {
          publish({ status: result.analytics.total_orders === 0 ? 'empty' : 'success', analytics: result.analytics })
        }
      } catch {
        if (!disposed && requestGeneration === generation) publish({ status: 'error' })
      } finally {
        if (requestGeneration === generation) pending = undefined
      }
    },
    clear() {
      if (disposed) return
      cancel()
      token = ''
      publish({ status: 'idle' })
    },
    dispose() {
      cancel()
      token = ''
      disposed = true
      listeners.clear()
      state = Object.freeze({ status: 'idle' })
    },
  }
}
