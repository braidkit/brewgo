import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight, BarChart3, CalendarDays, Coffee, LayoutDashboard, LogOut, MapPin, RefreshCw, ShieldCheck, ShoppingBag, Users, Utensils } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, ApiError } from '@/lib/api'
import './admin.css'

type Admin = { id: string; username: string; role: 'admin' }
type Store = { id: string; name: string; city: string }
type Selection = { from: string; to: string; storeId: string; granularity: string }
type Series = { date: string; revenue: number; orders: number }
type Report = {
  range: { from: string; to: string }; generatedAt: string; cacheSeconds: number;
  totals?: { revenue?: number; orders?: number; avgOrderValue?: number; newCustomers: number; customers?: number; repeatCustomers?: number; repeatRate?: number; guestOrders?: number };
  series?: Series[];
  products?: { id: string; name: string; revenue: number; units: number }[];
  statuses?: { status: string; count: number }[];
  stores?: (Store & { revenue: number; orders: number; avgOrderValue: number })[];
}
const pages = [
  { id: 'overview', path: '/admin', title: 'Overview', description: 'A clear view of your coffee business.', icon: LayoutDashboard },
  { id: 'sales', path: '/admin/sales', title: 'Sales', description: 'Follow sales over time, one cup at a time.', icon: BarChart3 },
  { id: 'products', path: '/admin/products', title: 'Products', description: 'See what your customers keep coming back for.', icon: Utensils },
  { id: 'orders', path: '/admin/orders', title: 'Orders', description: 'Understand the status of every order in your range.', icon: ShoppingBag },
  { id: 'customers', path: '/admin/customers', title: 'Customers', description: 'Get to know the people behind the orders.', icon: Users },
  { id: 'stores', path: '/admin/stores', title: 'Stores', description: 'Compare performance across your cafés.', icon: MapPin },
]
const dollars = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const number = (value: number) => new Intl.NumberFormat('en-US').format(value)
const dayLabel = (value: string) => {
  const day = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(day.getTime()) ? day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : value
}
function initialSelection(): Selection {
  const params = new URLSearchParams(location.search)
  const to = new Date(), from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 29)
  return { from: params.get('from') ?? from.toISOString().slice(0, 10), to: params.get('to') ?? to.toISOString().slice(0, 10), storeId: params.get('storeId') ?? '', granularity: params.get('granularity') ?? 'day' }
}
function query(selection: Selection) {
  const params = new URLSearchParams({ from: selection.from, to: selection.to, granularity: selection.granularity })
  if (selection.storeId) params.set('storeId', selection.storeId)
  return params.toString()
}
function Brand() {
  return <a className="brand" href="/" aria-label="BrewGo Coffee home"><span className="brand-mark"><Coffee size={25} strokeWidth={1.7} /></span><span>BrewGo<span className="brand-dot">.</span><small>COFFEE</small></span></a>
}
function Metrics({ items }: { items: { label: string; value: string; note: string }[] }) {
  return <dl className={`admin-metrics admin-metrics-${items.length}`}>{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd title={item.value}>{item.value}</dd><p>{item.note}</p></div>)}</dl>
}
function Panel({ title, note, children, action }: { title: string; note?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{action}</div>{children}</section>
}
function Empty({ subject = 'orders' }: { subject?: string }) {
  return <div className="admin-empty"><Coffee size={30} strokeWidth={1.5} /><h3>No {subject} in this range</h3><p>Choose another date range or store. Reports use saved orders from BrewGo.</p></div>
}
function DataTable({ caption, headings, rows }: { caption: string; headings: string[]; rows: ReactNode[][] }) {
  return <div className="admin-table-scroll" tabIndex={0} role="region" aria-label={caption}><table className="admin-table"><caption className="sr-only">{caption}</caption><thead><tr>{headings.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => column === 0 ? <th scope="row" key={column}>{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table></div>
}
function SalesTrend({ series, granularity }: { series: Series[]; granularity: string }) {
  const hasOrders = series.some(point => point.orders > 0)
  return <>{hasOrders ? <div className="admin-line-chart" aria-label={`Sales before tax by ${granularity}. Exact values follow in the data table.`}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={series} margin={{ top: 16, right: 16, bottom: 8, left: 4 }} accessibilityLayer>
      <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 5" />
      <XAxis dataKey="date" tickFormatter={dayLabel} tickLine={false} axisLine={false} minTickGap={35} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} dy={10} />
      <YAxis tickFormatter={value => `$${number(value)}`} tickLine={false} axisLine={false} width={76} tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }} />
      <Tooltip labelFormatter={value => dayLabel(String(value))} formatter={value => [dollars(Number(value)), 'Sales before tax']} contentStyle={{ borderRadius: 8, borderColor: 'var(--border)' }} />
      <Line name="Sales before tax" type="monotone" dataKey="revenue" stroke="var(--primary)" strokeWidth={2.5} dot={series.length < 3} activeDot={{ r: 5 }} isAnimationActive={false} />
    </LineChart></ResponsiveContainer>
  </div> : <Empty />}<details className="admin-chart-data"><summary>View {granularity === 'day' ? 'daily' : granularity === 'week' ? 'weekly' : 'monthly'} values</summary><DataTable caption="Sales trend values" headings={['Period start (UTC)', 'Orders', 'Sales before tax']} rows={series.map(point => [point.date, number(point.orders), dollars(point.revenue)])} /></details></>
}
function ComparisonChart({ data, label, currency = true }: { data: { name: string; value: number }[]; label: string; currency?: boolean }) {
  return <div className="admin-bar-chart" aria-label={label}><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }} accessibilityLayer>
    <CartesianGrid stroke="var(--border)" horizontal={false} strokeDasharray="3 5" />
    <XAxis type="number" tickFormatter={value => currency ? `$${number(value)}` : number(value)} tickLine={false} axisLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }} allowDecimals={currency} />
    <YAxis type="category" dataKey="name" width={135} tickLine={false} axisLine={false} tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
    <Tooltip formatter={value => [currency ? dollars(Number(value)) : number(Number(value)), currency ? 'Sales before tax' : 'Orders']} cursor={{ fill: 'var(--secondary)' }} contentStyle={{ borderRadius: 8, borderColor: 'var(--border)' }} />
    <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={22} isAnimationActive={false} />
  </BarChart></ResponsiveContainer></div>
}

export default function AdminDashboard() {
  const [path, setPath] = useState(location.pathname.replace(/\/$/, '') || '/')
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authAttempt, setAuthAttempt] = useState(0)
  const [selection, setSelection] = useState(initialSelection)
  const [filterError, setFilterError] = useState('')
  const [report, setReport] = useState<{ key: string; data: Report; sales?: Report } | null>(null)
  const [reportError, setReportError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [sessionNotice, setSessionNotice] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const page = pages.find(page => page.path === path)
  const isLogin = path === '/admin/login'
  const reportKey = `${page?.id}:${query(selection)}`

  function navigate(next: string, replace = false) {
    if (replace) history.replaceState(null, '', next)
    else history.pushState(null, '', next)
    setPath(location.pathname)
  }
  function signInRequired(message = '') {
    setAdmin(null); setReport(null); setSessionNotice(message)
    const next = pages.some(page => page.path === location.pathname) ? location.pathname + location.search : '/admin'
    navigate(`/admin/login?next=${encodeURIComponent(next)}`, true)
  }
  useEffect(() => {
    const onPop = () => { setPath(location.pathname); const value = initialSelection(); setSelection(value) }
    addEventListener('popstate', onPop)
    return () => removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setAuthLoading(true); setAuthError('')
    api<{ admin: Admin; stores: Store[] }>('/admin/session', { signal: controller.signal }).then(result => {
      setAdmin(result.admin); setStores(result.stores)
      if (location.pathname === '/admin/login') {
        const next = new URLSearchParams(location.search).get('next') ?? '/admin'
        navigate(pages.some(page => page.path === next.split('?')[0]) ? next : '/admin', true)
        const value = initialSelection(); setSelection(value)
      }
    }).catch(error => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && [401, 403].includes(error.status)) {
        if (location.pathname !== '/admin/login') signInRequired()
      } else setAuthError(error.message || 'Could not verify your admin session.')
    }).finally(() => { if (!controller.signal.aborted) setAuthLoading(false) })
    return () => controller.abort()
  }, [authAttempt])
  useEffect(() => {
    document.title = `${isLogin ? 'Admin sign in' : page?.title ?? 'Page not found'} | BrewGo Coffee`
    if (admin) heading.current?.focus()
  }, [path, admin, isLogin, page?.title])
  useEffect(() => {
    if (!admin || !page) return
    const controller = new AbortController()
    setLoading(true); setReportError('')
    const suffix = `?${query(selection)}`
    Promise.all([
      api<Report>(`/admin/analytics/${page.id}${suffix}`, { signal: controller.signal }),
      page.id === 'overview' ? api<Report>(`/admin/analytics/sales${suffix}`, { signal: controller.signal }) : Promise.resolve(undefined),
    ]).then(([data, sales]) => setReport({ key: reportKey, data, sales })).catch(error => {
      if (controller.signal.aborted) return
      if (error instanceof ApiError && [401, 403].includes(error.status)) signInRequired('Your admin session ended. Sign in to continue.')
      else setReportError(error.message || 'Could not load this report.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [admin, page?.id, reportKey, attempt])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoginBusy(true); setAuthError('')
    const fields = new FormData(event.currentTarget)
    try {
      await api('/admin/session', { method: 'POST', body: JSON.stringify({ username: fields.get('username'), password: fields.get('password') }) })
      setAuthAttempt(value => value + 1)
    } catch (error) { setAuthError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.') }
    finally { setLoginBusy(false) }
  }
  async function logout() {
    setLogoutBusy(true); setReportError('')
    try { await api('/admin/session', { method: 'DELETE' }); signInRequired() }
    catch (error) {
      if (error instanceof ApiError && [401, 403].includes(error.status)) signInRequired()
      else setReportError('Could not sign out. Please try again.')
    } finally { setLogoutBusy(false) }
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const next = { from: String(fields.get('from')), to: String(fields.get('to')), storeId: String(fields.get('storeId')), granularity: String(fields.get('granularity')) }
    const span = (Date.parse(next.to) - Date.parse(next.from)) / 86400000
    if (!Number.isFinite(span) || span < 0 || span > 365) { setFilterError('Choose a date range of 1–366 days, with the start before the end.'); return }
    setFilterError(''); setSelection(next)
    history.replaceState(null, '', `${path}?${query(next)}`)
  }
  function openPage(event: MouseEvent<HTMLAnchorElement>, target: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); setFilterError(''); navigate(`${target}?${query(selection)}`)
  }

  if (authLoading) return <div className="admin-auth"><Brand /><div role="status" aria-label="Checking admin access"><Skeleton className="admin-auth-skeleton" /><p>Checking admin access…</p></div></div>
  if (!admin) return <div className="admin-auth"><Brand /><main className="admin-login"><span className="admin-lock"><ShieldCheck size={25} /></span><h1>Welcome back.</h1><p>Sign in to your BrewGo admin console.</p>{sessionNotice && <p role="status" className="admin-session-notice">{sessionNotice}</p>}{authError && <p className="error-message" role="alert">{authError}</p>}
    {isLogin ? <form onSubmit={login}><label htmlFor="admin-username">Username</label><Input id="admin-username" name="username" autoComplete="username" required maxLength={80} autoFocus /><label htmlFor="admin-password">Password</label><Input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} /><Button type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in'}<ArrowUpRight size={16} /></Button></form> : <Button onClick={() => setAuthAttempt(value => value + 1)}>Retry connection</Button>}
    <p className="admin-login-help">Access is limited to provisioned admin accounts. Ask your BrewGo administrator if you need access.</p><a href="/" className="admin-back"><ArrowLeft size={15} />Back to the menu</a></main><p className="admin-auth-foot">BrewGo Coffee · Admin console</p></div>

  const data = report?.key === reportKey ? report.data : null
  const totals = data?.totals
  const busy = loading || (!data && !reportError)
  return <div className="admin-shell"><a className="skip-link" href="#admin-content">Skip to report</a><aside className="admin-sidebar"><Brand /><div className="admin-workspace"><span className="admin-workspace-icon"><Coffee size={18} /></span><span>BrewGo Coffee<small>Business analytics</small></span><ShieldCheck size={16} /></div><nav aria-label="Admin navigation">{pages.map(item => <a key={item.id} href={`${item.path}?${query(selection)}`} onClick={event => openPage(event, item.path)} aria-current={page?.id === item.id ? 'page' : undefined}><item.icon size={18} strokeWidth={1.7} />{item.title}</a>)}</nav><div className="admin-sidebar-bottom"><a href="/"><ArrowUpRight size={17} />Open coffee menu</a><p><ShieldCheck size={15} />Admin access only</p></div></aside>
    <div className="admin-body"><header className="admin-topbar"><span>Admin console <span aria-hidden="true">/</span> <strong>{page?.title ?? 'Page not found'}</strong></span><div><span className="admin-avatar" aria-hidden="true">{admin.username.slice(0, 2).toUpperCase()}</span><span className="admin-username">{admin.username}</span><Button variant="ghost" onClick={logout} disabled={logoutBusy}><LogOut size={16} />{logoutBusy ? 'Signing out…' : 'Sign out'}</Button></div></header>
      <main id="admin-content" className="admin-content"><div className="admin-page-heading"><div><h1 ref={heading} tabIndex={-1}>{page?.title ?? 'Page not found'}</h1><p>{page?.description ?? 'Choose a report from the navigation.'}</p></div><span className="admin-data-badge"><span />Simulated payments</span></div>
        {page && <><form key={reportKey} className="admin-filters" onSubmit={applyFilters}><div className="admin-filter-label"><CalendarDays size={17} /><span>Report period</span></div><label>From<Input aria-label="From date" name="from" type="date" required defaultValue={selection.from} /></label><label>To<Input aria-label="To date" name="to" type="date" required defaultValue={selection.to} /></label><label>Café<select aria-label="Café" name="storeId" defaultValue={selection.storeId}><option value="">All cafés</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name} · {store.city}</option>)}</select></label><label>Group by<select aria-label="Group by" name="granularity" defaultValue={selection.granularity}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option></select></label><Button type="submit" disabled={loading}>Apply filters</Button></form>
          {filterError && <p className="error-message" role="alert">{filterError}</p>}<div className="admin-report-meta"><span>{dayLabel(selection.from)} – {dayLabel(selection.to)}, {selection.to.slice(0, 4)} · UTC</span><span>USD · Sales before tax</span></div>
          <div aria-busy={busy} aria-label={`${page.title} report`}>
            {reportError ? <div className="admin-report-error" role="alert"><h2>We couldn’t load this report.</h2><p>{reportError}</p><Button variant="outline" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />Try again</Button></div> : busy ? <div role="status" aria-label="Loading report" className="admin-loading"><div>{[0, 1, 2, 3].map(item => <Skeleton key={item} className="admin-metric-skeleton" />)}</div><Skeleton className="admin-chart-skeleton" /><span className="sr-only">Loading report…</span></div> : data && <>
              {page.id === 'overview' && <><Metrics items={[{ label: 'Sales before tax', value: dollars(totals?.revenue ?? 0), note: 'Excludes cancelled & refunded orders' }, { label: 'Total orders', value: number(totals?.orders ?? 0), note: 'All order statuses' }, { label: 'Average order value', value: dollars(totals?.avgOrderValue ?? 0), note: 'Before tax, for sales orders' }, { label: 'New customers', value: number(totals?.newCustomers ?? 0), note: 'New saved profiles in this period' }]} /><Panel title="Sales trend" note="Sales before tax across the selected period." action={<a className="admin-text-link" href={`/admin/sales?${query(selection)}`} onClick={event => openPage(event, '/admin/sales')}>Explore sales<ArrowUpRight size={15} /></a>}><SalesTrend series={report?.sales?.series ?? []} granularity={selection.granularity} /></Panel></>}
              {page.id === 'sales' && <><Metrics items={[{ label: 'Sales before tax', value: dollars(data.series?.reduce((sum, row) => sum + row.revenue, 0) ?? 0), note: 'Excludes cancelled & refunded orders' }, { label: 'Total orders', value: number(data.series?.reduce((sum, row) => sum + row.orders, 0) ?? 0), note: 'All order statuses in this period' }]} /><Panel title="Sales over time" note={`Grouped by ${selection.granularity}. Weeks start on Monday; partial periods stay within your filters.`}><SalesTrend series={data.series ?? []} granularity={selection.granularity} /></Panel></>}
              {page.id === 'products' && <Panel title="Your best sellers" note="Ranked by sales before tax. Includes paid simulated orders; excludes cancelled and refunded orders.">{data.products?.length ? <><ComparisonChart label="Top six products by sales before tax. Exact values in the table below." data={data.products.slice(0, 6).map(product => ({ name: product.name, value: product.revenue }))} /><DataTable caption="Product performance" headings={['Product', 'Units sold', 'Sales before tax']} rows={data.products.map(product => [product.name, number(product.units), dollars(product.revenue)])} /></> : <Empty subject="product sales" />}</Panel>}
              {page.id === 'orders' && <Panel title="Order status" note="Counts reflect the status stored on each order. New BrewGo orders are confirmed.">{data.statuses?.some(row => row.count) ? <ComparisonChart currency={false} label="Orders by status. Exact counts in the table below." data={data.statuses.map(row => ({ name: row.status, value: row.count }))} /> : <Empty />}<DataTable caption="Orders by status" headings={['Status', 'Orders', 'Share of orders']} rows={(data.statuses ?? []).map(row => [<span className={`admin-status ${row.status === 'cancelled' || row.status === 'refunded' ? 'admin-status-quiet' : ''}`}>{row.status}</span>, number(row.count), `${(row.count / ((data.statuses ?? []).reduce((sum, item) => sum + item.count, 0) || 1) * 100).toFixed(1)}%`])} /></Panel>}
              {page.id === 'customers' && <><Metrics items={[{ label: 'New customers', value: number(totals?.newCustomers ?? 0), note: 'Saved profiles created in this period' }, { label: 'Ordering customers', value: number(totals?.customers ?? 0), note: 'Saved profiles with an order in this range' }, { label: 'Repeat customer rate', value: `${totals?.repeatRate ?? 0}%`, note: 'Ordering profiles with 2+ orders in range' }, { label: 'Guest orders', value: number(totals?.guestOrders ?? 0), note: 'Orders without a saved profile' }]} /><Panel title="Customer activity" note="A customer is a saved BrewGo profile. Pickup names are never used to identify a person.">{totals?.customers ? <><div className="admin-repeat"><div><strong>{totals.repeatRate}%</strong><p>of ordering customers placed more than one order</p></div><div className="admin-repeat-track" role="meter" aria-label="Repeat customer rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={totals.repeatRate}><span style={{ width: `${totals.repeatRate}%` }} /></div></div><DataTable caption="Customer activity" headings={['Customer group', 'Saved profiles']} rows={[["One order", number((totals.customers ?? 0) - (totals.repeatCustomers ?? 0))], ['Two or more orders', number(totals.repeatCustomers ?? 0)]]} /></> : <Empty subject="customer orders" />}<p className="admin-panel-note">New profiles are counted by creation date. With a café filter, they must also have ordered there in this period. Guest orders are excluded from the repeat rate.</p></Panel></>}
              {page.id === 'stores' && <Panel title="Café performance" note="Compare sales and orders. Cafés with no orders remain visible.">{data.stores?.some(store => store.orders) ? <ComparisonChart label="Café sales before tax. Exact values in the table below." data={data.stores.map(store => ({ name: `${store.name}`, value: store.revenue }))} /> : <Empty />}<DataTable caption="Café performance" headings={['Café', 'City', 'Orders', 'Sales before tax', 'Avg. order value']} rows={(data.stores ?? []).map(store => [store.name, store.city, number(store.orders), dollars(store.revenue), dollars(store.avgOrderValue)])} /></Panel>}
            </>}
          </div><div className="admin-report-footer"><p><ShieldCheck size={14} />Read-only analytics · Sample stores and simulated payments</p>{data && !busy && !reportError && <span>Calculated {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC · Cached for up to 5 min</span>}</div>
        </>}
      </main>
    </div>
  </div>
}
