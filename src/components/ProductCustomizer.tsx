import { useState } from 'react'
import { Coffee, Minus, Plus, Check } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { type CartItem, type Product, type Catalog, money, unitPrice } from '@/lib/api'

export default function ProductCustomizer({ product, catalog, onClose, onAdd }: {
  product: Product; catalog: Catalog; onClose: () => void; onAdd: (item: CartItem) => void;
}) {
  const [size, setSize] = useState('Small')
  const [milk, setMilk] = useState(product.id === 'iced-oat-latte' ? 'Oat milk' : 'Whole milk')
  const [extra, setExtra] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const food = product.category === 'Bakery & food'
  const coffee = ['Hot coffee', 'Iced coffee'].includes(product.category)
  const item = { product_id: product.id, quantity, size, milk, extra_shot: extra }
  return <Dialog open onOpenChange={open => !open && onClose()}>
    <DialogContent className="product-dialog">
      <div className="detail-photo"><img src={`/images/${product.image}.jpg`} alt={product.name} /></div>
      <div className="detail-content">
        <DialogHeader><span className="detail-category">{product.category}</span><DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{product.description}</DialogDescription></DialogHeader>
        <p className="nutrition">{product.calories} cal <span>·</span> {food ? '1 serving' : 'Small, standard recipe'}</p>
        {!food && <fieldset className="size-field"><legend>Choose your size</legend><div className="size-options">
          {Object.entries(catalog.sizes).map(([name, cost], index) => <button key={name} type="button" className={size === name ? 'size-option selected' : 'size-option'} aria-pressed={size === name} onClick={() => setSize(name)}>
            <Coffee size={22 + index * 5} strokeWidth={1.5} /><strong>{name}</strong><span>{[12, 16, 20][index]} fl oz</span><span>{cost ? `+${money(cost)}` : 'Included'}</span>
          </button>)}
        </div></fieldset>}
        {product.milk && <div className="field"><Label htmlFor="milk">Milk</Label><Select value={milk} onValueChange={setMilk}>
          <SelectTrigger id="milk"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(catalog.milks).map(([name, cost]) => <SelectItem key={name} value={name}>{name} {cost && !(product.id === 'iced-oat-latte' && name === 'Oat milk') ? `(+${money(cost)})` : '(included)'}</SelectItem>)}</SelectContent>
        </Select></div>}
        {coffee && <label className="extra-option"><span><strong>Make it an extra shot</strong><small>A little more get-up-and-go · +{money(100)}</small></span><input type="checkbox" checked={extra} onChange={e => setExtra(e.target.checked)} /></label>}
        <details className="allergens"><summary>Ingredients & allergen information</summary><p>{product.allergens}</p><p>Calories refer to the standard recipe and vary with customization.</p></details>
        <div className="detail-bottom"><div className="quantity-control"><Button variant="ghost" size="icon" aria-label="Decrease quantity" disabled={quantity === 1} onClick={() => setQuantity(quantity - 1)}><Minus /></Button><span aria-live="polite">{quantity}</span><Button variant="ghost" size="icon" aria-label="Increase quantity" disabled={quantity >= 20} onClick={() => setQuantity(quantity + 1)}><Plus /></Button></div>
          <Button className="add-to-bag" onClick={() => { onAdd(item); onClose() }}><Check size={17} />Add to bag <span>{money(unitPrice(item, product, catalog) * quantity)}</span></Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
