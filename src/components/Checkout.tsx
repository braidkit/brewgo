import { useState } from 'react'
import { ArrowRight, Check, Clock3, MapPin, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { api, type CartItem, type Catalog, type Customer, type Order, type Store, money, unitPrice, optionsText } from '@/lib/api'

export default function Checkout({ cart, catalog, store, customer, onClose, onSuccess }: {
  cart: CartItem[]; catalog: Catalog; store: Store; customer: Customer | null; onClose: () => void; onSuccess: (order: Order) => void;
}) {
  const [name, setName] = useState(customer?.name ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [requestKey] = useState(() => crypto.randomUUID())
  const subtotal = cart.reduce((total, item) => total + unitPrice(item, catalog.menu.find(p => p.id === item.product_id)!, catalog) * item.quantity, 0)
  const tax = Math.floor((subtotal * 825 + 5000) / 10000)
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    if (!name.trim()) { setError('Enter a name so we know who to call.'); return }
    setLoading(true); setError('')
    try {
      const order = await api<Order>('/orders', { method: 'POST', body: JSON.stringify({ store_id: store.id, customer_name: name.trim(), items: cart, request_key: requestKey }) })
      onSuccess(order)
    } catch (err) { setError(err instanceof Error ? err.message : 'Please try again.'); setLoading(false) }
  }
  return <Dialog open onOpenChange={open => !open && !loading && onClose()}><DialogContent className="checkout-dialog" onInteractOutside={event => loading && event.preventDefault()}>
    <DialogHeader><DialogTitle>Review your order.</DialogTitle><DialogDescription>Check your items, pickup cafe, and total.</DialogDescription></DialogHeader>
    <div className="checkout-store"><MapPin size={21} /><div><strong>{store.name}, {store.city}</strong><p>{store.address}</p><span><Clock3 size={14} />Ready in {store.wait_minutes}–{store.wait_minutes + 3} min</span></div></div>
    <div className="checkout-items">{cart.map((item, index) => { const product = catalog.menu.find(p => p.id === item.product_id)!; return <div key={index}><span><strong>{item.quantity} × {product.name}</strong><small>{optionsText(item, product)}</small></span><span>{money(unitPrice(item, product, catalog) * item.quantity)}</span></div> })}</div>
    <form onSubmit={submit}><div className="field"><Label htmlFor="pickup-name">Name for pickup</Label><Input id="pickup-name" autoComplete="given-name" value={name} maxLength={50} placeholder="What should we call you?" onChange={e => setName(e.target.value)} aria-invalid={!!error && !name.trim()} aria-describedby={error ? 'checkout-error' : undefined} disabled={loading} required /></div>
      <div className="payment-note"><ShieldCheck size={21} /><div><strong>Payment confirmation</strong><p>Payment is simulated. No card details or real charge.</p></div></div>
      <div className="checkout-totals"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Sales tax (8.25%)</span><span>{money(tax)}</span></div><Separator /><div className="total"><strong>Total</strong><strong>{money(subtotal + tax)}</strong></div></div>
      {error && <p id="checkout-error" role="alert" className="error-message">{error}</p>}
      <Button className="confirm-payment" type="submit" disabled={loading}>{loading ? 'Confirming your order…' : 'Confirm order'}{!loading && <ArrowRight size={17} />}</Button>
      <p className="app-footnote">No order is sent to a real cafe.</p>
    </form>
  </DialogContent></Dialog>
}

export function OrderConfirmation({ order, onClose }: { order: Order; onClose: () => void }) {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="confirmation-dialog">
    <div className="confirmation-check"><Check size={32} /></div><DialogHeader><DialogTitle>We’ve got your order, {order.customer_name}.</DialogTitle><DialogDescription>Your order is confirmed. Here’s where to pick it up.</DialogDescription></DialogHeader>
    <div className="pickup-ticket"><span>Your pickup number</span><strong>{order.number}</strong><p><Clock3 size={17} />Ready in {order.store.wait_minutes}–{order.store.wait_minutes + 3} minutes</p><Separator /><h3>{order.store.name}, {order.store.city}</h3><p>{order.store.address}</p><small>Head to the pickup counter and look for your name.</small></div>
    <div className="confirmation-total"><span>{itemCount} {itemCount === 1 ? 'item' : 'items'} · Payment confirmed</span><strong>{money(order.total)}</strong></div><Button onClick={onClose}>Back to the menu<ArrowRight size={17} /></Button><p className="app-footnote">No real payment was taken. Your order is saved in Your orders.</p>
  </DialogContent></Dialog>
}
