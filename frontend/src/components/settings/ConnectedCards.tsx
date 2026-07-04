'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import {
  getConnectedStatus, claimSimplefinToken, updateConnectedAccount, updateDigestSettings,
  updateSpendChannels, getConnectedToday, sendSpendDigestNow, disconnectSimplefin,
  ConnectedStatus, SpendDigestPreview,
} from '@/lib/api'
import { CreditCard, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Send, Trash2, Eye } from 'lucide-react'

const OWNER_OPTIONS = ['keaton', 'katherine', 'joint']

function fmtDate(s?: string | null) {
  if (!s) return 'Never'
  return new Date(s).toLocaleString()
}

export default function ConnectedCards() {
  const [status, setStatus] = useState<ConnectedStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<SpendDigestPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [sentOk, setSentOk] = useState(false)
  const [channels, setChannels] = useState<Record<string, string>>({})
  const [channelsSaving, setChannelsSaving] = useState(false)
  const [channelsSaved, setChannelsSaved] = useState(false)

  const applyStatus = (s: ConnectedStatus) => {
    setStatus(s)
    setChannels(Object.fromEntries(Object.entries(s.user_channels || {}).map(([u, c]) => [u, c || ''])))
  }

  const refresh = () => getConnectedStatus().then(applyStatus).catch(() => setStatus({ connected: false }))

  useEffect(() => {
    getConnectedStatus()
      .then(applyStatus)
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false))
  }, [])

  const handleClaim = async () => {
    setClaiming(true)
    setError('')
    try {
      const s = await claimSimplefinToken(token.trim())
      applyStatus(s)
      setToken('')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to claim the setup token.')
    } finally {
      setClaiming(false)
    }
  }

  const handlePatch = async (id: number, data: { owner?: string; enabled?: boolean }) => {
    try {
      await updateConnectedAccount(id, data)
      await refresh()
    } catch {
      setError('Failed to update account.')
    }
  }

  const handlePreview = async () => {
    setPreviewing(true)
    setError('')
    try {
      setPreview(await getConnectedToday())
    } catch {
      setError('Failed to pull today’s activity from SimpleFIN.')
    } finally {
      setPreviewing(false)
    }
  }

  const handleSend = async () => {
    setSending(true)
    setError('')
    setSentOk(false)
    try {
      await sendSpendDigestNow()
      setSentOk(true)
      setTimeout(() => setSentOk(false), 3000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to send the digest to Slack.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card title="Connected Cards & Daily Spend Text">
      <div className="flex flex-col gap-4 mt-1">
        <p className="text-xs text-text-secondary">
          Link your real credit cards and checking account (read-only, via SimpleFIN) to get an
          end-of-day Slack message listing everything you bought and the day&apos;s total — so you and
          Kat can enter each purchase into your sheets. <strong className="text-text-primary">Nothing
          is imported into Muni</strong>: Google Sheets stay the source of truth for transactions.
        </p>

        {loading ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : !status?.connected ? (
          <>
            <div className="p-3 rounded-xl bg-surface-2 text-xs text-text-secondary flex flex-col gap-1.5">
              <span className="font-semibold text-text-primary">Setup (once, ~5 minutes)</span>
              <span>1. Create a SimpleFIN Bridge account (~$1.50/mo) and link your banks there.</span>
              <span>2. On the Bridge site, create a <strong className="text-text-primary">setup token</strong> for &quot;Muni&quot;.</span>
              <span>3. Paste the token below — it&apos;s exchanged once for a permanent read-only feed.</span>
              <a href="https://bridge.simplefin.org" target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-1 text-primary hover:underline mt-1">
                <ExternalLink size={11} /> Open SimpleFIN Bridge
              </a>
            </div>
            <textarea
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste your SimpleFIN setup token here"
              rows={3}
              className="w-full rounded-xl bg-surface-2 border border-[#2d3748] p-3 text-xs text-text-primary font-mono focus:outline-none focus:border-primary/50 resize-none"
            />
            <Button variant="primary" size="sm" loading={claiming} disabled={!token.trim()} onClick={handleClaim} className="self-start gap-2">
              <CreditCard size={14} /> Connect
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-text-secondary flex items-center gap-1.5">
                  <CheckCircle size={12} className="text-green-400" /> Connected
                  <span className="text-muted">· last sync {fmtDate(status.last_synced_at)}</span>
                </p>
                <p className="text-xs text-muted">
                  Digest → <span className="text-text-primary">{status.digest_channel}</span> daily at{' '}
                  <span className="text-text-primary">{status.digest_time}</span>
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-text-secondary">Daily digest</span>
                <div
                  className={`w-10 h-5 rounded-full transition-colors ${status.digest_enabled ? 'bg-primary' : 'bg-[#2d3748]'}`}
                  onClick={async () => {
                    await updateDigestSettings(!status.digest_enabled)
                    refresh()
                  }}
                >
                  <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${status.digest_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </label>
            </div>

            {!status.slack_configured && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>Slack isn&apos;t configured on the server yet (<code className="font-mono">SLACK_BOT_TOKEN</code> in the backend .env) — the digest can&apos;t send until it is.</span>
              </div>
            )}

            {status.last_error && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-start gap-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>Last feed error: {status.last_error}</span>
              </div>
            )}

            {/* Account list */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-text-primary">Accounts in the feed</p>
              {(status.accounts || []).length === 0 && (
                <p className="text-xs text-muted">No accounts yet — link banks on the SimpleFIN Bridge site, then sync.</p>
              )}
              {(status.accounts || []).map(a => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 border border-[#2d3748]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{a.nickname || a.name}</p>
                    <p className="text-[10px] text-muted truncate">
                      {a.org_name}{a.balance != null ? ` · $${Number(a.balance).toLocaleString()}` : ''}
                    </p>
                  </div>
                  <select
                    value={a.owner || 'joint'}
                    onChange={e => handlePatch(a.id, { owner: e.target.value })}
                    className="rounded-lg bg-surface border border-[#2d3748] text-xs text-text-primary px-2 py-1.5 capitalize focus:outline-none"
                  >
                    {OWNER_OPTIONS.map(o => <option key={o} value={o} className="capitalize">{o}</option>)}
                  </select>
                  <div
                    title={a.enabled ? 'Included in digest' : 'Excluded from digest'}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${a.enabled ? 'bg-primary' : 'bg-[#2d3748]'}`}
                    onClick={() => handlePatch(a.id, { enabled: !a.enabled })}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${a.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                </div>
              ))}
            </div>

            {/* Personal channels: each person's purchases go to their own channel;
                joint + household total stay in the main digest channel */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-text-primary">Personal channels</p>
              <p className="text-[11px] text-muted -mt-1">
                Give each person their own Slack channel to get <em>only their</em> purchases.
                Leave blank to keep them in {status.digest_channel}. Joint accounts and the
                household total always post to {status.digest_channel}.
              </p>
              {Object.keys(channels).map(u => (
                <div key={u} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary capitalize w-20">{u}</span>
                  <input
                    value={channels[u]}
                    onChange={e => setChannels(c => ({ ...c, [u]: e.target.value }))}
                    placeholder={`#spend-${u === 'katherine' ? 'kat' : u}`}
                    className="flex-1 rounded-lg bg-surface-2 border border-[#2d3748] px-3 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-primary/50"
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary" size="sm" loading={channelsSaving}
                  onClick={async () => {
                    setChannelsSaving(true)
                    setError('')
                    try {
                      await updateSpendChannels(Object.fromEntries(Object.entries(channels).map(([u, c]) => [u, c.trim() || null])))
                      await refresh()
                      setChannelsSaved(true)
                      setTimeout(() => setChannelsSaved(false), 2000)
                    } catch {
                      setError('Failed to save personal channels.')
                    } finally {
                      setChannelsSaving(false)
                    }
                  }}
                >
                  Save Channels
                </Button>
                {channelsSaved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
              </div>
              <p className="text-[10px] text-muted">
                Create each channel in Slack and <code className="font-mono">/invite</code> the bot (Athena) to it, or the digest can&apos;t post there.
                <strong className="text-text-secondary"> Private channel?</strong> Use its Channel ID instead of the name
                (channel name → About tab → Channel ID, looks like <code className="font-mono">C0123ABCD</code>).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" loading={previewing} onClick={handlePreview} className="gap-2">
                <Eye size={13} /> Preview today
              </Button>
              <Button variant="primary" size="sm" loading={sending} onClick={handleSend} className="gap-2">
                <Send size={13} /> Send to Slack now
              </Button>
              {sentOk && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Sent</span>}
              <Button
                variant="ghost" size="sm"
                onClick={async () => {
                  if (!window.confirm('Disconnect the card feed? (No Muni transactions are affected.)')) return
                  await disconnectSimplefin()
                  setPreview(null)
                  refresh()
                }}
                className="ml-auto text-danger hover:text-danger border-danger/30 hover:bg-danger/10 gap-1.5"
              >
                <Trash2 size={13} /> Disconnect
              </Button>
            </div>

            {preview && (
              <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 flex flex-col gap-1">
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <RefreshCw size={12} /> Today so far — ${preview.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
                {preview.errors.map((e, i) => <p key={i} className="text-xs text-danger">{e}</p>)}
                {preview.groups.length === 0 && preview.errors.length === 0 && (
                  <p className="text-xs text-text-secondary">No card activity yet today 🎉</p>
                )}
                {preview.groups.map(g => (
                  <div key={g.label} className="mt-1">
                    <p className="text-xs font-semibold text-text-primary">{g.label} — ${g.spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    {g.txns.map((t, i) => (
                      <p key={i} className="text-xs text-text-secondary pl-2">
                        ${t.amount.toFixed(2)} — {t.description} <span className="text-muted">({t.account}){t.pending ? ' ⏳' : ''}</span>
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Card>
  )
}
