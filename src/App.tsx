import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, Check, ChevronDown, Clock3, Coffee, Heart, Leaf, MapPin, Plus, Search, ShoppingBag, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProductCustomizer from '@/components/ProductCustomizer'
import StorePicker from '@/components/StorePicker'
import OrderBag from '@/components/OrderBag'
import Checkout, { OrderConfirmation } from '@/components/Checkout'
import Account from '@/components/Account'
import { api, type CartItem, type Catalog, type Customer, type Order, type Product, itemKey, money, readSaved, save } from '@/lib/api'

const categories = ['BrewGo favorites', 'All menu', 'Hot coffee', 'Iced coffee', 'Tea & matcha', 'Bakery & food', 'Your favorites']

function savedCart(): CartItem[] {
  const saved = readSaved<unknown>('brewgo-cart', [])
  if (!Array.isArray(saved)) return []
  return saved.filter((item): item is CartItem => item && typeof item.product_id === 'string' && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20 && ['Small', 'Medium', 'Large'].includes(item.size) && ['Whole milk', 'Oat milk', 'Almond milk', 'Soy milk'].includes(item.milk) && typeof item.extra_shot === 'boolean').slice(0, 30)
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('BrewGo favorites')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>(savedCart)
  const [storeId, setStoreId] = useState(() => readSaved<string>('brewgo-store', ''))
  const [favorites, setFavorites] = useState<string[]>(() => { const values = readSaved<unknown>('brewgo-favorites', []); return Array.isArray(values) ? values.filter(v => typeof v === 'string') : [] })
  const [product, setProduct] = useState<Product | null>(null)
  const [storeOpen, setStoreOpen] = useState(false)
  const [bagOpen, setBagOpen] = useState(false)
  const [checkout, setCheckout] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [confirmed, setConfirmed] = useState<Order | null>(null)
  const [notice, setNotice] = useState('')
  const load = useCallback(async () => {
    setError('')
    try {
      const data = await api<Catalog>('/catalog')
      setCatalog(data)
      setCart(current => current.filter(item => data.menu.some(p => p.id === item.product_id)))
    } catch { setError('We couldn’t load the menu. Check that the BrewGo server is running and try again.') }
  }, [])
  useEffect(() => { void load(); api<{ customer: Customer | null }>('/account').then(data => setCustomer(data.customer)).catch(() => {}) }, [load])
  useEffect(() => { save('brewgo-cart', cart) }, [cart])
  useEffect(() => { save('brewgo-store', storeId) }, [storeId])
  useEffect(() => { save('brewgo-favorites', favorites) }, [favorites])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer) }, [notice])
  useEffect(() => { if (product || storeOpen || bagOpen || checkout || accountOpen || howOpen || confirmed) setNotice('') }, [product, storeOpen, bagOpen, checkout, accountOpen, howOpen, confirmed])

  const store = catalog?.stores.find(s => s.id === storeId && s.available)
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)
  const visible = catalog?.menu.filter(p => {
    const inCategory = category === 'All menu' || (category === 'BrewGo favorites' ? p.featured : category === 'Your favorites' ? favorites.includes(p.id) : p.category === category)
    return inCategory && `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  }) ?? []
  function addItem(item: CartItem) {
    const existing = cart.find(i => itemKey(i) === itemKey(item))
    const nextQuantity = (existing?.quantity ?? 0) + item.quantity
    if (nextQuantity > 20) { setNotice('You can add up to 20 of each customized item.'); return }
    if (!existing && cart.length >= 30) { setNotice('Your bag can hold up to 30 different items.'); return }
    setCart(current => existing ? current.map(i => itemKey(i) === itemKey(item) ? { ...i, quantity: nextQuantity } : i) : [...current, item])
    setNotice(`${catalog?.menu.find(p => p.id === item.product_id)?.name} added to your bag.`)
  }
  function onQuantity(key: string, change: number) {
    setCart(current => current.map(i => itemKey(i) === key ? { ...i, quantity: Math.min(20, i.quantity + change) } : i).filter(i => i.quantity > 0))
  }
  function openCheckout() { setBagOpen(false); setCheckout(true) }
  function scrollMenu() { document.getElementById('menu')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }
  const bagProps = catalog ? { cart, catalog, store, onQuantity, onStore: () => { setBagOpen(false); setStoreOpen(true) }, onCheckout: openCheckout } : null

  return <>
    <a href="#menu" className="skip-link">Skip to menu</a>
    <div className="announcement"><span>Good coffee. A good start.</span><button onClick={() => setHowOpen(true)}>Order ahead. Make time for your day.<ArrowRight size={13} /></button></div>
    <header className="site-header"><div className="header-inner"><a href="#" className="brand" aria-label="BrewGo Coffee home"><span className="brand-mark"><Coffee size={27} strokeWidth={1.7} /></span><span>BrewGo<span className="brand-dot">.</span><small>COFFEE</small></span></a>
      <nav aria-label="Main navigation"><button className="nav-active" onClick={scrollMenu}>Menu</button><button onClick={() => setStoreOpen(true)}>Our cafés</button><button onClick={() => setAccountOpen(true)}>Your orders</button></nav>
      <div className="header-actions"><button className="header-store" onClick={() => setStoreOpen(true)}><MapPin size={18} /><span>{store ? store.name : 'Find a cafe'}</span></button><Button variant="outline" className="account-button" aria-label={customer ? `Your account, ${customer.name}` : 'Your account'} onClick={() => setAccountOpen(true)}><UserRound size={17} /><span>{customer ? customer.name : 'Your account'}</span></Button><Button className="header-bag" onClick={() => setBagOpen(true)} aria-label={`Open bag, ${count} ${count === 1 ? 'item' : 'items'}`}><ShoppingBag size={18} /><span>Bag</span><span className="bag-count">{count}</span></Button></div>
    </div></header>
    <main>
      <section className="hero page-width" aria-labelledby="hero-title"><div className="hero-copy"><span className="hero-intro">A little ritual. A better day.</span><h1 id="hero-title">Your usual.<br />On your schedule.</h1><p>Great coffee, freshly made. Order ahead and<br className="desktop-break" /> we’ll have your pick-me-up ready to go.</p><Button onClick={scrollMenu}>Find your next favorite<ArrowDown size={17} /></Button><span className="hero-note"><Clock3 size={14} />A few taps now. More time for you.</span></div><div className="hero-image"><img src="/images/coffee-hero.jpg" alt="An iced oat latte and vanilla cream cold brew in the morning light" fetchPriority="high" width="1536" height="1024" /><span className="photo-caption">Freshly poured. Never rushed.</span></div></section>
      <div className="pickup-bar page-width"><button onClick={() => setStoreOpen(true)}><span className="pickup-pin"><MapPin size={21} /></span><span><small>Order ahead & pick up</small><strong>{store ? `${store.name}, ${store.city}` : 'Choose your pickup cafe'}</strong></span><ChevronDown size={17} /></button><span className="pickup-wait"><span className="status-dot" />{store ? `Ready in ${store.wait_minutes}–${store.wait_minutes + 3} min` : 'Made fresh when you order'}</span><span className="pickup-message"><Leaf size={16} />Your day, a little brighter.</span></div>
      <section id="menu" tabIndex={-1} className="menu-section page-width" aria-labelledby="menu-title"><div className="menu-section-header"><div><h2 id="menu-title">Find your daily favorite.</h2><p>Coffee, tea, and freshly baked favorites. What sounds good?</p></div><div className="search-wrap menu-search"><Search size={18} /><label htmlFor="menu-search" className="sr-only">Search the menu</label><Input id="menu-search" placeholder="Search the menu" value={search} onChange={e => setSearch(e.target.value)} />{search && <button aria-label="Clear search" onClick={() => setSearch('')}><X size={16} /></button>}</div></div>
        <div className="menu-layout"><aside className="menu-sidebar" aria-label="Menu categories"><span className="sidebar-title">Explore the menu</span><div className="category-list">{categories.map((name, index) => <button key={name} aria-pressed={category === name} className={`${category === name ? 'category-active' : ''} ${index === 6 ? 'favorite-category' : ''}`} onClick={() => { setCategory(name); setSearch('') }}>{index === 6 && <Heart size={15} />}{name}{name === 'Your favorites' && favorites.length > 0 && <span>{favorites.length}</span>}</button>)}</div><div className="sidebar-note"><Coffee size={23} strokeWidth={1.4} /><p>Good things,<br />brewed daily.</p></div></aside>
          <div className="menu-products"><div className="products-heading"><h3>{category}</h3><span>{visible.length} {visible.length === 1 ? 'item' : 'items'}</span></div>
            {error ? <div role="alert" className="menu-error"><Coffee size={30} /><h3>The menu needs a moment.</h3><p>{error}</p><Button onClick={load}>Try again</Button></div> : !catalog ? <div className="product-grid" role="status" aria-label="Loading the menu">{Array.from({ length: 6 }, (_, i) => <div key={i}><Skeleton className="product-skeleton" /><Skeleton className="h-5 w-3/4 mt-4" /><Skeleton className="h-4 w-1/3 mt-2" /></div>)}</div> : visible.length ? <div className="product-grid">{visible.map(p => <article className="product-card" key={p.id}><div className="product-photo"><button className="product-image-button" aria-label={`Customize ${p.name}`} onClick={() => setProduct(p)}><img src={`/images/${p.image}.jpg`} alt={p.name} loading="lazy" width="700" height="700" /></button>{p.badge && <Badge className="product-badge">{p.badge}</Badge>}<button className={`favorite-button ${favorites.includes(p.id) ? 'is-favorite' : ''}`} aria-label={`${favorites.includes(p.id) ? 'Remove' : 'Save'} ${p.name} ${favorites.includes(p.id) ? 'from' : 'to'} favorites`} aria-pressed={favorites.includes(p.id)} onClick={() => setFavorites(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id])}><Heart size={18} /></button><Button className="product-add" variant="outline" size="icon" aria-label={`Add ${p.name}`} onClick={() => setProduct(p)}><Plus size={21} strokeWidth={1.7} /></Button></div><div className="product-text"><span className="product-category">{p.category}</span><h4><button onClick={() => setProduct(p)}>{p.name}</button></h4><p>{money(p.price)}<span>·</span><span>{p.calories} cal</span></p></div></article>)}</div> : <div className="empty-search"><Search size={28} /><h3>{category === 'Your favorites' && !search ? 'Keep your favorites close.' : 'No matches this time.'}</h3><p>{category === 'Your favorites' && !search ? 'Tap the heart on a menu item to save it here.' : 'Try a different search or explore the full menu.'}</p><Button variant="outline" onClick={() => { setCategory('All menu'); setSearch('') }}>Explore all menu</Button></div>}
            <p className="menu-footnote">USD prices shown for small drinks and single food items. Customization may cost extra.</p>
          </div><aside className="desktop-bag" aria-label="Order bag">{bagProps && <OrderBag {...bagProps} />}</aside>
        </div>
      </section>
      <div className="made-for-you page-width"><Coffee size={31} strokeWidth={1.2} /><div><h2>Make it your kind of coffee.</h2><p>Choose your size, pick your milk, and add an extra shot.</p></div><button onClick={() => setHowOpen(true)}>How ordering works<ArrowRight size={17} /></button></div>
    </main>
    <footer className="page-width"><a href="#" className="footer-brand">BrewGo.</a><p>A good cup. A good day.</p><button onClick={() => setHowOpen(true)}>About this demo</button><span>© {new Date().getFullYear()} BrewGo Coffee</span></footer>
    {!!count && <Button className="mobile-bag-bar" onClick={() => setBagOpen(true)}><ShoppingBag size={18} /><span>View your bag</span><span>{count} {count === 1 ? 'item' : 'items'}</span><ArrowRight size={17} /></Button>}
    <div className={`toast ${notice ? 'toast-visible' : ''}`} role="status" aria-live="polite">{notice && <><Check size={18} /><span>{notice}</span><button onClick={() => { setNotice(''); setBagOpen(true) }}>View bag<ArrowRight size={14} /></button><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></>}</div>
    {product && catalog && <ProductCustomizer key={product.id} product={product} catalog={catalog} onClose={() => setProduct(null)} onAdd={addItem} />}
    {storeOpen && catalog && <StorePicker stores={catalog.stores} selected={store} onSelect={s => { setStoreId(s.id); setNotice(`Pickup cafe set to ${s.name}, ${s.city}.`) }} onClose={() => setStoreOpen(false)} />}
    <Sheet open={bagOpen} onOpenChange={setBagOpen}><SheetContent className="bag-sheet"><SheetHeader className="sr-only"><SheetTitle>Your order bag</SheetTitle><SheetDescription>Review your items and choose a pickup cafe.</SheetDescription></SheetHeader>{bagProps ? <OrderBag {...bagProps} /> : <p className="bag-loading">{error || 'Loading your bag…'}</p>}</SheetContent></Sheet>
    {checkout && catalog && store && cart.length > 0 && <Checkout cart={cart} catalog={catalog} store={store} customer={customer} onClose={() => setCheckout(false)} onSuccess={order => { setCart([]); setCheckout(false); setConfirmed(order) }} />}
    {confirmed && <OrderConfirmation order={confirmed} onClose={() => setConfirmed(null)} />}
    {accountOpen && <Account customer={customer} onCustomer={setCustomer} onClose={() => setAccountOpen(false)} />}
    <Dialog open={howOpen} onOpenChange={setHowOpen}><DialogContent className="how-dialog"><DialogHeader><div className="dialog-icon"><Coffee /></div><DialogTitle>Your next coffee, without the wait.</DialogTitle><DialogDescription>A few taps and you’re on your way.</DialogDescription></DialogHeader><ol className="how-steps"><li><span>1</span><div><h3>Find your cafe</h3><p>Choose a BrewGo in New York, Seattle, or Austin.</p></div></li><li><span>2</span><div><h3>Make it your own</h3><p>Pick your favorites, choose a size, and add your preferred milk.</p></div></li><li><span>3</span><div><h3>Confirm and collect</h3><p>Confirm the demo payment, then find your pickup details.</p></div></li></ol><p className="about-demo">BrewGo is a demonstration app with fictional cafes. Payments are simulated, tax is an example rate, and no orders reach a real store. Store hours, prices, and nutrition are sample data.</p><Button onClick={() => { setHowOpen(false); scrollMenu() }}>Let’s find your favorite<ArrowRight size={17} /></Button></DialogContent></Dialog>
  </>
}
