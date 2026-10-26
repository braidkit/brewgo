import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Coffee, LockKeyhole, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { money } from '@/lib/api'
import { createAnalyticsController, defaultAnalyticsClient, type AnalyticsClient, type AnalyticsState } from '@/lib/admin-analytics'

export default function AdminAnalytics({ fetchClient = defaultAnalyticsClient }: { fetchClient?: AnalyticsClient }) {
  const [state, setState] = useState<AnalyticsState>({ status: 'idle' })
  const [draftToken, setDraftToken] = useState('')
  const controller = useRef<ReturnType<typeof createAnalyticsController> | null>(null)

  useEffect(() => {
    const current = createAnalyticsController(fetchClient)
    controller.current = current
    setState(current.getState())
    setDraftToken('')
    const unsubscribe = current.subscribe(setState)
    return () => {
      unsubscribe()
      current.dispose()
      if (controller.current === current) controller.current = null
    }
  }, [fetchClient])

  function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = draftToken
    setDraftToken('')
    void controller.current?.load(token)
  }

  function clearAccess() {
    controller.current?.clear()
    setDraftToken('')
  }

  const report = state.status === 'success' || state.status === 'empty' ? state.analytics : null
  const needsToken = state.status === 'idle' || state.status === 'unauthorized'

  return <div className="admin-page">
    <a href="#admin-main" className="admin-skip-link">Skip to analytics</a>
    <header className="admin-header">
      <div className="admin-width admin-header-inner">
        <a href="/" className="admin-brand" aria-label="BrewGo Coffee home"><Coffee size={26} strokeWidth={1.7} aria-hidden="true" /><span>BrewGo<span>.</span></span></a>
        <span className="admin-area-label">Staff analytics</span>
        <a className="admin-shop-link" href="/"><ArrowLeft size={16} aria-hidden="true" />Back to shop</a>
      </div>
    </header>
    <main id="admin-main" tabIndex={-1} className="admin-width admin-main">
      <div className="admin-title-row">
        <div><h1>Order analytics</h1><p>All orders, with a clear view of completed sales.</p></div>
        <span className="admin-sample-label">Sample store · Simulated payments</span>
      </div>

      {needsToken ? <section className="admin-access" aria-labelledby="admin-access-title">
        <LockKeyhole size={24} strokeWidth={1.6} aria-hidden="true" />
        <h2 id="admin-access-title">Admin access</h2>
        <p>Enter your access token to view the store’s order totals.</p>
        {state.status === 'unauthorized' && <p className="admin-alert" role="alert">Access denied. Check your admin token and try again.</p>}
        <form onSubmit={unlock} className="admin-access-form">
          <label htmlFor="admin-token">Admin token</label>
          <Input id="admin-token" type="password" autoComplete="off" autoCapitalize="none" spellCheck={false} value={draftToken} onChange={event => setDraftToken(event.target.value)} required aria-describedby="admin-token-note" />
          <Button type="submit" disabled={!draftToken.trim()}>View analytics</Button>
        </form>
        <p id="admin-token-note" className="admin-help">Your token stays in memory until you clear access or leave this page.</p>
      </section> : <>
        <div className="admin-toolbar">
          <p><LockKeyhole size={15} aria-hidden="true" />Admin access in this tab</p>
          <div><Button type="button" variant="outline" onClick={() => { void controller.current?.load() }} disabled={state.status === 'loading'}><RefreshCw size={15} aria-hidden="true" />Refresh</Button><Button type="button" variant="ghost" onClick={clearAccess}>Clear access</Button></div>
        </div>
        <section aria-label="Analytics report" aria-busy={state.status === 'loading'}>
          {state.status === 'loading' && <div className="admin-loading" role="status"><p>Loading analytics…</p><div className="admin-loading-totals" aria-hidden="true">{[0, 1, 2].map(index => <Skeleton key={index} className="admin-skeleton-total" />)}</div><Skeleton className="admin-skeleton-table" aria-hidden="true" /></div>}
          {state.status === 'error' && <div className="admin-error" role="alert"><h2>Analytics could not load.</h2><p>Please try again. Your store’s orders have not changed.</p><Button type="button" onClick={() => { void controller.current?.load() }}>Try again</Button></div>}
          {report && <>
            <p className="admin-report-status" role="status">{state.status === 'empty' ? 'No orders yet. Totals will appear here after the first order.' : 'Analytics loaded. All recorded orders are included.'}</p>
            <dl className="admin-totals">
              <div><dt>Total orders</dt><dd><span className="admin-total-value">{report.total_orders.toLocaleString('en-US')}</span><span className="admin-total-note">All order statuses</span></dd></div>
              <div><dt>Revenue</dt><dd><span className="admin-total-value">{money(report.total_revenue_cents)}</span><span className="admin-total-note">Completed orders, before tax</span></dd></div>
              <div><dt>Average order value</dt><dd><span className="admin-total-value">{money(report.average_order_value_cents)}</span><span className="admin-total-note">Per completed order, before tax</span></dd></div>
            </dl>
            <div className="admin-status-heading"><h2>Orders by status</h2><span>All time</span></div>
            <table className="admin-status-table"><caption className="sr-only">Number of orders in each status, sorted alphabetically</caption><thead><tr><th scope="col">Status</th><th scope="col">Orders</th></tr></thead><tbody>
              {Object.keys(report.status_counts).sort().map(status => <tr key={status}><th scope="row">{status.replace(/[_-]+/g, ' ')}</th><td>{report.status_counts[status].toLocaleString('en-US')}</td></tr>)}
              {state.status === 'empty' && <tr><td colSpan={2} className="admin-empty">No order statuses to show.</td></tr>}
            </tbody><tfoot><tr><th scope="row">Total</th><td>{report.total_orders.toLocaleString('en-US')}</td></tr></tfoot></table>
            <p className="admin-definition">Revenue and average order value use completed orders only. Confirmed, cancelled, and refunded orders do not contribute to sales totals. All amounts are in USD.</p>
          </>}
        </section>
      </>}
      <p className="admin-footnote">BrewGo is a sample store. Payments are simulated and no orders reach a real cafe.</p>
    </main>
  </div>
}
