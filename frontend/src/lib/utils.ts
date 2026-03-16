import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export const formatMonth = (period: string): string => {
  // "2026-03" → "Mar 2026"
  const [year, month] = period.split('-')
  const date = new Date(parseInt(year), parseInt(month) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export const formatDate = (dateStr: string): string => {
  // "2026-03-15" → "Mar 15, 2026"
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatShortDate = (dateStr: string): string => {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const getDaysUntil = (dateStr: string): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  const diff = target.getTime() - today.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export const getCurrentMonth = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export const getPreviousMonth = (period: string): string => {
  const [year, month] = period.split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export const accountTypeLabel = (type: string): string => {
  const labels: Record<string, string> = {
    checking: 'Checking',
    savings: 'Savings',
    hysa: 'HYSA',
    brokerage: 'Brokerage',
    ira: 'IRA',
    '401k': '401(k)',
    hsa: 'HSA',
    credit_card: 'Credit Card',
    student_loan: 'Student Loan',
    car_loan: 'Car Loan',
    mortgage: 'Mortgage',
    paycheck: 'Paycheck',
    other: 'Other',
  }
  return labels[type] || type
}

export const isLiability = (type: string): boolean => {
  return ['credit_card', 'student_loan', 'car_loan', 'mortgage'].includes(type)
}

export const eventTypeEmoji = (type: string): string => {
  const emojis: Record<string, string> = {
    wedding: '💍',
    marriage: '💒',
    move: '📦',
    new_job: '💼',
    baby: '👶',
    home_purchase: '🏠',
    vacation: '✈️',
    loan_payoff: '🎉',
    other: '📌',
  }
  return emojis[type] || '📌'
}

export const frequencyLabel = (freq: string): string => {
  const labels: Record<string, string> = {
    weekly: 'Weekly',
    biweekly: 'Biweekly',
    monthly: 'Monthly',
    bimonthly: 'Bimonthly',
    quarterly: 'Quarterly',
    annual: 'Annual',
    one_time: 'One Time',
  }
  return labels[freq] || freq
}

export const clampPercentage = (value: number): number => {
  return Math.min(100, Math.max(0, value))
}
