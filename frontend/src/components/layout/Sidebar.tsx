'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  ArrowUpDown,
  Wallet,
  Target,
  TrendingUp,
  Calendar,
  CalendarDays,
  FlaskConical,
  BellRing,
  Settings,
  HelpCircle,
  Lightbulb,
  PlusCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'
import TutorialModal from './TutorialModal'

const navItems = [
  { label: 'Get Started', icon: PlusCircle, href: '/getting-started' },
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Transactions', icon: ArrowUpDown, href: '/transactions' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar' },
  { label: 'Insights', icon: Lightbulb, href: '/insights' },
  { label: 'Accounts', icon: Wallet, href: '/accounts' },
  { label: 'Budget', icon: Target, href: '/budget' },
  { label: 'Forecast', icon: TrendingUp, href: '/forecast' },
  { label: 'Life Events', icon: Calendar, href: '/events' },
  { label: 'What-If', icon: FlaskConical, href: '/scenarios' },
  { label: 'Alerts', icon: BellRing, href: '/alerts' },
  { label: 'Settings', icon: Settings, href: '/settings' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [showTutorial, setShowTutorial] = useState(false)

  return (
    <aside className="hidden md:flex flex-col w-[220px] min-h-screen bg-surface border-r border-[#2d3748] fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#2d3748]">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <TrendingUp size={16} className="text-white" />
        </div>
        <span className="font-bold text-text-primary text-base">FinanceTrack</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
              )}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#2d3748] flex items-center justify-between">
        <p className="text-xs text-muted">FinanceTrack v{APP_VERSION}</p>
        <button
          onClick={() => setShowTutorial(true)}
          title="How to use FinanceTrack"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </aside>
  )
}
