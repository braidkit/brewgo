import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AdminAnalytics from './components/AdminAnalytics'
import './index.css'

const isAdmin = window.location.pathname === '/admin' || window.location.pathname === '/admin/'
createRoot(document.getElementById('root')!).render(<StrictMode>{isAdmin ? <AdminAnalytics /> : <App />}</StrictMode>)
