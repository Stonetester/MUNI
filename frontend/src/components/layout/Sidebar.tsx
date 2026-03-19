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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { APP_VERSION, APP_NAME } from '@/lib/version'
import TutorialModal from './TutorialModal'

const primaryItems = [
  { label: 'Get Started', icon: PlusCircle, href: '/getting-started' },
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Transactions', icon: ArrowUpDown, href: '/transactions' },
  { label: 'Calendar', icon: CalendarDays, href: '/calendar' },
  { label: 'Accounts', icon: Wallet, href: '/accounts' },
  { label: 'Forecast', icon: TrendingUp, href: '/forecast' },
  { label: 'Life Events', icon: Calendar, href: '/events' },
  { label: 'Recurring', icon: RefreshCw, href: '/recurring' },
  { label: 'My Profile', icon: UserCircle, href: '/financial-profile' },
  { label: 'Paystubs', icon: FileText, href: '/paystubs' },
  { label: 'Settings', icon: Settings, href: '/settings' },
]

const extrasItems = [
  { label: 'AI Report', icon: Sparkles, href: '/ai-report' },
  { label: 'Insights', icon: Lightbulb, href: '/insights' },
  { label: 'Budget', icon: Target, href: '/budget' },
  { label: 'What-If', icon: FlaskConical, href: '/scenarios' },
  { label: 'Alerts', icon: BellRing, href: '/alerts' },
  { label: 'Notifications', icon: Mail, href: '/notifications' },
]

function NavItem({ label, icon: Icon, href, active }: { label: string; icon: React.ElementType; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
        active
          ? 'bg-primary text-white'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
      )}
    >
      <Icon size={17} />
      {label}
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
    <aside className="hidden md:flex flex-col w-[220px] min-h-screen bg-surface border-r border-[#2d3748] fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[#2d3748]">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Layers size={15} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-text-primary text-base tracking-wide">{APP_NAME}</span>
          <span className="text-[10px] text-text-secondary italic leading-none mt-0.5">track dat shit</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {primaryItems.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* Extras collapsible */}
        <div className="mt-1">
          <button
            onClick={() => setExtrasOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150',
              extrasItems.some(i => isActive(i.href))
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            )}
          >
            <span className="flex items-center gap-3">
              <Layers size={17} />
              Tools
            </span>
            {extrasOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {extrasOpen && (
            <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-[#2d3748] pl-3">
              {extrasItems.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-[#2d3748] flex items-center justify-between">
        <p className="text-xs text-muted">{APP_NAME} v{APP_VERSION}</p>
        <button
          onClick={() => setShowTutorial(true)}
          title="How to use Muni"
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        >
          <HelpCircle size={16} />
        </button>
      </div>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </aside>
  )
}
