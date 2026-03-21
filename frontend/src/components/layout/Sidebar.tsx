'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  ArrowUpDown,
  Wallet,
  TrendingUp,
  Calendar,
  CalendarDays,
  FlaskConical,
  BellRing,
  Settings,
  HelpCircle,
  Lightbulb,
  PlusCircle,
  UserCircle,
  FileText,
  Target,
  ChevronDown,
  ChevronUp,
  Layers,
  RefreshCw,
  Sparkles,
  Mail,
  Home,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION, APP_NAME } from '@/lib/version'
import TutorialModal from './TutorialModal'

// iOS Settings–style: every nav item has its own colored icon bubble
const primaryItems = [
  { label: 'Get Started', icon: PlusCircle, href: '/getting-started', iconBg: 'bg-blue-500' },
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard', iconBg: 'bg-[#14D49E]' },
  { label: 'Transactions', icon: ArrowUpDown, href: '/transactions', iconBg: 'bg-indigo-500' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar', iconBg: 'bg-red-500' },
  { label: 'Accounts', icon: Wallet, href: '/accounts', iconBg: 'bg-amber-500' },
  { label: 'Forecast', icon: TrendingUp, href: '/forecast', iconBg: 'bg-purple-500' },
  { label: 'Life Events', icon: Calendar, href: '/events', iconBg: 'bg-pink-500' },
  { label: 'Recurring', icon: RefreshCw, href: '/recurring', iconBg: 'bg-cyan-600' },
  { label: 'My Profile', icon: UserCircle, href: '/financial-profile', iconBg: 'bg-slate-500' },
  { label: 'Home Buying', icon: Home, href: '/home-buying', iconBg: 'bg-blue-600' },
  { label: 'Paystubs', icon: FileText, href: '/paystubs', iconBg: 'bg-orange-500' },
  { label: 'Settings', icon: Settings, href: '/settings', iconBg: 'bg-gray-500' },
]

const extrasItems = [
  { label: 'AI Report', icon: Sparkles, href: '/ai-report', iconBg: 'bg-violet-600' },
  { label: 'Insights', icon: Lightbulb, href: '/insights', iconBg: 'bg-yellow-500' },
  { label: 'Budget', icon: Target, href: '/budget', iconBg: 'bg-emerald-600' },
  { label: 'What-If', icon: FlaskConical, href: '/scenarios', iconBg: 'bg-fuchsia-600' },
  { label: 'Alerts', icon: BellRing, href: '/alerts', iconBg: 'bg-red-500' },
  { label: 'Notifications', icon: Mail, href: '/notifications', iconBg: 'bg-sky-500' },
]

function NavItem({
  label,
  icon: Icon,
  href,
  active,
  iconBg,
}: {
  label: string
  icon: React.ElementType
  href: string
  active: boolean
  iconBg: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150',
        active
          ? 'bg-white/8 text-text-primary font-semibold'
          : 'text-text-secondary hover:text-text-primary hover:bg-white/4 font-medium'
      )}
    >
      {/* Colored icon bubble — always visible like iOS Settings */}
      <div className={cn(
        'w-7 h-7 rounded-ios flex items-center justify-center flex-shrink-0 shadow-icon',
        iconBg
      )}>
        <Icon size={14} className="text-white" strokeWidth={2} />
      </div>
      <span className="truncate">{label}</span>
    </Link>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const [showTutorial, setShowTutorial] = useState(false)
  const [extrasOpen, setExtrasOpen] = useState(
    extrasItems.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))
  )

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <aside className="hidden md:flex flex-col w-[220px] min-h-screen bg-surface border-r border-white/[0.06] fixed left-0 top-0 z-40">

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
        <div className="w-8 h-8 bg-primary rounded-ios flex items-center justify-center shadow-lg shadow-primary/25">
          <Layers size={15} className="text-[#0A0D14]" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-text-primary text-[15px] tracking-tight">{APP_NAME}</span>
          <span className="text-[10px] text-muted italic leading-none mt-0.5">track dat shit</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-px overflow-y-auto">
        {primaryItems.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* Tools section */}
        <div className="mt-2 pt-2 border-t border-white/[0.06]">
          <button
            onClick={() => setExtrasOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-white/4 transition-all"
          >
            <span className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-ios flex items-center justify-center bg-surface-2">
                <Layers size={14} className="text-text-secondary" strokeWidth={2} />
              </div>
              Tools
            </span>
            {extrasOpen
              ? <ChevronUp size={13} className="text-muted" />
              : <ChevronDown size={13} className="text-muted" />
            }
          </button>

          {extrasOpen && (
            <div className="ml-2 mt-0.5 flex flex-col gap-px pl-3 border-l-2 border-white/[0.06]">
              {extrasItems.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/[0.06] flex items-center justify-between">
        <p className="text-xs text-muted">{APP_NAME} v{APP_VERSION}</p>
        <button
          onClick={() => setShowTutorial(true)}
          title="How to use Muni"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-text-secondary hover:text-primary hover:bg-white/6 transition-colors"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </aside>
  )
}
