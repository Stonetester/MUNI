'use client'

import { useState, useEffect, useRef } from 'react'
import { HelpCircle, X } from 'lucide-react'

interface InfoTooltipProps {
  title: string
  content: string | React.ReactNode
  className?: string
}

type Align = 'center' | 'left' | 'right'

export default function InfoTooltip({ title, content, className = '' }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const [align, setAlign] = useState<Align>('center')
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // Detect screen position on open and choose alignment so tooltip stays on screen
  useEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const tooltipW = Math.min(288, vw - 32) // w-72 = 288px, min 16px margin each side
    const centeredLeft = rect.left + rect.width / 2 - tooltipW / 2
    const centeredRight = centeredLeft + tooltipW

    if (centeredLeft < 8) {
      setAlign('left')
    } else if (centeredRight > vw - 8) {
      setAlign('right')
    } else {
      setAlign('center')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('mousedown', handleClick)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('mousedown', handleClick)
    }
  }, [open])

  const popoverClass = {
    center: 'left-1/2 -translate-x-1/2',
    left: 'left-0',
    right: 'right-0',
  }[align]

  const arrowClass = {
    center: 'left-1/2 -translate-x-1/2',
    left: 'left-3',
    right: 'right-3',
  }[align]

  return (
    <div ref={ref} className={`relative inline-flex items-center ${className}`}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="w-5 h-5 rounded-full flex items-center justify-center text-muted hover:text-text-secondary transition-colors focus:outline-none touch-manipulation"
        aria-label={`Learn about: ${title}`}
      >
        <HelpCircle size={14} />
      </button>

      {open && (
        <div
          className={`absolute z-50 bottom-7 ${popoverClass} w-[min(288px,calc(100vw-2rem))] bg-[#1a1f2e] border border-[#3d4d6a] rounded-xl shadow-2xl p-4`}
        >
          {/* Arrow */}
          <div className={`absolute -bottom-1.5 ${arrowClass} w-3 h-3 bg-[#1a1f2e] border-r border-b border-[#3d4d6a] rotate-45`} />
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-xs font-semibold text-text-primary leading-snug">{title}</p>
            <button
              onClick={() => setOpen(false)}
              className="text-muted hover:text-text-secondary flex-shrink-0 touch-manipulation p-0.5"
              aria-label="Close"
            >
              <X size={12} />
            </button>
          </div>
          <div className="text-xs text-text-secondary leading-relaxed">{content}</div>
        </div>
      )}
    </div>
  )
}
