'use client'

import { Scenario } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScenarioSelectorProps {
  scenarios: Scenario[]
  selectedIds: number[]
  onToggle: (id: number) => void
  maxSelectable?: number
}

export default function ScenarioSelector({
  scenarios,
  selectedIds,
  onToggle,
  maxSelectable = 2,
}: ScenarioSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {scenarios.map((scenario) => {
        const isSelected = selectedIds.includes(scenario.id)
        const canSelect = isSelected || selectedIds.length < maxSelectable

        return (
          <button
            key={scenario.id}
            onClick={() => canSelect && onToggle(scenario.id)}
            disabled={!canSelect}
            className={cn(
              'text-left p-4 rounded-xl border transition-all',
              isSelected
                ? 'border-primary bg-primary/10'
                : canSelect
                ? 'border-[#2d3748] bg-surface-2 hover:border-primary/50'
                : 'border-[#2d3748] bg-surface-2 opacity-40 cursor-not-allowed'
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                {scenario.is_baseline && <Badge label="Baseline" variant="info" />}
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-primary border-primary' : 'border-[#2d3748]'
                  )}
                >
                  {isSelected && <Check size={12} className="text-white" />}
                </div>
              </div>
            </div>
            <p className="text-sm font-medium text-text-primary">{scenario.name}</p>
            {scenario.description && (
              <p className="text-xs text-text-secondary mt-1">{scenario.description}</p>
            )}
          </button>
        )
      })}
    </div>
  )
}
