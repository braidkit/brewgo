import { ArrowRight, Coffee, MapPin, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { type CartItem, type Catalog, type Store, money, itemKey, unitPrice, optionsText } from '@/lib/api'

export default function OrderBag({ cart, catalog, store, onQuantity, onStore, onCheckout }: {
  cart: CartItem[]; catalog: Catalog; store?: Store; onQuantity: (key: string, change: number) => void;
  onStore: () => void; onCheckout: () => void;
}) {
  const subtotal = cart.reduce((total, item) => {
    const product = catalog.menu.find(p => p.id === item.product_id)
    return total + (product ? unitPrice(item, product, catalog) * item.quantity : 0)
  }, 0)
  const count = cart.reduce((total, item) => total + item.quantity, 0)
  return <div className="bag-content"><div className="bag-heading"><h2>Your bag</h2><span>{count} {count === 1 ? 'item' : 'items'}</span></div>
    <button className="bag-store" onClick={onStore}><MapPin size={18} /><span><small>Picking up at</small><strong>{store ? `${store.name}, ${store.city}` : 'Choose a cafe'}</strong></span><ArrowRight size={16} /></button>
    {!cart.length ? <div className="bag-empty"><div className="bag-empty-icon"><ShoppingBag size={32} strokeWidth={1.3} /></div><h3>A little pick-me-up?</h3><p>Your next favorite is on the menu.<br />Add something to get started.</p><div className="bag-empty-rule" /><span><Coffee size={14} />Made fresh. Just for you.</span></div> : <div className="bag-items">{cart.map(item => {
      const product = catalog.menu.find(p => p.id === item.product_id)
      if (!product) return null
      const key = itemKey(item)
      return <div className="bag-item" key={key}><img src={`/images/${product.image}.jpg`} alt="" width="58" height="64" /><div className="bag-item-details"><h3>{product.name}</h3><p>{optionsText(item, product)}</p><div className="bag-item-bottom"><div className="bag-quantity"><Button variant="ghost" size="icon" aria-label={`${item.quantity === 1 ? 'Remove' : 'Decrease'} ${product.name}`} onClick={() => onQuantity(key, -1)}>{item.quantity === 1 ? <Trash2 size={13} /> : <Minus size={13} />}</Button><span>{item.quantity}</span><Button variant="ghost" size="icon" disabled={item.quantity >= 20} aria-label={`Increase ${product.name}`} onClick={() => onQuantity(key, 1)}><Plus size={13} /></Button></div><strong>{money(unitPrice(item, product, catalog) * item.quantity)}</strong></div></div></div>
    })}</div>}
    {!!cart.length && <div className="bag-totals"><Separator /><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>Tax calculated at checkout</p></div>}
    <Button className="bag-checkout" disabled={!cart.length} onClick={store ? onCheckout : onStore}>{store ? 'Review order' : 'Choose a cafe'}<ArrowRight size={17} /></Button>
    <p className="bag-bottom-note">Order ahead. Pick up. Enjoy.</p>
  </div>
}
