'use client'

import { ForecastResponse, Scenario } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  TooltipProps,
} from 'recharts'

interface ScenarioComparisonProps {
  scenarios: Scenario[]
  forecasts: Map<number, ForecastResponse>
  selectedIds: number[]
}

const SCENARIO_COLORS = ['#10B981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6']

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl min-w-[200px]">
        <p className="text-text-secondary font-medium mb-2">{label}</p>
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-text-secondary truncate max-w-[100px]">{entry.name}:</span>
            <span className="text-text-primary font-semibold">{formatCurrency(entry.value as number)}</span>
          </div>
        ))}
        {payload.length === 2 && (
          <div className="mt-2 pt-2 border-t border-[#2d3748]">
            <p className="text-text-secondary">Delta: <span className={`font-semibold ${((payload[0].value as number) - (payload[1].value as number)) >= 0 ? 'text-primary' : 'text-danger'}`}>
              {formatCurrency((payload[0].value as number) - (payload[1].value as number))}
            </span></p>
          </div>
        )}
      </div>
    )
  }
  return null
}

export default function ScenarioComparison({ scenarios, forecasts, selectedIds }: ScenarioComparisonProps) {
  if (selectedIds.length < 2) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <p>Select 2 scenarios to compare</p>
      </div>
    )
  }

  const selected = selectedIds.map((id) => ({
    scenario: scenarios.find((s) => s.id === id)!,
    forecast: forecasts.get(id),
  })).filter((s) => s.scenario && s.forecast)

  if (selected.length < 2) {
    return (
      <div className="text-center py-12 text-text-secondary">
        <p>Loading comparison data...</p>
      </div>
    )
  }

  // Build comparison chart data
  const allPeriods = new Set<string>()
  selected.forEach(({ forecast }) => forecast?.points.forEach((p) => allPeriods.add(p.month)))
  const periods = Array.from(allPeriods).sort()

  const chartData = periods.map((period) => {
    const point: Record<string, string | number> = { month: formatMonth(period) }
    selected.forEach(({ scenario, forecast }) => {
      const p = forecast?.points.find((fp) => fp.month === period)
      point[scenario.name] = p?.net_worth ?? 0
    })
    return point
  })

  // Summary comparison
  const [s1, s2] = selected
  const f1 = s1.forecast!
  const f2 = s2.forecast!

  const netWorthDiff = (f1.ending_net_worth ?? 0) - (f2.ending_net_worth ?? 0)
  const savingsDiff = (f1.total_income - f1.total_expenses) - (f2.total_income - f2.total_expenses)

  // Delta table
  const deltaData = periods.slice(0, 24).map((period) => {
    const p1 = s1.forecast?.points.find((fp) => fp.month === period)
    const p2 = s2.forecast?.points.find((fp) => fp.month === period)
    const nw1 = p1?.net_worth ?? 0
    const nw2 = p2?.net_worth ?? 0
    return {
      month: formatMonth(period),
      [s1.scenario.name]: nw1,
      [s2.scenario.name]: nw2,
      delta: nw1 - nw2,
    }
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Stat comparison */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className="text-xs text-text-secondary mb-1">Net Worth Difference</p>
          <p className={`text-lg font-bold ${netWorthDiff >= 0 ? 'text-primary' : 'text-danger'}`}>
            {netWorthDiff >= 0 ? '+' : ''}{formatCurrency(netWorthDiff)}
          </p>
          <p className="text-xs text-muted mt-1">{s1.scenario.name} vs {s2.scenario.name}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-text-secondary mb-1">Savings Difference</p>
          <p className={`text-lg font-bold ${savingsDiff >= 0 ? 'text-primary' : 'text-danger'}`}>
            {savingsDiff >= 0 ? '+' : ''}{formatCurrency(savingsDiff)}
          </p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-text-secondary mb-1">{s1.scenario.name} Ending NW</p>
          <p className="text-lg font-bold text-info">{formatCurrency(f1.ending_net_worth)}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-text-secondary mb-1">{s2.scenario.name} Ending NW</p>
          <p className="text-lg font-bold text-info">{formatCurrency(f2.ending_net_worth)}</p>
        </Card>
      </div>

      {/* Overlaid Chart */}
      <Card title="Net Worth Comparison">
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
              {selected.map(({ scenario }, i) => (
                <Line
                  key={scenario.id}
                  type="monotone"
                  dataKey={scenario.name}
                  stroke={SCENARIO_COLORS[i % SCENARIO_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray={i === 1 ? '6 3' : undefined}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Delta Table */}
      <Card title="Month-by-Month Delta">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#2d3748]">
                <th className="text-left py-2 px-2 text-text-secondary font-medium">Month</th>
                <th className="text-right py-2 px-2 text-text-secondary font-medium">{s1.scenario.name}</th>
                <th className="text-right py-2 px-2 text-text-secondary font-medium">{s2.scenario.name}</th>
                <th className="text-right py-2 px-2 text-text-secondary font-medium">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2d3748]">
              {deltaData.map((row) => (
                <tr key={row.month} className="hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-2 text-text-secondary">{row.month}</td>
                  <td className="py-2 px-2 text-right text-text-primary">{formatCurrency(row[s1.scenario.name] as number)}</td>
                  <td className="py-2 px-2 text-right text-text-primary">{formatCurrency(row[s2.scenario.name] as number)}</td>
                  <td className={`py-2 px-2 text-right font-semibold ${row.delta >= 0 ? 'text-primary' : 'text-danger'}`}>
                    {row.delta >= 0 ? '+' : ''}{formatCurrency(row.delta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
