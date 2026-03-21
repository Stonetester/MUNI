'use client'

import { useEffect } from 'react'
import { X, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

export interface BreakdownItem {
  label: string
  value: number
  sublabel?: string
  color?: string
}

interface StatDetailModalProps {
  title: string
  description: string
  value: number
  valueColor: string
  breakdown: BreakdownItem[]
  note?: string
  onClose: () => void
}

export default function StatDetailModal({
  title,
  description,
  value,
  valueColor,
  breakdown,
  note,
  onClose,
}: StatDetailModalProps) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const maxAbs = Math.max(...breakdown.map((b) => Math.abs(b.value)), 1)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border border-[#2d3748] rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#2d3748]">
          <div className="flex-1 pr-4">
            <p className="text-xs text-muted uppercase tracking-wider mb-1">{title}</p>
            <p className={`text-2xl font-bold ${valueColor}`}>{formatCurrency(value)}</p>
            <div className="flex items-start gap-1.5 mt-2">
              <Info size={12} className="text-muted mt-0.5 flex-shrink-0" />
              <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Breakdown */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
          {breakdown.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-4">No breakdown available.</p>
          ) : (
            breakdown.map((item, i) => (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {item.color && (
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                    )}
                    <div>
                      <p className="text-sm text-text-primary">{item.label}</p>
                      {item.sublabel && <p className="text-xs text-muted">{item.sublabel}</p>}
                    </div>
                  </div>
                  <p className={`text-sm font-semibold ${item.value >= 0 ? 'text-text-primary' : 'text-danger'}`}>
                    {formatCurrency(Math.abs(item.value))}
                  </p>
                </div>
                <div className="h-1 bg-surface-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(Math.abs(item.value) / maxAbs) * 100}%`,
                      backgroundColor: item.color || (item.value >= 0 ? '#10b981' : '#f87171'),
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {note && (
          <div className="px-5 pb-4 pt-2 border-t border-[#2d3748]">
            <p className="text-xs text-muted">{note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
