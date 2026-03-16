import { cn } from '@/lib/utils'
import { AccountType, CategoryKind } from '@/lib/types'

interface BadgeProps {
  label: string
  className?: string
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'teal' | 'orange' | 'gray'
}

export function Badge({ label, className, variant = 'default' }: BadgeProps) {
  const variants = {
    default: 'bg-surface-2 text-text-secondary border-[#2d3748]',
    success: 'bg-primary/20 text-primary border-primary/30',
    danger: 'bg-danger/20 text-danger border-danger/30',
    warning: 'bg-warning/20 text-warning border-warning/30',
    info: 'bg-info/20 text-info border-info/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    teal: 'bg-secondary/20 text-secondary border-secondary/30',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    gray: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border',
        variants[variant],
        className
      )}
    >
      {label}
    </span>
  )
}

export function AccountTypeBadge({ type }: { type: AccountType }) {
  const config: Record<AccountType, { label: string; variant: BadgeProps['variant'] }> = {
    checking: { label: 'Checking', variant: 'info' },
    savings: { label: 'Savings', variant: 'info' },
    hysa: { label: 'HYSA', variant: 'teal' },
    brokerage: { label: 'Brokerage', variant: 'purple' },
    ira: { label: 'IRA', variant: 'purple' },
    '401k': { label: '401(k)', variant: 'purple' },
    hsa: { label: 'HSA', variant: 'purple' },
    credit_card: { label: 'Credit Card', variant: 'orange' },
    student_loan: { label: 'Student Loan', variant: 'danger' },
    car_loan: { label: 'Car Loan', variant: 'danger' },
    mortgage: { label: 'Mortgage', variant: 'danger' },
    paycheck: { label: 'Paycheck', variant: 'success' },
    other: { label: 'Other', variant: 'gray' },
  }

  const { label, variant } = config[type] || { label: type, variant: 'gray' as const }
  return <Badge label={label} variant={variant} />
}

export function CategoryKindBadge({ kind }: { kind: CategoryKind }) {
  const config: Record<CategoryKind, { label: string; variant: BadgeProps['variant'] }> = {
    income: { label: 'Income', variant: 'success' },
    expense: { label: 'Expense', variant: 'danger' },
    savings: { label: 'Savings', variant: 'teal' },
    transfer: { label: 'Transfer', variant: 'gray' },
  }

  const { label, variant } = config[kind]
  return <Badge label={label} variant={variant} />
}

export default Badge
