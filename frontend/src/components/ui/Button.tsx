import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, ReactNode } from 'react'
import LoadingSpinner from './LoadingSpinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-primary hover:bg-primary-hover active:bg-primary-hover text-white border-transparent',
    secondary: 'bg-transparent hover:bg-surface-2 active:bg-surface-2 text-text-primary border-white/10',
    danger: 'bg-danger hover:bg-red-600 active:bg-red-700 text-white border-transparent',
    ghost: 'bg-transparent hover:bg-surface-2 active:bg-surface-2 text-text-secondary border-transparent',
  }

  const sizes = {
    sm: 'h-9 min-w-[44px] px-3.5 text-xs rounded-xl',
    md: 'h-11 min-w-[44px] px-4 text-sm rounded-xl',
    lg: 'h-12 min-w-[44px] px-6 text-base rounded-2xl',
  }

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium border transition-all duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        'active:scale-[0.97]',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <LoadingSpinner size="sm" />}
      {children}
    </button>
  )
}
