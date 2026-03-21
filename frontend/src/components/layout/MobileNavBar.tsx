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
  { label: 'AI Report', icon: Sparkles, href: '/ai-report', iconBg: 'bg-violet-600' },
  { label: 'Get Started', icon: PlusCircle, href: '/getting-started', iconBg: 'bg-blue-500' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar', iconBg: 'bg-red-500' },
  { label: 'Life Events', icon: Calendar, href: '/events', iconBg: 'bg-pink-500' },
  { label: 'My Profile', icon: UserCircle, href: '/financial-profile', iconBg: 'bg-slate-500' },
  { label: 'Home Buying', icon: Home, href: '/home-buying', iconBg: 'bg-blue-600' },
  { label: 'Paystubs', icon: FileText, href: '/paystubs', iconBg: 'bg-orange-500' },
  { label: 'Insights', icon: Lightbulb, href: '/insights', iconBg: 'bg-yellow-500' },
  { label: 'Budget', icon: Target, href: '/budget', iconBg: 'bg-emerald-600' },
  { label: 'What-If', icon: FlaskConical, href: '/scenarios', iconBg: 'bg-fuchsia-600' },
  { label: 'Alerts', icon: BellRing, href: '/alerts', iconBg: 'bg-red-500' },
  { label: 'Notify', icon: Mail, href: '/notifications', iconBg: 'bg-sky-500' },
  { label: 'Settings', icon: Settings, href: '/settings', iconBg: 'bg-gray-500' },
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
                      isActive ? 'bg-white/6' : 'bg-surface-2/60'
                    )}
                  >
                    <div className={cn(
                      'w-11 h-11 rounded-[14px] flex items-center justify-center shadow-icon',
                      item.iconBg
                    )}>
                      <Icon size={20} className="text-white" strokeWidth={2} />
                    </div>
                    <span className={cn(
                      'text-[11px] font-medium leading-tight text-center',
                      isActive ? 'text-text-primary font-semibold' : 'text-text-secondary'
                    )}>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}

      {/* iOS Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-white/[0.06]">
        <div
          className="flex items-end justify-around px-1 pt-2"
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
                  'flex flex-col items-center gap-0.5 min-w-[60px] pb-1 transition-all active:scale-90 active:opacity-60',
                  isActive ? 'text-primary' : 'text-muted'
                )}
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 1.7} />
                </div>
                <span className="text-[10px] leading-none font-medium mt-1">
                  {item.label}
                </span>
              </Link>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-col items-center gap-0.5 min-w-[60px] pb-1 transition-all active:scale-90 active:opacity-60',
              isMoreActive ? 'text-primary' : 'text-muted'
            )}
          >
            <div className="w-6 h-6 flex items-center justify-center">
              <MoreHorizontal size={24} strokeWidth={isMoreActive ? 2.5 : 1.7} />
            </div>
            <span className="text-[10px] leading-none font-medium mt-1">
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  )
}
