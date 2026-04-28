'use client'

import { useState, useEffect, useRef } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { getAiReport, postAiChat } from '@/lib/api'
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight, AlertCircle, Send, FileText, MessageSquare } from 'lucide-react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type Provider = 'claude' | 'openai' | 'ollama'
type Tab = 'report' | 'chat'
type ChatMessage = { role: 'user' | 'assistant'; content: string }

function ReportMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div className="prose prose-invert max-w-none text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i} className="text-base font-bold text-text-primary mt-6 mb-2 first:mt-0">{line.replace('## ', '')}</h2>
        if (line.startsWith('# ')) return <h1 key={i} className="text-lg font-bold text-text-primary mt-4 mb-3">{line.replace('# ', '')}</h1>
        if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold text-text-primary mt-4 mb-1">{line.replace('### ', '')}</h3>
        if (line.startsWith('- ') || line.startsWith('* ')) {
          const content = line.replace(/^[-*] /, '')
          return (
            <div key={i} className="flex gap-2 my-1 text-text-secondary">
              <span className="text-primary mt-1 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(content) }} />
            </div>
          )
        }
        if (line.trim() === '') return <div key={i} className="my-2" />
        return <p key={i} className="text-text-secondary my-1" dangerouslySetInnerHTML={{ __html: boldify(line) }} />
      })}
    </div>
  )
}

function boldify(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
}

function ProviderBadge({ provider }: { provider: string }) {
  if (provider === 'openai') return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
      <Sparkles size={11} className="text-emerald-400" />
      <span className="text-[11px] font-medium text-emerald-400">ChatGPT</span>
    </div>
  )
  if (provider === 'ollama') return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-500/15 border border-orange-500/20">
      <Sparkles size={11} className="text-orange-400" />
      <span className="text-[11px] font-medium text-orange-400">Mongol (local)</span>
    </div>
  )
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-500/15 border border-violet-500/20">
      <Sparkles size={11} className="text-violet-400" />
      <span className="text-[11px] font-medium text-violet-400">Claude AI</span>
    </div>
  )
}

function ProviderToggle({ provider, onChange }: { provider: Provider; onChange: (p: Provider) => void }) {
  const btn = (p: Provider, label: string, active: string, inactive: string) => (
    <button
      onClick={() => onChange(p)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${provider === p ? active : inactive}`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex items-center justify-center gap-2">
      {btn('claude', 'Claude', 'bg-violet-500/20 text-violet-400 border-violet-500/30', 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-transparent')}
      {btn('openai', 'ChatGPT', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-transparent')}
      {btn('ollama', 'Mongol', 'bg-orange-500/20 text-orange-400 border-orange-500/30', 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-transparent')}
    </div>
  )
}

export default function AiReportPage() {
  const today = new Date()
  const defaultMonth = today.getDate() < 5 ? (today.getMonth() === 0 ? 12 : today.getMonth()) : today.getMonth() + 1
  const defaultYear = today.getDate() < 5 && today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  const [tab, setTab] = useState<Tab>('report')
  const [provider, setProvider] = useState<Provider>('claude')

  // Report state
  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [activeProvider, setActiveProvider] = useState<string>('claude')
  const [report, setReport] = useState<string | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')
  const [debugInfo, setDebugInfo] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const [lastFetchKey, setLastFetchKey] = useState('')

  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const fetchReport = async () => {
    setReportLoading(true)
    setReportError('')
    setDebugInfo(null)
    try {
      const data = await getAiReport(year, month, provider)
      setReport(data.report)
      setActiveProvider(data.provider)
      setLastFetchKey(`${year}-${month}-${provider}`)
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: unknown }; message?: string }
      const status = e?.response?.status
      const detail = (e?.response?.data as { detail?: string })?.detail
      setReportError(detail || e?.message || 'Failed to generate report. Check that the backend is running.')
      setDebugInfo(JSON.stringify({ status, response_data: e?.response?.data, message: e?.message }, null, 2))
    } finally {
      setReportLoading(false)
    }
  }

  const sendChat = async () => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory)
    setChatInput('')
    setChatLoading(true)
    try {
      const data = await postAiChat(msg, newHistory.slice(0, -1), provider)
      setChatHistory([...newHistory, { role: 'assistant', content: data.reply }])
    } catch (err: unknown) {
      const e = err as { message?: string }
      setChatHistory([...newHistory, { role: 'assistant', content: `⚠️ Error: ${e?.message || 'Request failed'}` }])
    } finally {
      setChatLoading(false)
    }
  }

  useEffect(() => {
    fetchReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => {
    const nextM = month === 12 ? 1 : month + 1
    const nextY = month === 12 ? year + 1 : year
    if (nextY > today.getFullYear() || (nextY === today.getFullYear() && nextM > today.getMonth() + 1)) return
    setMonth(nextM)
    if (month === 12) setYear(y => y + 1)
  }

  const isDirty = lastFetchKey !== `${year}-${month}-${provider}`
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
            <h1 className="text-xl font-bold text-text-primary">AI Financial Advisor</h1>
            <p className="text-xs text-text-secondary">Monthly reports and financial Q&A powered by AI</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-surface-2 rounded-xl">
          <button
            onClick={() => setTab('report')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'report' ? 'bg-surface-1 text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <FileText size={15} />
            Monthly Report
          </button>
          <button
            onClick={() => setTab('chat')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === 'chat' ? 'bg-surface-1 text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <MessageSquare size={15} />
            Ask AI
          </button>
        </div>

        {/* Provider toggle — shared */}
        <ProviderToggle provider={provider} onChange={setProvider} />

        {/* ── REPORT TAB ── */}
        {tab === 'report' && (
          <>
            <Card title="">
              <div className="flex items-center justify-between gap-4 -mt-2">
                <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
                  <ChevronLeft size={18} />
                </button>
                <div className="text-center">
                  <p className="text-base font-bold text-text-primary">{MONTHS[month - 1]} {year}</p>
                  <p className="text-xs text-text-secondary">Reporting period</p>
                </div>
                <button onClick={nextMonth} disabled={isAtCurrentMonth} className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-30">
                  <ChevronRight size={18} />
                </button>
              </div>
              <div className="mt-3 flex justify-center">
                <Button variant="primary" size="sm" loading={reportLoading} onClick={fetchReport} className="gap-2">
                  <RefreshCw size={14} />
                  {isDirty ? 'Generate Report' : 'Regenerate'}
                </Button>
              </div>
            </Card>

            {reportError && (
              <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Report generation failed</p>
                  <p className="text-xs mt-1 opacity-80">{reportError}</p>
                </div>
              </div>
            )}

            {debugInfo && (
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 text-xs">
                <button onClick={() => setShowDebug(d => !d)} className="w-full flex items-center justify-between px-4 py-2 text-yellow-400 font-medium hover:bg-yellow-500/10 transition-colors rounded-xl">
                  <span>Debug info</span>
                  <span>{showDebug ? '▲ hide' : '▼ show'}</span>
                </button>
                {showDebug && <pre className="px-4 pb-4 text-yellow-300/80 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">{debugInfo}</pre>}
              </div>
            )}

            {reportLoading && (
              <Card title="">
                <div className="flex flex-col items-center gap-4 py-8 -mt-2">
                  <div className="w-10 h-10 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-text-primary">Analyzing your finances…</p>
                    <p className="text-xs text-text-secondary mt-1">Reviewing your spending, savings, and goals</p>
                  </div>
                </div>
              </Card>
            )}

            {!reportLoading && report && (
              <Card title="">
                <div className="-mt-2">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#2d3748]">
                    <ProviderBadge provider={activeProvider} />
                    <span className="text-xs text-text-secondary">{MONTHS[month - 1]} {year}</span>
                  </div>
                  <ReportMarkdown text={report} />
                </div>
              </Card>
            )}

            {!reportLoading && !report && !reportError && (
              <Card title="">
                <div className="flex flex-col items-center gap-3 py-8 text-center -mt-2">
                  <Sparkles size={32} className="text-violet-400/50" />
                  <p className="text-text-secondary text-sm">Click &quot;Generate Report&quot; to get your AI financial report</p>
                </div>
              </Card>
            )}
          </>
        )}

        {/* ── CHAT TAB ── */}
        {tab === 'chat' && (
          <div className="flex flex-col gap-3">
            {/* Message history */}
            <div className="flex flex-col gap-3 min-h-[300px]">
              {chatHistory.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <MessageSquare size={32} className="text-violet-400/40" />
                  <p className="text-text-secondary text-sm">Ask anything about your finances</p>
                  <div className="flex flex-col gap-2 mt-2 w-full max-w-sm">
                    {[
                      'How much did I spend on dining last month?',
                      'Am I on track for my wedding savings goal?',
                      'What are my biggest spending categories?',
                      'How does my savings rate compare to last month?',
                    ].map(q => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q) }}
                        className="text-xs text-left px-3 py-2 rounded-lg bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-1 transition-colors border border-transparent hover:border-border"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-violet-500/20 text-text-primary rounded-br-sm'
                      : 'bg-surface-2 text-text-secondary rounded-bl-sm'
                  }`}>
                    {msg.role === 'assistant'
                      ? <ReportMarkdown text={msg.content} />
                      : msg.content
                    }
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-surface-2 px-4 py-3 rounded-2xl rounded-bl-sm flex gap-1.5 items-center">
                    <span className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-text-secondary rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input */}
            <div className="flex gap-2 items-end sticky bottom-4">
              <div className="flex-1 bg-surface-2 rounded-2xl border border-border focus-within:border-violet-500/50 transition-colors">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder="Ask about your finances…"
                  rows={1}
                  className="w-full bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary resize-none outline-none max-h-32"
                />
              </div>
              <button
                onClick={sendChat}
                disabled={!chatInput.trim() || chatLoading}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={16} />
              </button>
            </div>

            {chatHistory.length > 0 && (
              <button onClick={() => setChatHistory([])} className="text-xs text-text-secondary hover:text-text-primary transition-colors self-center">
                Clear conversation
              </button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
