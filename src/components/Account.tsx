import { useEffect, useState } from 'react'
import { ArrowRight, Coffee, LogOut, ReceiptText, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { api, type Customer, type Order, money } from '@/lib/api'

export default function Account({ customer, onCustomer, onClose }: { customer: Customer | null; onCustomer: (customer: Customer | null) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    api<{ orders: Order[] }>('/orders').then(data => setOrders(data.orders)).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [customer])
  async function create(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const data = await api<{ customer: Customer }>('/account/demo', { method: 'POST', body: JSON.stringify({ name }) }); onCustomer(data.customer) }
    catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') } finally { setBusy(false) }
  }
  async function signOut() {
    setBusy(true); setError('')
    try { await api('/account/session', { method: 'DELETE' }); onCustomer(null) }
    catch (err) { setError(err instanceof Error ? err.message : 'Please try again.') } finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="account-dialog"><DialogHeader><div className="dialog-icon"><UserRound /></div><DialogTitle>{customer ? `Hey, ${customer.name}.` : 'Make yourself a regular.'}</DialogTitle><DialogDescription>{customer ? 'Your coffee runs, all in one place.' : 'Try a demo profile, or keep ordering as a guest.'}</DialogDescription></DialogHeader>
    {!customer ? <form onSubmit={create} className="account-form"><div className="field"><Label htmlFor="account-name">First name</Label><Input id="account-name" value={name} onChange={e => setName(e.target.value)} maxLength={50} placeholder="Your name" autoComplete="given-name" required /></div><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating profile…' : 'Create a demo profile'}<ArrowRight size={17} /></Button><p className="demo-footnote">Sample profile only. No email or password needed. This browser stays signed in for 24 hours.</p></form> : <Button variant="outline" onClick={signOut} disabled={busy}><LogOut size={16} />{busy ? 'Signing out…' : 'Sign out'}</Button>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <h3 className="history-title"><ReceiptText size={19} />Your orders</h3>
    {loading ? <p className="muted-text" role="status">Loading your orders…</p> : orders.length ? <div className="history-list">{orders.map(order => <div className="history-item" key={order.id}><div><strong>{order.number}<span className="history-status">Confirmed</span></strong><p>{order.store.name} · {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p><small>{order.items.map(item => `${item.quantity} × ${item.name}`).join(', ')}</small></div><strong>{money(order.total)}</strong></div>)}</div> : <div className="history-empty"><Coffee size={27} strokeWidth={1.4} /><p>Your first coffee run starts here.</p><small>Orders from this browser will appear here.</small></div>}
  </DialogContent></Dialog>
}
