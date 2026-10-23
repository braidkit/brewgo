import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const AdminDashboard = lazy(() => import('./admin/AdminDashboard'))
const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
createRoot(document.getElementById('root')!).render(<StrictMode>{isAdmin
  ? <Suspense fallback={<p role="status" className="admin-boot">Loading BrewGo admin…</p>}><AdminDashboard /></Suspense>
  : <App />}</StrictMode>)
