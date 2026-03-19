'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { getAiReport } from '@/lib/api'
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function ReportMarkdown({ text }: { text: string }) {
  // Simple markdown renderer: headers, bold, bullets
  const lines = text.split('\n')
  return (
    <div className="prose prose-invert max-w-none text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h2 key={i} className="text-base font-bold text-text-primary mt-6 mb-2 first:mt-0">
              {line.replace('## ', '')}
            </h2>
          )
        }
        if (line.startsWith('# ')) {
          return (
            <h1 key={i} className="text-lg font-bold text-text-primary mt-4 mb-3">
              {line.replace('# ', '')}
            </h1>
          )
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={i} className="text-sm font-semibold text-text-primary mt-4 mb-1">
              {line.replace('### ', '')}
            </h3>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const content = line.replace(/^[-*] /, '')
          return (
            <div key={i} className="flex gap-2 my-1 text-text-secondary">
              <span className="text-primary mt-1 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(content) }} />
            </div>
          )
        }
        if (line.trim() === '') {
          return <div key={i} className="my-2" />
        }
        return (
          <p key={i} className="text-text-secondary my-1" dangerouslySetInnerHTML={{ __html: boldify(line) }} />
        )
      })}
    </div>
  )
}

function boldify(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
}

export default function AiReportPage() {
  const today = new Date()
  // Default to last month if early in current month (before 5th)
  const defaultMonth = today.getDate() < 5
    ? (today.getMonth() === 0 ? 12 : today.getMonth())
    : today.getMonth() + 1
  const defaultYear = today.getDate() < 5 && today.getMonth() === 0
    ? today.getFullYear() - 1
    : today.getFullYear()

  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [report, setReport] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastFetchKey, setLastFetchKey] = useState('')

  const fetchReport = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getAiReport(year, month)
      setReport(data.report)
      setLastFetchKey(`${year}-${month}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to generate report. Check that the backend is running.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-fetch on first load
  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    const nextM = month === 12 ? 1 : month + 1
    const nextY = month === 12 ? year + 1 : year
    // Don't go into the future
    if (nextY > today.getFullYear() || (nextY === today.getFullYear() && nextM > today.getMonth() + 1)) return
    setMonth(nextM)
    if (month === 12) setYear(y => y + 1)
  }

  const isDirty = lastFetchKey !== `${year}-${month}`
  const isAtCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/20 flex items-center justify-center">
            <Sparkles size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">AI Financial Report</h1>
            <p className="text-xs text-text-secondary">Monthly insights from your personal financial advisor</p>
          </div>
        </div>

        {/* Month selector */}
        <Card title="">
          <div className="flex items-center justify-between gap-4 -mt-2">
            <button
              onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="text-center">
              <p className="text-base font-bold text-text-primary">{MONTHS[month - 1]} {year}</p>
              <p className="text-xs text-text-secondary">Reporting period</p>
            </div>
            <button
              onClick={nextMonth}
              disabled={isAtCurrentMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="mt-4 flex justify-center">
            <Button
              variant="primary"
              size="sm"
              loading={loading}
              onClick={fetchReport}
              className="gap-2"
            >
              <RefreshCw size={14} />
              {isDirty ? 'Generate Report' : 'Regenerate'}
            </Button>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Report generation failed</p>
              <p className="text-xs mt-1 opacity-80">{error}</p>
              {error.includes('ANTHROPIC_API_KEY') && (
                <p className="text-xs mt-2 text-text-secondary">
                  Set <code className="font-mono text-primary bg-primary/10 px-1 rounded">ANTHROPIC_API_KEY</code> in
                  your backend <code className="font-mono text-primary bg-primary/10 px-1 rounded">.env</code> file,
                  then restart the backend.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <Card title="">
            <div className="flex flex-col items-center gap-4 py-8 -mt-2">
              <div className="w-10 h-10 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-text-primary">Analyzing your finances…</p>
                <p className="text-xs text-text-secondary mt-1">Claude is reviewing your spending, savings, and goals</p>
              </div>
            </div>
          </Card>
        )}

        {/* Report */}
        {!loading && report && (
          <Card title="">
            <div className="-mt-2">
              {/* AI badge */}
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#2d3748]">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/20">
                  <Sparkles size={11} className="text-violet-400" />
                  <span className="text-[11px] font-medium text-violet-400">Generated by Claude AI</span>
                </div>
                <span className="text-xs text-text-secondary">{MONTHS[month - 1]} {year}</span>
              </div>
              <ReportMarkdown text={report} />
            </div>
          </Card>
        )}

        {/* Empty state */}
        {!loading && !report && !error && (
          <Card title="">
            <div className="flex flex-col items-center gap-3 py-8 text-center -mt-2">
              <Sparkles size={32} className="text-violet-400/50" />
              <p className="text-text-secondary text-sm">Click "Generate Report" to get your AI financial report</p>
            </div>
          </Card>
        )}

        {/* Info box */}
        <div className="p-4 rounded-xl bg-surface-2 text-xs text-text-secondary flex flex-col gap-1.5">
          <p className="font-semibold text-text-primary">How it works</p>
          <p>
            Claude reads your real transaction data, account balances, budget performance, and upcoming life events
            — then writes a personalized report like a financial advisor would.
          </p>
          <p className="mt-1">
            Requires <code className="font-mono text-primary">ANTHROPIC_API_KEY</code> set in the backend environment.
          </p>
        </div>
      </div>
    </AppLayout>
  )
}
