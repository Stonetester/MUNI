import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label className="text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            'h-11 px-3.5 rounded-xl bg-surface-2 border text-text-primary placeholder:text-muted text-sm transition-all',
            'focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20',
            error ? 'border-danger/60 focus:border-danger focus:ring-danger/20' : 'border-white/10',
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
        {hint && !error && <p className="text-xs text-text-secondary">{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
