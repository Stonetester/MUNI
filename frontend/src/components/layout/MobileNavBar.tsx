'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  ArrowUpDown,
  Wallet,
  TrendingUp,
  MoreHorizontal,
  Target,
  Calendar,
  CalendarDays,
  FlaskConical,
  BellRing,
  Settings,
  X,
  HelpCircle,
  Lightbulb,
  PlusCircle,
  UserCircle,
  FileText,
  Sparkles,
  Mail,
  Home,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import TutorialModal from './TutorialModal'

const mainItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Transactions', icon: ArrowUpDown, href: '/transactions' },
  { label: 'Accounts', icon: Wallet, href: '/accounts' },
  { label: 'Forecast', icon: TrendingUp, href: '/forecast' },
]

const moreItems = [
  { label: 'AI Report', icon: Sparkles, href: '/ai-report' },
  { label: 'Get Started', icon: PlusCircle, href: '/getting-started' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar' },
  { label: 'Life Events', icon: Calendar, href: '/events' },
  { label: 'My Profile', icon: UserCircle, href: '/financial-profile' },
  { label: 'Home Buying', icon: Home, href: '/home-buying' },
  { label: 'Paystubs', icon: FileText, href: '/paystubs' },
  { label: 'Insights', icon: Lightbulb, href: '/insights' },
  { label: 'Budget', icon: Target, href: '/budget' },
  { label: 'What-If', icon: FlaskConical, href: '/scenarios' },
  { label: 'Alerts', icon: BellRing, href: '/alerts' },
  { label: 'Notify', icon: Mail, href: '/notifications' },
  { label: 'Settings', icon: Settings, href: '/settings' },
]

export default function MobileNavBar() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  const isMoreActive = moreItems.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'))

  return (
    <>
      {/* iOS Bottom Sheet — More Drawer */}
      {showMore && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 bottom-sheet-backdrop"
            onClick={() => setShowMore(false)}
          />

          {/* Sheet panel */}
          <div className="relative bottom-sheet-panel glass-nav border-t border-white/10 rounded-t-[28px] pb-safe">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
                More
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowMore(false); setShowTutorial(true) }}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-full text-xs text-text-secondary bg-surface-2 active:opacity-70 transition-opacity"
                >
                  <HelpCircle size={13} />
                  Tutorial
                </button>
                <button
                  onClick={() => setShowMore(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-2 text-text-secondary active:opacity-70 transition-opacity"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Items grid */}
            <div className="grid grid-cols-3 gap-2 px-4 pb-5">
              {moreItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center gap-2 py-3 px-2 rounded-2xl transition-all active:scale-95 active:opacity-70',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'bg-surface-2/60 text-text-secondary'
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center',
                      isActive ? 'bg-primary/20' : 'bg-surface-2'
                    )}>
                      <Icon size={20} />
                    </div>
                    <span className="text-[11px] font-medium leading-tight text-center">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {/* iOS Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-white/8">
        <div
          className="flex items-end justify-around px-2 pt-2"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          {mainItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 min-w-[56px] pb-1 transition-all active:scale-90 active:opacity-70',
                  isActive ? 'text-primary' : 'text-text-secondary'
                )}
              >
                <div className={cn(
                  'w-11 h-7 flex items-center justify-center rounded-xl transition-all',
                  isActive ? 'bg-primary/15' : ''
                )}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className={cn(
                  'text-[10px] font-medium leading-none',
                  isActive ? 'font-semibold' : ''
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-col items-center gap-1 min-w-[56px] pb-1 transition-all active:scale-90 active:opacity-70',
              isMoreActive ? 'text-primary' : 'text-text-secondary'
            )}
          >
            <div className={cn(
              'w-11 h-7 flex items-center justify-center rounded-xl transition-all',
              isMoreActive ? 'bg-primary/15' : ''
            )}>
              <MoreHorizontal size={22} strokeWidth={isMoreActive ? 2.5 : 1.8} />
            </div>
            <span className={cn(
              'text-[10px] font-medium leading-none',
              isMoreActive ? 'font-semibold' : ''
            )}>
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  )
}
