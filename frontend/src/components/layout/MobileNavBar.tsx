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
  FlaskConical,
  Settings,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainItems = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { label: 'Transactions', icon: ArrowUpDown, href: '/transactions' },
  { label: 'Accounts', icon: Wallet, href: '/accounts' },
  { label: 'Forecast', icon: TrendingUp, href: '/forecast' },
]

const moreItems = [
  { label: 'Budget', icon: Target, href: '/budget' },
  { label: 'Life Events', icon: Calendar, href: '/events' },
  { label: 'What-If', icon: FlaskConical, href: '/scenarios' },
  { label: 'Settings', icon: Settings, href: '/settings' },
]

export default function MobileNavBar() {
  const pathname = usePathname()
  const [showMore, setShowMore] = useState(false)

  const isMoreActive = moreItems.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'))

  return (
    <>
      {/* More Drawer */}
      {showMore && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMore(false)} />
          <div className="absolute bottom-16 left-0 right-0 bg-surface border-t border-[#2d3748] rounded-t-2xl p-4 pb-safe">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-text-secondary">More</span>
              <button onClick={() => setShowMore(false)} className="p-1 text-text-secondary">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors',
                      isActive
                        ? 'bg-primary/20 text-primary'
                        : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary'
                    )}
                  >
                    <Icon size={22} />
                    <span className="text-xs">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-[#2d3748] pb-safe">
        <div className="flex items-center justify-around h-16">
          {mainItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 min-w-[44px] py-1 px-2 transition-colors',
                  isActive ? 'text-primary' : 'text-text-secondary'
                )}
              >
                <Icon size={22} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setShowMore(!showMore)}
            className={cn(
              'flex flex-col items-center gap-1 min-w-[44px] py-1 px-2 transition-colors',
              isMoreActive ? 'text-primary' : 'text-text-secondary'
            )}
          >
            <MoreHorizontal size={22} />
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>
    </>
  )
}
