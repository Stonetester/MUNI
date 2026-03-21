import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
  onClick?: () => void
}

export default function Card({ children, className, title, action, onClick }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-2xl border border-white/8 p-4 md:p-5',
        onClick && 'cursor-pointer active:opacity-80 transition-opacity',
        className
      )}
      onClick={onClick}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-widest">
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
