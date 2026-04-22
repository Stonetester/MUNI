'use client'

import { useEffect, useState, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { LogOut, User, ChevronDown, Menu } from 'lucide-react'
import { isAuthenticated, getUser, logout } from '@/lib/auth'
import Sidebar from './Sidebar'
import MobileNavBar from './MobileNavBar'
import ProfileSwitcher from './ProfileSwitcher'
import { cn } from '@/lib/utils'
import { useViewMode } from '@/lib/viewMode'
import { useDemoMode } from '@/lib/demoMode'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/transactions': 'Transactions',
  '/accounts': 'Accounts',
  '/budget': 'Budget',
  '/forecast': 'Forecast',
  '/events': 'Life Events',
  '/scenarios': 'What-If Scenarios',
  '/alerts': 'Alerts',
  '/calendar': 'Spending Calendar',
  '/insights': 'Spending Insights',
  '/ai-report': 'AI Financial Report',
  '/notifications': 'Notifications',
  '/flow': 'Money Flow',
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { mode, toggle } = useViewMode()
  const { isDemoMode } = useDemoMode()

  useEffect(() => {
    setMounted(true)
    if (!isAuthenticated()) {
      router.replace('/login')
      return
    }
    setUsername(getUser() || 'User')
    const saved = localStorage.getItem('sidebarOpen')
    if (saved === 'false') setSidebarOpen(false)
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

  const toggleSidebar = () => {
    setSidebarOpen(o => {
      const next = !o
      localStorage.setItem('sidebarOpen', String(next))
      return next
    })
  }

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
      <Sidebar isOpen={sidebarOpen} />

      {/* Main content */}
      <div className={cn('flex flex-col min-h-screen', sidebarOpen ? 'md:ml-[220px]' : 'md:ml-0')}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 h-14 bg-background/80 backdrop-blur border-b border-[#2d3748] flex items-center px-4 md:px-6 justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSidebar}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-base font-semibold text-text-primary">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggle}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border',
                mode === 'joint'
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'bg-surface border-[#2d3748] text-text-secondary hover:text-text-primary'
              )}
              title={mode === 'joint' ? 'Switch to solo view' : 'Switch to joint household view'}
            >
              {mode === 'joint' ? '👥 Joint' : '👤 Solo'}
            </button>
            <ProfileSwitcher currentUser={username} />
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
          </div>
        </header>

        {/* Demo mode banner */}
        {isDemoMode && (
          <div className="sticky top-14 z-20 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 flex items-center justify-center gap-2 text-xs text-amber-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            Demo Mode — all data is fictional. Toggle off in Settings to see your real finances.
          </div>
        )}

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
