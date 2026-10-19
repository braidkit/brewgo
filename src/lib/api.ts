export type Product = {
  id: string; name: string; category: string; description: string; price: number;
  calories: number; image: string; badge: string | null; featured: boolean; milk: boolean; allergens: string;
}
export type Store = { id: string; name: string; city: string; address: string; hours: string; wait_minutes: number; available: boolean }
export type Catalog = { menu: Product[]; stores: Store[]; sizes: Record<string, number>; milks: Record<string, number> }
export type Customer = { id: string; name: string }
export type CartItem = { product_id: string; quantity: number; size: string; milk: string; extra_shot: boolean }
export type Order = {
  id: string; number: string; customer_name: string; store: Store; subtotal: number; tax: number; total: number;
  created_at: string; ready_at: string; status: string; payment_status: string;
  items: (CartItem & { name: string; image: string; unit_price: number; line_total: number })[];
}

export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
export const itemKey = (item: CartItem) => `${item.product_id}:${item.size}:${item.milk}:${item.extra_shot}`
export function unitPrice(item: CartItem, product: Product, catalog: Catalog) {
  if (product.category === 'Bakery & food') return product.price
  const milk = product.id === 'iced-oat-latte' && item.milk === 'Oat milk' ? 0 : (catalog.milks[item.milk] ?? 0)
  return product.price + (catalog.sizes[item.size] ?? 0) + milk + (item.extra_shot ? 100 : 0)
}
export function optionsText(item: CartItem, product?: Product) {
  if (product?.category === 'Bakery & food') return 'Freshly baked'
  return [item.size, product?.milk ? item.milk : null, item.extra_shot ? 'Extra shot' : null].filter(Boolean).join(' · ')
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Something went wrong. Please try again.')
  }
  return response.status === 204 ? undefined as T : response.json()
}
export function readSaved<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* Ordering still works when storage is disabled. */ }
}
