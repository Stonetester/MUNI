'use client'

import { useState, useEffect, useRef } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { getAiReport, postAiChat, listChatSessions, getChatSession, deleteChatSession, listOllamaModels, ChatSessionSummary, ReportType, REPORT_TYPE_LABELS } from '@/lib/api'
import { useViewMode } from '@/lib/viewMode'
import { Sparkles, RefreshCw, ChevronLeft, ChevronRight, AlertCircle, Send, FileText, MessageSquare, Zap, GraduationCap, Users, User, History, Plus, Trash2, X } from 'lucide-react'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type Provider = 'claude' | 'openai' | 'ollama'
type Tab = 'report' | 'chat'
type ChatMessage = { role: 'user' | 'assistant'; content: string; modelUsed?: string }

// Inline: **bold**, *italic*, `code`. Run bold first so * inside ** isn't mis-parsed.
function inlineMd(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-text-primary font-semibold">$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em class="text-text-secondary/90 italic">$2</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-black/30 text-[0.85em] text-violet-300 font-mono">$1</code>')
}

// Block-level markdown renderer: headers, tables, blockquotes, ---, bullet + numbered
// lists, paragraphs. Self-contained (no deps), styled for the dark theme.
function ReportMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l)
  const isDivider = (l: string) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes('-')
  const splitRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

  while (i < lines.length) {
    const line = lines[i]

    // Table: a pipe row followed by a |---|---| divider
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++ }
      blocks.push(
        <div key={`t${i}`} className="my-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-2">
                {header.map((h, hi) => (
                  <th key={hi} className="px-3 py-2 text-left font-semibold text-text-primary border-b border-border" dangerouslySetInnerHTML={{ __html: inlineMd(h) }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-border/50 last:border-0">
                  {header.map((_, ci) => (
                    <td key={ci} className={`px-3 py-2 ${ci === 0 ? 'text-text-secondary' : 'text-text-primary'}`} dangerouslySetInnerHTML={{ __html: inlineMd(r[ci] ?? '') }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push(<hr key={`hr${i}`} className="my-3 border-border" />); i++; continue }

    // Headers
    if (line.startsWith('### ')) { blocks.push(<h3 key={i} className="text-sm font-semibold text-text-primary mt-4 mb-1" dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(4)) }} />); i++; continue }
    if (line.startsWith('## ')) { blocks.push(<h2 key={i} className="text-base font-bold text-text-primary mt-5 mb-2 first:mt-0" dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(3)) }} />); i++; continue }
    if (line.startsWith('# ')) { blocks.push(<h1 key={i} className="text-lg font-bold text-text-primary mt-4 mb-3 first:mt-0" dangerouslySetInnerHTML={{ __html: inlineMd(line.slice(2)) }} />); i++; continue }

    // Blockquote (consume consecutive > lines)
    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, '')); i++ }
      blocks.push(
        <div key={`q${i}`} className="my-2 border-l-2 border-violet-500/40 pl-3 text-text-secondary">
          {quote.map((q, qi) => <p key={qi} className="my-0.5 text-[13px]" dangerouslySetInnerHTML={{ __html: inlineMd(q) }} />)}
        </div>
      )
      continue
    }

    // Numbered list item
    const numMatch = line.match(/^\s*(\d+)\.\s+(.*)$/)
    if (numMatch) {
      blocks.push(
        <div key={i} className="flex gap-2 my-1 text-text-secondary">
          <span className="text-primary font-semibold shrink-0">{numMatch[1]}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineMd(numMatch[2]) }} />
        </div>
      )
      i++; continue
    }

    // Bullet (supports a little indentation for sub-bullets)
    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/)
    if (bulletMatch) {
      const indent = bulletMatch[1].length >= 2 ? 'ml-4' : ''
      blocks.push(
        <div key={i} className={`flex gap-2 my-1 text-text-secondary ${indent}`}>
          <span className="text-primary mt-1 shrink-0">•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineMd(bulletMatch[2]) }} />
        </div>
      )
      i++; continue
    }

    // Blank line
    if (line.trim() === '') { blocks.push(<div key={i} className="h-2" />); i++; continue }

    // Paragraph
    blocks.push(<p key={i} className="text-text-secondary my-1 leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />)
    i++
  }

  return <div className="max-w-none text-sm leading-relaxed">{blocks}</div>
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

function ProviderToggle({ provider, onChange, localLabel = 'Mongol' }: { provider: Provider; onChange: (p: Provider) => void; localLabel?: string }) {
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
      {btn('ollama', localLabel, 'bg-orange-500/20 text-orange-400 border-orange-500/30', 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-transparent')}
      {btn('claude', 'Claude', 'bg-violet-500/20 text-violet-400 border-violet-500/30', 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-transparent')}
      {btn('openai', 'ChatGPT', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', 'text-text-secondary hover:text-text-primary hover:bg-surface-2 border-transparent')}
    </div>
  )
}

export default function AiReportPage() {
  const today = new Date()
  const defaultMonth = today.getDate() < 5 ? (today.getMonth() === 0 ? 12 : today.getMonth()) : today.getMonth() + 1
  const defaultYear = today.getDate() < 5 && today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()

  const { mode } = useViewMode()
  const isJoint = mode === 'joint'

  const [tab, setTab] = useState<Tab>('report')
  const [provider, setProvider] = useState<Provider>('claude')
  // Chat defaults to the local model (Mongol 14b); report keeps the shared provider toggle.
  const [chatProvider, setChatProvider] = useState<Provider>('ollama')
  // Local AI model picker (only used when chatProvider === 'ollama')
  const [ollamaModels, setOllamaModels] = useState<{ name: string; label?: string }[]>([])
  const [localModel, setLocalModel] = useState<string>('')

  // Report state
  const [year, setYear] = useState(defaultYear)
  const [month, setMonth] = useState(defaultMonth)
  const [reportType, setReportType] = useState<ReportType>('monthly')
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

  // Saved chat sessions
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const loadSessions = async () => {
    try { setSessions(await listChatSessions()) } catch { /* non-fatal */ }
  }

  const newChat = () => {
    setChatHistory([])
    setCurrentSessionId(null)
    setShowHistory(false)
  }

  const openSession = async (id: number) => {
    try {
      const s = await getChatSession(id)
      setChatHistory(s.messages.map(m => ({ role: m.role, content: m.content, modelUsed: m.model_used ?? undefined })))
      setCurrentSessionId(s.id)
      setShowHistory(false)
    } catch { /* ignore */ }
  }

  const removeSession = async (id: number) => {
    try {
      await deleteChatSession(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (id === currentSessionId) newChat()
    } catch { /* ignore */ }
  }

  const fetchReport = async () => {
    setReportLoading(true)
    setReportError('')
    setDebugInfo(null)
    try {
      const data = await getAiReport(year, month, provider, reportType, isJoint)
      setReport(data.report)
      setActiveProvider(data.provider)
      setLastFetchKey(`${year}-${month}-${provider}-${reportType}-${isJoint}`)
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

  const sendChat = async (escalate = false) => {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: msg }]
    setChatHistory(newHistory)
    setChatInput('')
    setChatLoading(true)
    try {
      const data = await postAiChat(msg, newHistory.slice(0, -1), chatProvider, { escalate, joint: isJoint, sessionId: currentSessionId, model: chatProvider === 'ollama' && localModel ? localModel : undefined })
      setChatHistory([...newHistory, { role: 'assistant', content: data.reply, modelUsed: data.model_used }])
      setCurrentSessionId(data.session_id)
      loadSessions()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setChatHistory([...newHistory, { role: 'assistant', content: `⚠️ Error: ${e?.message || 'Request failed'}` }])
    } finally {
      setChatLoading(false)
    }
  }

  // Report is NOT auto-generated — it runs only when the user clicks Generate.

  // Load saved sessions + available local models the first time the chat tab is opened.
  useEffect(() => {
    if (tab === 'chat') {
      loadSessions()
      listOllamaModels()
        .then(({ default: def, models }) => {
          setOllamaModels(models)
          const names = models.map(m => m.name)
          setLocalModel(prev => prev || (names.includes(def) ? def : names[0] || def))
        })
        .catch(() => { /* Mongol asleep — keep backend default */ })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

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

  const isDirty = lastFetchKey !== `${year}-${month}-${provider}-${reportType}-${isJoint}`
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
            <p className="text-xs text-text-secondary">Monthly reports, plus a finance tutor that answers with your real numbers</p>
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
            Report
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

        {/* Provider toggle — report uses `provider`, chat uses `chatProvider` (local default) */}
        {tab === 'report'
          ? <ProviderToggle provider={provider} onChange={setProvider} localLabel="Mongol" />
          : (
            <div className="flex flex-col items-center gap-2">
              <ProviderToggle provider={chatProvider} onChange={setChatProvider} localLabel="Local AI" />
              {chatProvider === 'ollama' && ollamaModels.length > 0 && (
                <select
                  value={localModel}
                  onChange={e => setLocalModel(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border outline-none focus:border-violet-500/50 [color-scheme:dark]"
                  style={{ backgroundColor: '#242938', color: '#f1f5f9' }}
                >
                  {ollamaModels.map(m => (
                    <option key={m.name} value={m.name} style={{ backgroundColor: '#242938', color: '#f1f5f9' }}>{m.label || m.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

        {/* Scope indicator — which numbers the tutor is grounded in (follows the global Solo/Joint toggle) */}
        {tab === 'chat' && (
          <div className="flex justify-center -mt-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
              isJoint
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/25'
                : 'bg-surface-2 text-text-secondary border-border'
            }`}>
              {isJoint ? <Users size={11} /> : <User size={11} />}
              {isJoint ? 'Household focus — both of you' : 'Personal focus — household data still available'}
            </span>
          </div>
        )}

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
              {/* Report type picker — each type gets its own data pack + depth */}
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setReportType(t)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                      reportType === t
                        ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                        : 'bg-surface-2 text-text-secondary border-border hover:text-text-primary'
                    }`}
                  >
                    {REPORT_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] text-text-secondary">
                {isJoint ? 'Household report — both of you plus combined totals' : 'Solo report — just your numbers'}
              </p>
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
            {/* History / New chat toolbar */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => { setShowHistory(v => !v); if (!showHistory) loadSessions() }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  showHistory ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' : 'text-text-secondary hover:text-text-primary border-border hover:bg-surface-2'
                }`}
              >
                <History size={14} /> Past chats{sessions.length ? ` (${sessions.length})` : ''}
              </button>
              <button
                onClick={newChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
              >
                <Plus size={14} /> New chat
              </button>
            </div>

            {/* Collapsible history panel */}
            {showHistory && (
              <div className="rounded-xl border border-border bg-surface-2 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-semibold text-text-primary">Past chat sessions</span>
                  <button onClick={() => setShowHistory(false)} className="text-text-secondary hover:text-text-primary"><X size={14} /></button>
                </div>
                {sessions.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-text-secondary">No saved chats yet. Start a conversation and it&apos;ll appear here.</p>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {sessions.map(s => (
                      <div key={s.id} className={`flex items-center gap-2 px-3 py-2.5 hover:bg-surface-1 transition-colors ${s.id === currentSessionId ? 'bg-violet-500/5' : ''}`}>
                        <button onClick={() => openSession(s.id)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm text-text-primary truncate">{s.title}</p>
                          <p className="text-[10px] text-text-secondary flex items-center gap-1.5 mt-0.5">
                            <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                            <span>· {s.message_count} msg</span>
                            {s.is_joint
                              ? <span className="inline-flex items-center gap-0.5 text-blue-400"><Users size={9} /> household</span>
                              : <span className="inline-flex items-center gap-0.5"><User size={9} /> you</span>}
                            {s.model_used && <span className="truncate">· {s.model_used.includes('claude') ? 'Claude' : s.model_used}</span>}
                          </p>
                        </button>
                        <button onClick={() => removeSession(s.id)} title="Delete" className="shrink-0 p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Message history */}
            <div className="flex flex-col gap-3 min-h-[300px]">
              {chatHistory.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <GraduationCap size={32} className="text-violet-400/40" />
                  <p className="text-text-secondary text-sm">Ask about your finances — or learn a term. Answered with your real numbers.</p>
                  <div className="flex flex-col gap-2 mt-2 w-full max-w-sm">
                    {[
                      'What is Coast FI, and where am I on it?',
                      'Explain the 4% safe withdrawal rule using my numbers',
                      'What do I need for a 20% down payment, and what is PMI?',
                      'Roth vs traditional IRA — which fits my situation?',
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
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
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
                  {msg.role === 'assistant' && msg.modelUsed && (
                    <span className="mt-1 px-2 text-[10px] text-text-secondary/70">
                      {msg.modelUsed.includes('→') || msg.modelUsed === 'claude'
                        ? <span className="inline-flex items-center gap-1"><Zap size={9} className="text-violet-400" />{msg.modelUsed === 'claude' ? 'Claude' : `${msg.modelUsed.split('→')[0]} → escalated to Claude`}</span>
                        : msg.modelUsed === 'openai' ? 'ChatGPT' : msg.modelUsed}
                    </span>
                  )}
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
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(false) } }}
                  placeholder="Ask a question or a finance term…"
                  rows={1}
                  className="w-full bg-transparent px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary resize-none outline-none max-h-32"
                />
              </div>
              {/* Escalate: force the strong model (only meaningful when local is selected) */}
              {chatProvider === 'ollama' && (
                <button
                  onClick={() => sendChat(true)}
                  disabled={!chatInput.trim() || chatLoading}
                  title="Ask the smart model (Claude)"
                  className="h-10 px-2.5 flex items-center gap-1 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  <Zap size={15} />
                  <span className="text-xs font-medium hidden sm:inline">Smart</span>
                </button>
              )}
              <button
                onClick={() => sendChat(false)}
                disabled={!chatInput.trim() || chatLoading}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={16} />
              </button>
            </div>

            <p className="text-[11px] text-text-secondary/70 text-center -mt-1">
              {chatProvider === 'ollama'
                ? `${localModel || 'Local AI'} on Mongol answers; hard questions auto-escalate to Claude. Tap ⚡ Smart to force it.`
                : 'Answered grounded in your real MUNI numbers.'}
            </p>

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
