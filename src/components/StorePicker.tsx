import { useState } from 'react'
import { ArrowRight, Clock3, MapPin, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { type Store } from '@/lib/api'

export default function StorePicker({ stores, selected, onSelect, onClose }: {
  stores: Store[]; selected: Store | undefined; onSelect: (store: Store) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('')
  const matches = stores.filter(store => `${store.name} ${store.city} ${store.address}`.toLowerCase().includes(query.toLowerCase()))
  return <Dialog open onOpenChange={open => !open && onClose()}><DialogContent className="store-dialog">
    <DialogHeader><div className="dialog-icon"><MapPin /></div><DialogTitle>A good coffee is close by.</DialogTitle><DialogDescription>Choose where you’ll pick up your order.</DialogDescription></DialogHeader>
    <label htmlFor="store-search" className="input-label">Search cafes</label><div className="search-wrap"><Search size={18} /><Input id="store-search" placeholder="City, neighborhood, or street" value={query} onChange={e => setQuery(e.target.value)} /></div>
    <div className="store-list">{matches.map(store => <div className={`store-option ${selected?.id === store.id ? 'is-selected' : ''}`} key={store.id}>
      <div><span className="store-city">{store.city}</span><h3>{store.name}{selected?.id === store.id && <span className="selected-label">Selected</span>}</h3><p>{store.address}</p><small>{store.hours} · Sample hours</small><span className={store.available ? 'store-availability' : 'store-unavailable'}><Clock3 size={13} />{store.available ? `Pickup in ${store.wait_minutes}–${store.wait_minutes + 3} min` : 'Unavailable for pickup'}</span></div>
      <Button size="icon" variant={selected?.id === store.id ? 'default' : 'outline'} disabled={!store.available} aria-label={`Choose ${store.name}, ${store.city}`} onClick={() => { onSelect(store); onClose() }}><ArrowRight size={18} /></Button>
    </div>)}{!matches.length && <div className="empty-search"><MapPin /><h3>No cafes found</h3><p>Try New York, Seattle, or Austin.</p><Button variant="outline" onClick={() => setQuery('')}>Show all cafes</Button></div>}</div>
    <p className="app-footnote">Fictional cafes for this app. No location access is needed.</p>
  </DialogContent></Dialog>
}
