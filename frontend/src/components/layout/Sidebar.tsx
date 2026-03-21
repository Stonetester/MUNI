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
  { label: 'Home Buying', icon: Home, href: '/home-buying' },
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
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
      )}
    >
      <div className={cn(
        'w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0',
        active ? 'bg-primary/20' : 'bg-transparent'
      )}>
        <Icon size={16} strokeWidth={active ? 2.5 : 2} />
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
    <aside className="hidden md:flex flex-col w-[220px] min-h-screen bg-surface border-r border-white/6 fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/6">
        <div className="w-8 h-8 bg-primary rounded-ios flex items-center justify-center shadow-lg shadow-primary/20">
          <Layers size={15} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-text-primary text-[15px] tracking-tight">{APP_NAME}</span>
          <span className="text-[10px] text-muted italic leading-none mt-0.5">track dat shit</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 flex flex-col gap-0.5 overflow-y-auto">
        {primaryItems.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* Tools collapsible section */}
        <div className="mt-2">
          <button
            onClick={() => setExtrasOpen(o => !o)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
              extrasItems.some(i => isActive(i.href))
                ? 'text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-2'
            )}
          >
            <span className="flex items-center gap-3">
              <div className="w-7 h-7 flex items-center justify-center rounded-lg">
                <Layers size={16} strokeWidth={2} />
              </div>
              Tools
            </span>
            {extrasOpen ? <ChevronUp size={13} className="text-muted" /> : <ChevronDown size={13} className="text-muted" />}
          </button>

          {extrasOpen && (
            <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l-2 border-white/6 pl-3">
              {extrasItems.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-white/6 flex items-center justify-between">
        <p className="text-xs text-muted">{APP_NAME} v{APP_VERSION}</p>
        <button
          onClick={() => setShowTutorial(true)}
          title="How to use Muni"
          className="w-8 h-8 flex items-center justify-center rounded-xl text-text-secondary hover:text-primary hover:bg-surface-2 transition-colors"
        >
          <HelpCircle size={15} />
        </button>
      </div>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </aside>
  )
}
