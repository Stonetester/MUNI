'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, ChevronDown } from 'lucide-react'
import { isAuthenticated, getUser, logout } from '@/lib/auth'
import Sidebar from './Sidebar'
import MobileNavBar from './MobileNavBar'
import { cn } from '@/lib/utils'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts',
  '/budget': 'Budget',
  '/forecast': 'Forecast',
  '/events': 'Life Events',
  '/scenarios': 'What-If Scenarios',
  '/alerts': 'Alerts',
}

// Toast notification system
interface Toast {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

let addToastFn: ((message: string, type: Toast['type']) => void) | null = null

export function showToast(message: string, type: Toast['type'] = 'error') {
  if (addToastFn) addToastFn(message, type)
}

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [username, setUsername] = useState<string>('')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (!isAuthenticated()) {
      router.replace('/login')
      return
    }
    setUsername(getUser() || 'User')
  }, [router])

  useEffect(() => {
    addToastFn = (message: string, type: Toast['type']) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, message, type }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    }
    return () => {
      addToastFn = null
    }
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const title = pageTitles[pathname] || 'FinanceTrack'

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Main content */}
      <div className="md:ml-[220px] flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-background/80 backdrop-blur border-b border-[#2d3748] flex items-center px-4 md:px-6 justify-between">
          <h1 className="text-base font-semibold text-text-primary">{title}</h1>
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 py-1.5 px-3 rounded-xl hover:bg-surface transition-colors text-text-secondary hover:text-text-primary"
            >
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                <User size={14} className="text-primary" />
              </div>
              <span className="text-sm font-medium hidden sm:block">{username}</span>
              <ChevronDown size={14} />
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-surface border border-[#2d3748] rounded-xl shadow-xl z-20 py-1">
                  <div className="px-3 py-2 border-b border-[#2d3748]">
                    <p className="text-xs text-text-secondary">Signed in as</p>
                    <p className="text-sm font-medium text-text-primary">{username}</p>
                  </div>
                  <button
                    onClick={() => { setShowUserMenu(false); logout() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-danger hover:bg-surface-2 transition-colors"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      <MobileNavBar />

      {/* Toast notifications */}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'px-4 py-3 rounded-xl text-sm font-medium shadow-lg border transition-all',
              toast.type === 'error' && 'bg-danger/20 border-danger/30 text-danger',
              toast.type === 'success' && 'bg-primary/20 border-primary/30 text-primary',
              toast.type === 'info' && 'bg-info/20 border-info/30 text-info'
            )}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
