'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { getSyncConfig, updateSyncConfig, runSync } from '@/lib/api'
import { getToken } from '@/lib/auth'
import type { SyncConfig, SyncResult } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Settings, User, Info, RefreshCw, CheckCircle, AlertCircle, ExternalLink, ArrowLeftRight, ChevronDown, ChevronUp, Home, Monitor } from 'lucide-react'
import { switchProfiles, getAltUser } from '@/lib/auth'

function fmtDate(s?: string | null) {
  if (!s) return 'Never'
  return new Date(s).toLocaleString()
}

export default function SettingsPage() {
  const [username, setUsername] = useState('')

  // Google Sheets sync state
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [sheetId, setSheetId] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(false)
  const [syncSaving, setSyncSaving] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncSaved, setSyncSaved] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [dupesOpen, setDupesOpen] = useState(false)
  const [showGettingStarted, setShowGettingStarted] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        setUsername(payload.sub || '')
      } catch {
        // ignore
      }
    }

    setShowGettingStarted(localStorage.getItem('hideGettingStarted') !== 'true')

    getSyncConfig().then(cfg => {
      setSyncConfig(cfg)
      setSheetId(cfg.sheet_id || '')
      setSyncEnabled(cfg.is_enabled)
    }).catch(() => {
      // Sync not configured yet — fine
    })
  }, [])

  const handleSaveSyncConfig = async () => {
    setSyncSaving(true)
    setSyncError('')
    try {
      const cfg = await updateSyncConfig({ sheet_id: sheetId, is_enabled: syncEnabled })
      setSyncConfig(cfg)
      setSyncSaved(true)
      setTimeout(() => setSyncSaved(false), 2000)
    } catch {
      setSyncError('Failed to save sync settings.')
    } finally {
      setSyncSaving(false)
    }
  }

  const toggleGettingStarted = () => {
    const next = !showGettingStarted
    setShowGettingStarted(next)
    localStorage.setItem('hideGettingStarted', String(!next))
    window.dispatchEvent(new Event('muni:settingsChanged'))
  }

  const handleRunSync = async () => {
    setSyncRunning(true)
    setSyncError('')
    setSyncResult(null)
    setDupesOpen(false)
    try {
      const result = await runSync()
      setSyncResult(result)
      // Refresh config to get updated last_sync_at
      const cfg = await getSyncConfig()
      setSyncConfig(cfg)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSyncError(msg || 'Sync failed. Check that your Sheet ID is correct and the sheet is shared with the service account.')
    } finally {
      setSyncRunning(false)
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-lg">
        <div className="flex items-center gap-3">
          <Settings size={22} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Settings</h1>
        </div>

        {/* Account Info */}
        <Card title="Profiles">
          <div className="flex flex-col gap-3 mt-1">
            <p className="text-xs text-text-secondary">This is a personal app. No passwords — just switch between profiles.</p>
            <div className="flex gap-3">
              {['keaton', 'katherine'].map(name => (
                <div
                  key={name}
                  className={`flex-1 flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                    username === name
                      ? 'bg-primary/10 border-primary/30'
                      : 'bg-surface-2 border-transparent'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${username === name ? 'bg-primary/20' : 'bg-surface'}`}>
                    <User size={15} className={username === name ? 'text-primary' : 'text-text-secondary'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold capitalize ${username === name ? 'text-primary' : 'text-text-secondary'}`}>{name}</p>
                    <p className="text-[10px] text-muted">{username === name ? 'Active' : 'Switch to'}</p>
                  </div>
                </div>
              ))}
            </div>
            {getAltUser() && (
              <Button variant="secondary" size="sm" onClick={() => { switchProfiles(); window.location.reload() }} className="gap-2 self-start">
                <ArrowLeftRight size={13} />
                Switch to {getAltUser()}
              </Button>
            )}
          </div>
        </Card>

        {/* Google Sheets Sync */}
        <Card title="Google Sheets Sync">
          <div className="flex flex-col gap-4 mt-1">
            <p className="text-xs text-text-secondary">
              Connect a Google Sheet to automatically import transactions. The sheet is synced every 30 minutes when enabled, or you can trigger it manually below.
            </p>

            <Input
              label="Google Spreadsheet ID"
              value={sheetId}
              onChange={e => setSheetId(e.target.value)}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            />
            <p className="text-[11px] text-muted -mt-2">
              Find this in the URL: docs.google.com/spreadsheets/d/<strong className="text-text-secondary">SPREADSHEET_ID</strong>/edit
            </p>

            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-10 h-5 rounded-full transition-colors ${syncEnabled ? 'bg-primary' : 'bg-[#2d3748]'}`}
                onClick={() => setSyncEnabled(!syncEnabled)}
              >
                <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${syncEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm text-text-secondary">Auto-sync every 30 minutes</span>
            </label>

            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" loading={syncSaving} onClick={handleSaveSyncConfig}>
                Save Settings
              </Button>
              {syncSaved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
            </div>

            <div className="h-px bg-[#2d3748]" />

            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-text-secondary">
                  Last sync: <span className="text-text-primary">{fmtDate(syncConfig?.last_sync_at)}</span>
                </p>
                {syncConfig?.last_sync_status && (
                  <p className="text-xs text-muted">
                    Status: <span className={syncConfig.last_sync_status === 'ok' ? 'text-green-400' : 'text-danger'}>{syncConfig.last_sync_status}</span>
                    {syncConfig.last_sync_message ? ` — ${syncConfig.last_sync_message}` : ''}
                  </p>
                )}
              </div>
              <Button variant="primary" size="sm" loading={syncRunning} onClick={handleRunSync} disabled={!sheetId}>
                <RefreshCw size={14} />
                Sync Now
              </Button>
            </div>

            {syncResult && (
              <div className="rounded-xl bg-primary/10 border border-primary/20 text-sm flex flex-col gap-1 overflow-hidden">
                <div className="flex items-center gap-2 text-primary font-medium p-3 pb-2">
                  <CheckCircle size={14} /> Sync complete
                </div>
                <div className="text-xs text-text-secondary flex gap-4 px-3 pb-3">
                  <span>Imported: <strong className="text-text-primary">{syncResult.imported}</strong></span>
                  <span>Skipped: <strong className="text-text-primary">{syncResult.skipped}</strong></span>
                  {syncResult.errors.length > 0 && <span>Errors: <strong className="text-danger">{syncResult.errors.length}</strong></span>}
                </div>
                {syncResult.duplicates && syncResult.duplicates.length > 0 && (
                  <div className="border-t border-primary/20">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors"
                      onClick={() => setDupesOpen(o => !o)}
                    >
                      <span>{syncResult.duplicates!.length} skipped as duplicates — tap to review</span>
                      {dupesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {dupesOpen && (
                      <div className="max-h-48 overflow-y-auto border-t border-primary/20">
                        {syncResult.duplicates!.map((d, i) => (
                          <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-primary/10 last:border-0">
                            <div className="min-w-0">
                              <p className="text-xs text-text-primary truncate">{d.description}</p>
                              <p className="text-[10px] text-muted">{d.date} · {d.tab}</p>
                            </div>
                            <span className="text-xs text-danger ml-2 flex-shrink-0">{formatCurrency(Math.abs(d.amount))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {syncResult.errors.length > 0 && (
                  <div className="border-t border-danger/20 px-3 py-2 text-xs text-danger">
                    {syncResult.errors.map((e, i) => <p key={i}>{e}</p>)}
                  </div>
                )}
              </div>
            )}

            {syncError && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{syncError}</span>
              </div>
            )}

            <div className="p-3 rounded-xl bg-surface-2 text-xs text-text-secondary flex flex-col gap-1">
              <span className="font-semibold text-text-primary">Setup reminder</span>
              <span>Share your Google Sheet with the service account email from <code className="font-mono text-primary">backend/credentials/google-sheets-key.json</code> (the <code>client_email</code> field).</span>
              <a
                href="https://docs.google.com/spreadsheets"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline mt-1"
              >
                <ExternalLink size={11} /> Open Google Sheets
              </a>
            </div>
          </div>
        </Card>

        {/* Display Preferences */}
        <Card title="Display Preferences">
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary flex items-center gap-2">
                  <Monitor size={14} className="text-text-secondary" />
                  Show Getting Started
                </p>
                <p className="text-xs text-text-secondary mt-0.5">Display "Get Started" in the sidebar navigation</p>
              </div>
              <div
                className={`w-10 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${showGettingStarted ? 'bg-primary' : 'bg-[#2d3748]'}`}
                onClick={toggleGettingStarted}
              >
                <div className={`w-4 h-4 rounded-full bg-white m-0.5 transition-transform ${showGettingStarted ? 'translate-x-5' : 'translate-x-0'}`} />
              </div>
            </div>
            <p className="text-xs text-muted -mt-2">
              Your checklist progress is always saved — this only controls whether it appears in the sidebar.
            </p>
          </div>
        </Card>

        {/* Home Buying Resources */}
        <Card>
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setResourcesOpen(o => !o)}
          >
            <div className="flex items-center gap-2">
              <Home size={15} className="text-blue-400" />
              <span className="text-sm font-semibold text-text-primary">Home Buying Resources</span>
              <span className="text-[10px] text-text-secondary">Official sources for MD programs</span>
            </div>
            {resourcesOpen ? <ChevronUp size={15} className="text-muted" /> : <ChevronDown size={15} className="text-muted" />}
          </button>
          {resourcesOpen && (
            <div className="mt-3 pt-3 border-t border-[#2d3748] flex flex-col gap-2">
              {[
                { label: 'Maryland Mortgage Program (MMP)', url: 'https://mmp.maryland.gov/', desc: 'Official state DPA program — eligibility, loan types, income limits' },
                { label: 'MD DHCD — Homeownership Programs', url: 'https://dhcd.maryland.gov/Homeownership/Pages/MMP.aspx', desc: 'MD Dept of Housing & Community Development hub' },
                { label: 'Frederick County HAP', url: 'https://www.frederickcountymd.gov/8057/Homeownership-Assistance-Program', desc: '$12,000 county down payment assistance grant details' },
                { label: 'Find an MMP Participating Lender', url: 'https://mmp.maryland.gov/Pages/find-a-lender.aspx', desc: 'Only MMP-approved lenders can offer MMP loans + Partner Match' },
                { label: 'MD Transfer & Recordation Tax', url: 'https://dat.maryland.gov/realproperty/pages/transfer-and-recordation-tax.aspx', desc: 'State transfer tax rates and first-time buyer exemptions' },
                { label: 'CFPB: Buying a House Guide', url: 'https://www.consumerfinance.gov/owning-a-home/', desc: 'Federal guide to the mortgage process, closing costs, affordability' },
                { label: 'Frederick County Property Search (SDAT)', url: 'https://sdat.dat.maryland.gov/RealProperty/Pages/default.aspx', desc: 'Look up any MD property assessment, ownership, and tax records' },
                { label: 'Zillow — Frederick County MD', url: 'https://www.zillow.com/frederick-county-md/', desc: 'Current listings, price trends, and area market data' },
              ].map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2.5 p-2.5 rounded-xl border border-[#2d3748] bg-surface-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors group"
                >
                  <ExternalLink size={11} className="text-blue-400 flex-shrink-0 mt-0.5 group-hover:text-blue-300" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary group-hover:text-blue-300">{r.label}</p>
                    <p className="text-[10px] text-text-secondary mt-0.5">{r.desc}</p>
                  </div>
                </a>
              ))}
              <p className="text-[10px] text-muted pt-1">
                Income limits and program details verified as of early 2026. Confirm current limits with an MMP-approved lender before applying.
              </p>
            </div>
          )}
        </Card>

        {/* App Info */}
        <Card title="About">
          <div className="flex flex-col gap-2 text-sm text-text-secondary">
            <div className="flex items-center gap-2">
              <Info size={14} />
              <span>Muni v0.3 — Self-hosted personal finance tool</span>
            </div>
          </div>
        </Card>
      </div>
    </AppLayout>
  )
}
