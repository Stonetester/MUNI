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
        'bg-surface rounded-xl border border-[#2d3748] p-4 md:p-6',
        className
      )}
      onClick={onClick}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
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
