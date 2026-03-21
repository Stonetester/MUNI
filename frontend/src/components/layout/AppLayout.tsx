'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, ChevronDown } from 'lucide-react'
import { isAuthenticated, getUser, logout } from '@/lib/auth'
import Sidebar from './Sidebar'
import MobileNavBar from './MobileNavBar'
import ProfileSwitcher from './ProfileSwitcher'
import { cn } from '@/lib/utils'
import { useViewMode } from '@/lib/viewMode'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts',
  '/budget': 'Budget',
  '/forecast': 'Forecast',
  '/events': 'Life Events',
  '/scenarios': 'What-If',
  '/alerts': 'Alerts',
  '/calendar': 'Calendar',
  '/insights': 'Insights',
  '/ai-report': 'AI Report',
  '/notifications': 'Notifications',
  '/financial-profile': 'My Profile',
  '/paystubs': 'Paystubs',
  '/home-buying': 'Home Buying',
  '/getting-started': 'Get Started',
  '/settings': 'Settings',
}

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
  const { mode, toggle } = useViewMode()

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
    return () => { addToastFn = null }
  }, [])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const title = pageTitles[pathname] || 'Muni'

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />

      {/* Main content area */}
      <div className="md:ml-[220px] flex flex-col min-h-screen">

        {/* iOS-style frosted glass top bar */}
        <header className="sticky top-0 z-30 h-14 glass-topbar border-b border-white/8 flex items-center px-4 md:px-6 justify-between">
          <h1 className="text-[17px] font-semibold text-text-primary tracking-tight">{title}</h1>
          <div className="flex items-center gap-2">
            {/* Solo / Joint toggle */}
            <button
              onClick={toggle}
              className={cn(
                'flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-medium transition-all border',
                mode === 'joint'
                  ? 'bg-primary/20 border-primary/30 text-primary'
                  : 'bg-surface border-white/10 text-text-secondary hover:text-text-primary'
              )}
              title={mode === 'joint' ? 'Switch to solo view' : 'Switch to joint view'}
            >
              {mode === 'joint' ? '👥 Joint' : '👤 Solo'}
            </button>

            <ProfileSwitcher currentUser={username} />

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 h-8 px-2.5 rounded-full hover:bg-surface-2 transition-colors text-text-secondary hover:text-text-primary"
              >
                <div className="w-6 h-6 rounded-full bg-primary/25 flex items-center justify-center">
                  <User size={13} className="text-primary" />
                </div>
                <span className="text-sm font-medium hidden sm:block capitalize">{username}</span>
                <ChevronDown size={13} />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 glass-nav border border-white/10 rounded-2xl shadow-2xl z-20 py-1.5 overflow-hidden animate-scale-in">
                    <div className="px-4 py-2.5 border-b border-white/8">
                      <p className="text-[11px] text-text-secondary uppercase tracking-wider">Signed in as</p>
                      <p className="text-sm font-semibold text-text-primary capitalize mt-0.5">{username}</p>
                    </div>
                    <button
                      onClick={() => { setShowUserMenu(false); logout() }}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <LogOut size={14} />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content — pb-nav-safe provides bottom clearance for mobile nav */}
        <main className="flex-1 p-4 md:p-6 pb-nav-safe md:pb-8">
          {children}
        </main>
      </div>

      <MobileNavBar />

      {/* Toast notifications */}
      <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'px-4 py-3 rounded-2xl text-sm font-medium shadow-2xl border animate-slide-up pointer-events-auto',
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
